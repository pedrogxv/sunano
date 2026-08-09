import "server-only"

import { coerceAccountTier, type AccountTier } from "@/lib/account-tier"
import { canEditComment } from "@/lib/comment-edit"
import type { CommentMention } from "@/components/comments/types"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { buildProfileMap } from "@/lib/server/repositories/profile-enrichment"
import { creditCommentCreationAura } from "@/lib/server/repositories/aura-repository"

/**
 * Repositório de Blog — única porta de acesso à tabela `blog_posts` para
 * leitura pública. Os Server Components e o endpoint `/api/blog` delegam aqui.
 */

export type RepositoryResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

export type BlogAuthor = {
  display_name: string | null
  avatar_url: string | null
  email: string | null
  role: "admin" | "moderator" | "webmaster" | null
} | null

/**
 * Avatar/tier "real" do autor, puxado do perfil público (`user_profiles`)
 * quando o admin também tem uma conta de membro — é de lá que vem o GIF
 * animado de VIP, já que `admin_profiles` não tem conceito de tier.
 */
export type AuthorPublicProfile = {
  avatar_url: string | null
  account_tier: AccountTier
  display_slug: string | null
} | null

export type BlogPeripheralRef = {
  id?: string
  name: string
  brand: string
  category?: string | null
}

export type BlogPostType = "news" | "review"

export type BlogListPost = {
  id: string
  title: string
  slug: string
  post_type: BlogPostType
  author_id: string | null
  is_featured: boolean
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  video_url: string | null
  read_time_minutes: number | null
  created_at: string
  comment_count: number
  admin_profiles: BlogAuthor
  author_profile: AuthorPublicProfile
  peripherals: BlogPeripheralRef[] | null
}

export type BlogPostDetail = {
  id: string
  title: string
  slug: string
  post_type: BlogPostType
  peripheral_id: string | null
  author_id: string | null
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  video_url: string | null
  content: string
  read_time_minutes: number | null
  created_at: string
  comment_count: number
  admin_profiles: BlogAuthor
  peripherals: BlogPeripheralRef[] | null
}

export type RelatedBlogPost = {
  id: string
  title: string
  slug: string
  cover_thumbnail_url: string | null
  cover_image_url: string | null
  created_at: string
}

export type BlogCommentDetail = {
  id: string
  body: string
  author_name: string
  user_id: string | null
  parent_comment_id: string | null
  created_at: string
  is_edited: boolean
  aura_count: number
  /** Até 2 URLs do bucket `comments`. */
  image_urls: string[]
  /** Perfis @mencionados no comentário — só o necessário pra exibir o link. */
  mentions: CommentMention[]
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_display_slug: string | null
  author_streak: number
}

const LIST_COLUMNS =
  "id, title, slug, post_type, author_id, is_featured, excerpt, cover_image_url, cover_thumbnail_url, video_url, read_time_minutes, created_at, admin_profiles(display_name, avatar_url, email, role), peripherals(id, name, brand_id, brands(name), category)"

const DETAIL_COLUMNS =
  "id, title, slug, post_type, peripheral_id, author_id, excerpt, cover_image_url, cover_thumbnail_url, video_url, content, read_time_minutes, created_at, admin_profiles(display_name, avatar_url, email, role), peripherals(id, name, brand_id, brands(name), category)"

/**
 * Achata o embed `peripherals(brand_id, brands(name))` do PostgREST em
 * `BlogPeripheralRef.brand` — mantém o shape público inalterado para quem só
 * exibe `peripheral.brand` como string.
 */
function normalizePeripheralRefs<T extends { peripherals: unknown }>(post: T): T {
  const raw = post.peripherals as
    | Array<{ id?: string; name: string; brand_id?: string; brands?: { name: string } | { name: string }[] | null; category?: string | null }>
    | null
  if (!raw) return post
  const peripherals: BlogPeripheralRef[] = raw.map((p) => {
    const brandRow = Array.isArray(p.brands) ? p.brands[0] : p.brands
    return { id: p.id, name: p.name, brand: brandRow?.name ?? "", category: p.category }
  })
  return { ...post, peripherals }
}

// Variantes sem `post_type`, usadas como fallback caso a migração
// `blog_post_type.sql` ainda não tenha sido aplicada.
const LIST_COLUMNS_LEGACY = LIST_COLUMNS.replace("post_type, ", "")
const DETAIL_COLUMNS_LEGACY = DETAIL_COLUMNS.replace("post_type, ", "")

/** Indica que o erro veio de a coluna `post_type` ainda não existir. */
function isMissingPostType(message: string | null | undefined) {
  return Boolean(message && message.includes("post_type"))
}

/** Indica que o erro veio de uma coluna opcional específica ainda não existir. */
function isMissingColumn(message: string | null | undefined, column: string) {
  return Boolean(message && message.includes(column))
}

/** Remove `coluna, ` de uma lista de colunas — usado para retry gradual. */
function withoutColumn(columns: string, column: string) {
  return columns.replace(`${column}, `, "")
}

/**
 * O e-mail do autor é buscado só para derivar um nome de exibição de
 * fallback (quando `display_name` está vazio) — nunca deve chegar à
 * resposta pública da API, senão qualquer visitante consegue coletar o
 * e-mail de admins/editores. Resolve o fallback aqui e descarta o e-mail.
 */
function stripAuthorEmail<T extends { admin_profiles: BlogAuthor }>(post: T): T {
  if (!post.admin_profiles) return post
  const displayName =
    post.admin_profiles.display_name?.trim() ||
    post.admin_profiles.email?.split("@")[0] ||
    null
  return {
    ...post,
    admin_profiles: { ...post.admin_profiles, display_name: displayName, email: null },
  }
}

/**
 * Conta comentários visíveis por post. Resiliente: se a tabela `blog_comments`
 * ainda não existir (migração não aplicada), devolve um mapa vazio em vez de
 * quebrar a listagem.
 */
async function countCommentsByPost(postIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  if (postIds.length === 0) return counts
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("blog_comments")
    .select("post_id")
    .in("post_id", postIds)
    .eq("is_hidden", false)
  if (error) {
    console.error("[blog-repository] countCommentsByPost:", error.message)
    return counts
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    counts[row.post_id] = (counts[row.post_id] ?? 0) + 1
  }
  return counts
}

/**
 * Perfis públicos (`user_profiles`) dos autores, indexados por id. É de lá
 * que vem o `account_tier` usado para decidir se o avatar do autor anima
 * como GIF — `admin_profiles` não tem esse conceito.
 */
async function getAuthorProfiles(authorIds: string[]): Promise<Record<string, AuthorPublicProfile>> {
  const map: Record<string, AuthorPublicProfile> = {}
  const ids = [...new Set(authorIds.filter(Boolean))]
  if (ids.length === 0) return map
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select("id, avatar_url, account_tier, display_slug")
    .in("id", ids)
  if (error) {
    console.error("[blog-repository] getAuthorProfiles:", error.message)
    return map
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const row of (data ?? []) as any[]) {
    map[row.id] = {
      avatar_url: row.avatar_url ?? null,
      account_tier: coerceAccountTier(row.account_tier),
      display_slug: row.display_slug ?? null,
    }
  }
  return map
}

/** Slugs + data de todos os posts publicados — usado só pelo `app/sitemap.ts`, sem joins. */
export async function listAllBlogSlugsForSitemap(): Promise<{ slug: string; updated_at: string }[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("blog_posts")
    .select("slug, created_at")
    .eq("is_published", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[blog-repository] listAllBlogSlugsForSitemap:", error)
    return []
  }
  return (data ?? []).map((p) => ({ slug: p.slug, updated_at: p.created_at }))
}

/** Lista posts publicados, opcionalmente filtrando por periférico. */
export async function listPublishedPosts(peripheralId?: string | null): Promise<BlogListPost[]> {
  const db = createSupabaseAdminClient()
  const runQuery = (columns: string) => {
    let query = db
      .from("blog_posts")
      .select(columns)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
      // Sem paginação na UI ainda — limita para não trazer o blog inteiro a
      // cada carregamento de página conforme o volume de posts cresce.
      .limit(60)
    if (peripheralId) query = query.eq("peripheral_id", peripheralId)
    return query
  }

  let columns = LIST_COLUMNS
  let { data, error } = await runQuery(columns)
  if (error && isMissingPostType(error.message)) {
    columns = LIST_COLUMNS_LEGACY
    ;({ data, error } = await runQuery(columns))
  }
  // Fallback: migração `20260803_blog_featured_posts.sql` ainda não aplicada.
  if (error && isMissingColumn(error.message, "is_featured")) {
    columns = withoutColumn(columns, "is_featured")
    ;({ data, error } = await runQuery(columns))
  }
  if (error) {
    console.error("[blog-repository] listPublishedPosts:", error)
    return []
  }

  const rows = (data ?? []) as unknown as BlogListPost[]
  const [counts, authorProfiles] = await Promise.all([
    countCommentsByPost(rows.map((p) => p.id)),
    getAuthorProfiles(rows.map((p) => p.author_id).filter((id): id is string => Boolean(id))),
  ])
  return rows.map((p) =>
    stripAuthorEmail(
      normalizePeripheralRefs({
        ...p,
        post_type: p.post_type ?? "review",
        is_featured: p.is_featured ?? false,
        comment_count: counts[p.id] ?? 0,
        author_profile: (p.author_id && authorProfiles[p.author_id]) || null,
      })
    )
  )
}

/** Busca um post publicado pelo slug. */
export async function getPublishedPostBySlug(slug: string): Promise<BlogPostDetail | null> {
  const db = createSupabaseAdminClient()
  const runQuery = (columns: string) =>
    db
      .from("blog_posts")
      .select(columns)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle()

  let columns = DETAIL_COLUMNS
  let { data, error } = await runQuery(columns)
  if (error && isMissingPostType(error.message)) {
    columns = DETAIL_COLUMNS_LEGACY
    ;({ data, error } = await runQuery(columns))
  }
  if (error) {
    console.error("[blog-repository] getPublishedPostBySlug:", error)
    return null
  }
  if (!data) return null

  const post = data as unknown as BlogPostDetail
  const counts = await countCommentsByPost([post.id])
  return stripAuthorEmail(
    normalizePeripheralRefs({
      ...post,
      post_type: post.post_type ?? "review",
      comment_count: counts[post.id] ?? 0,
    })
  )
}

/** Posts publicados relacionados a um periférico (página de detalhe). */
export async function listPublishedPostsByPeripheral(peripheralId: string): Promise<RelatedBlogPost[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("blog_posts")
    .select("id, title, slug, cover_thumbnail_url, cover_image_url, created_at")
    .eq("peripheral_id", peripheralId)
    .eq("is_published", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[blog-repository] listPublishedPostsByPeripheral:", error)
    return []
  }
  return (data ?? []) as unknown as RelatedBlogPost[]
}

const RELATED_COLUMNS = "id, title, slug, cover_thumbnail_url, cover_image_url, created_at"

/**
 * Notícias relacionadas pela "tag" da matéria atual. As tags derivam do
 * periférico vinculado (mesmo periférico → mesma categoria → mais recentes),
 * sempre excluindo a própria notícia. Devolve no máximo `limit` itens.
 */
export async function listRelatedPosts(params: {
  slug: string
  peripheralId: string | null
  category: string | null
  limit?: number
}): Promise<RelatedBlogPost[]> {
  const { slug, peripheralId, category, limit = 6 } = params
  const db = createSupabaseAdminClient()
  const seen = new Set<string>([slug])
  const out: RelatedBlogPost[] = []

  const push = (rows: RelatedBlogPost[]) => {
    for (const row of rows) {
      if (out.length >= limit) break
      if (seen.has(row.slug)) continue
      seen.add(row.slug)
      out.push(row)
    }
  }

  // 1. Mesmo periférico.
  if (peripheralId) {
    const { data } = await db
      .from("blog_posts")
      .select(RELATED_COLUMNS)
      .eq("peripheral_id", peripheralId)
      .eq("is_published", true)
      .neq("slug", slug)
      .order("created_at", { ascending: false })
      .limit(limit)
    push((data ?? []) as unknown as RelatedBlogPost[])
  }

  // 2. Mesma categoria de periférico.
  if (out.length < limit && category) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: perifs } = await (db.from("peripherals") as any)
      .select("id")
      .eq("category", category)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const perifIds = ((perifs ?? []) as any[]).map((p) => p.id)
    if (perifIds.length > 0) {
      const { data } = await db
        .from("blog_posts")
        .select(RELATED_COLUMNS)
        .in("peripheral_id", perifIds)
        .eq("is_published", true)
        .neq("slug", slug)
        .order("created_at", { ascending: false })
        .limit(limit)
      push((data ?? []) as unknown as RelatedBlogPost[])
    }
  }

  // 3. Preenche com as mais recentes.
  if (out.length < limit) {
    const { data } = await db
      .from("blog_posts")
      .select(RELATED_COLUMNS)
      .eq("is_published", true)
      .neq("slug", slug)
      .order("created_at", { ascending: false })
      .limit(limit + 1)
    push((data ?? []) as unknown as RelatedBlogPost[])
  }

  return out.slice(0, limit)
}

// ── Comentários das notícias (com conta) ──────────────────────────────────────

export type CommentSort = "recent" | "aura"
export const COMMENTS_PAGE_SIZE = 20

export type PaginatedComments = {
  comments: BlogCommentDetail[]
  totalRootCount: number
  hasMore: boolean
}

function mapCommentRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  profileMap: Awaited<ReturnType<typeof buildProfileMap>>
): BlogCommentDetail[] {
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    author_name: c.author_name,
    user_id: c.user_id,
    parent_comment_id: c.parent_comment_id ?? null,
    created_at: c.created_at,
    is_edited: c.is_edited ?? false,
    aura_count: c.aura_count ?? 0,
    image_urls: c.image_urls ?? [],
    mentions: ((c.mentioned_user_ids ?? []) as string[])
      .filter((id) => profileMap[id])
      .map((id) => ({
        id,
        display_name: profileMap[id]!.display_name ?? "Usuário",
        display_slug: profileMap[id]!.display_slug,
        avatar_url: profileMap[id]!.avatar_url,
      })),
    author_display_name: c.user_id ? profileMap[c.user_id]?.display_name ?? c.author_name : c.author_name,
    author_avatar_url: c.user_id ? profileMap[c.user_id]?.avatar_url ?? null : null,
    author_account_tier: c.user_id ? profileMap[c.user_id]?.account_tier ?? "common" : "common",
    author_display_slug: c.user_id ? profileMap[c.user_id]?.display_slug ?? null : null,
    author_streak: c.user_id ? profileMap[c.user_id]?.streak ?? 0 : 0,
  }))
}

const COMMENT_COLUMNS =
  "id, body, author_name, user_id, parent_comment_id, created_at, is_edited, aura_count, image_urls, mentioned_user_ids"

/**
 * Lista paginada dos comentários visíveis de uma notícia, já enriquecidos com
 * o perfil público (`user_profiles`) do autor. Pagina por thread (comentário-
 * raiz), não por linha: busca uma página de raízes ordenada por `sort` e, em
 * seguida, todas as respostas dessas raízes numa segunda query — assim uma
 * página nunca corta uma thread ao meio, e o banco só processa o necessário
 * pra essa página (sem trazer o post inteiro a cada carregamento).
 */
export async function listBlogComments(
  slug: string,
  { page = 1, sort = "recent" }: { page?: number; sort?: CommentSort } = {}
): Promise<PaginatedComments> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db
    .from("blog_posts")
    .select("id")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle()
  if (!post) return { comments: [], totalRootCount: 0, hasMore: false }

  const postId = (post as { id: string }).id
  const from = (page - 1) * COMMENTS_PAGE_SIZE
  const to = from + COMMENTS_PAGE_SIZE - 1

  let rootQuery = db
    .from("blog_comments")
    .select(COMMENT_COLUMNS, { count: "exact" })
    .eq("post_id", postId)
    .eq("is_hidden", false)
    .is("parent_comment_id", null)
  rootQuery =
    sort === "aura"
      ? rootQuery.order("aura_count", { ascending: false }).order("created_at", { ascending: false })
      : rootQuery.order("created_at", { ascending: false })
  const { data: rootRows, error: rootError, count } = await rootQuery.range(from, to)

  if (rootError) {
    console.error("[blog-repository] listBlogComments (roots):", rootError.message)
    return { comments: [], totalRootCount: 0, hasMore: false }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roots = (rootRows ?? []) as any[]
  const totalRootCount = count ?? roots.length

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let replies: any[] = []
  if (roots.length > 0) {
    // Thread tem até 4 níveis: busca nível 2 (filhos da raiz) e, com os ids
    // resultantes, o nível 3 (netos) e depois o nível 4 (bisnetos) — só 3
    // idas ao banco, nunca recursão ilimitada, porque a profundidade já é
    // limitada no insert (trigger).
    const { data: level2Rows, error: level2Error } = await db
      .from("blog_comments")
      .select(COMMENT_COLUMNS)
      .eq("post_id", postId)
      .eq("is_hidden", false)
      .in(
        "parent_comment_id",
        roots.map((r) => r.id)
      )
      .order("created_at", { ascending: true })
    if (level2Error) {
      console.error("[blog-repository] listBlogComments (level 2):", level2Error.message)
    } else {
      replies = level2Rows ?? []
    }

    if (replies.length > 0) {
      const { data: level3Rows, error: level3Error } = await db
        .from("blog_comments")
        .select(COMMENT_COLUMNS)
        .eq("post_id", postId)
        .eq("is_hidden", false)
        .in(
          "parent_comment_id",
          replies.map((r) => r.id)
        )
        .order("created_at", { ascending: true })
      if (level3Error) {
        console.error("[blog-repository] listBlogComments (level 3):", level3Error.message)
      } else {
        const level3Rows_ = level3Rows ?? []
        replies = [...replies, ...level3Rows_]

        if (level3Rows_.length > 0) {
          const { data: level4Rows, error: level4Error } = await db
            .from("blog_comments")
            .select(COMMENT_COLUMNS)
            .eq("post_id", postId)
            .eq("is_hidden", false)
            .in(
              "parent_comment_id",
              level3Rows_.map((r) => r.id)
            )
            .order("created_at", { ascending: true })
          if (level4Error) {
            console.error("[blog-repository] listBlogComments (level 4):", level4Error.message)
          } else {
            replies = [...replies, ...(level4Rows ?? [])]
          }
        }
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = [...roots, ...(replies as any[])]
  const profileMap = await buildProfileMap([
    ...allRows.map((c) => c.user_id),
    ...allRows.flatMap((c) => (c.mentioned_user_ids ?? []) as string[]),
  ])

  return {
    comments: mapCommentRows(allRows, profileMap),
    totalRootCount,
    hasMore: from + roots.length < totalRootCount,
  }
}

/**
 * Cria um comentário em uma notícia (exige usuário autenticado) — mesma
 * lógica de `addForumComment`: thread de até 4 níveis, reancorando no avô
 * quando a resposta já estaria no nível 5.
 */
export async function addBlogComment(params: {
  postSlug: string
  userId: string
  authorName: string
  body: string
  parentCommentId?: string | null
  /** Até 2 URLs já publicadas no bucket `comments` (validação de dono é feita na rota). */
  imageUrls?: string[]
  /** Até 2 ids de usuário @mencionados (a notificação é disparada por trigger no insert). */
  mentionedUserIds?: string[]
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db
    .from("blog_posts")
    .select("id")
    .eq("slug", params.postSlug)
    .eq("is_published", true)
    .maybeSingle()
  if (!post) return { ok: false, error: "Notícia não encontrada.", status: 404 }

  const postId = (post as { id: string }).id

  let parentCommentId: string | null = null
  if (params.parentCommentId) {
    // Thread de até 4 níveis: sobe a cadeia de pais pra achar a profundidade.
    // No limite (nível 4), a resposta é reancorada no avô (vira irmã, não
    // filha) em vez de rejeitada — mesma lógica de `addForumComment`.
    const { data: parent } = await db
      .from("blog_comments")
      .select("id, post_id, parent_comment_id")
      .eq("id", params.parentCommentId)
      .maybeSingle()
    if (!parent || parent.post_id !== postId) {
      return { ok: false, error: "Comentário original não encontrado.", status: 404 }
    }
    parentCommentId = parent.id
    if (parent.parent_comment_id) {
      const { data: grandparent } = await db
        .from("blog_comments")
        .select("id, parent_comment_id")
        .eq("id", parent.parent_comment_id)
        .maybeSingle()
      if (grandparent?.parent_comment_id) {
        const { data: greatGrandparent } = await db
          .from("blog_comments")
          .select("id, parent_comment_id")
          .eq("id", grandparent.parent_comment_id)
          .maybeSingle()
        if (greatGrandparent?.parent_comment_id) {
          parentCommentId = parent.parent_comment_id
        }
      }
    }
  }

  const { error } = await db.from("blog_comments").insert({
    post_id: postId,
    body: params.body.trim(),
    author_name: params.authorName,
    user_id: params.userId,
    parent_comment_id: parentCommentId,
    is_hidden: false,
    aura_count: 0,
    image_urls: params.imageUrls ?? [],
    mentioned_user_ids: params.mentionedUserIds ?? [],
  })

  if (error) {
    console.error("[blog-repository] addBlogComment:", error.message)
    return { ok: false, error: error.message, status: 400 }
  }

  // +5 de aura por comentar, 1x por notícia — best-effort, não bloqueia o comentário.
  await creditCommentCreationAura(params.userId, "blog_post", postId)

  return { ok: true }
}

/**
 * Reescreve um comentário do próprio autor dentro da janela de edição — mesma
 * regra de `updateForumComment`: autoria e prazo conferidos aqui, contra o
 * `created_at` do banco, e não no cliente.
 */
export async function updateBlogComment(params: {
  postSlug: string
  commentId: string
  userId: string
  body: string
  /** Quando ausente, imagens/menções do comentário não são alteradas. */
  imageUrls?: string[]
  mentionedUserIds?: string[]
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: comment } = await db
    .from("blog_comments")
    .select("id, post_id, user_id, created_at, is_hidden")
    .eq("id", params.commentId)
    .maybeSingle()

  if (!comment || comment.is_hidden) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }

  const { data: post } = await db
    .from("blog_posts")
    .select("id")
    .eq("slug", params.postSlug)
    .eq("is_published", true)
    .maybeSingle()

  if (!post || (post as { id: string }).id !== comment.post_id) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }
  if (comment.user_id !== params.userId) {
    return { ok: false, error: "Você só pode editar os seus comentários.", status: 403 }
  }
  if (!canEditComment(comment.created_at)) {
    return {
      ok: false,
      error: "O prazo de 15 minutos para editar este comentário já passou.",
      status: 403,
    }
  }

  const { error } = await db
    .from("blog_comments")
    .update({
      body: params.body.trim(),
      edited_at: new Date().toISOString(),
      ...(params.imageUrls !== undefined ? { image_urls: params.imageUrls } : {}),
      ...(params.mentionedUserIds !== undefined ? { mentioned_user_ids: params.mentionedUserIds } : {}),
    })
    .eq("id", comment.id)

  if (error) {
    console.error("[blog-repository] updateBlogComment:", error.message)
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}

/**
 * Exclui (soft-delete via `is_hidden`) um comentário do próprio autor — mesma
 * regra de `deleteOwnForumComment`: autoria conferida aqui, contra o banco, e
 * não no cliente. `is_hidden` já é filtrado em toda listagem pública.
 */
export async function deleteOwnBlogComment(params: {
  postSlug: string
  commentId: string
  userId: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: comment } = await db
    .from("blog_comments")
    .select("id, post_id, user_id, is_hidden")
    .eq("id", params.commentId)
    .maybeSingle()

  if (!comment || comment.is_hidden) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }

  const { data: post } = await db
    .from("blog_posts")
    .select("id")
    .eq("slug", params.postSlug)
    .eq("is_published", true)
    .maybeSingle()

  if (!post || (post as { id: string }).id !== comment.post_id) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }
  if (comment.user_id !== params.userId) {
    return { ok: false, error: "Você só pode excluir os seus próprios comentários.", status: 403 }
  }

  const { error } = await db.from("blog_comments").update({ is_hidden: true }).eq("id", comment.id)
  if (error) {
    console.error("[blog-repository] deleteOwnBlogComment:", error.message)
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}
