import "server-only"

import type { AccountTier } from "@/lib/account-tier"
import { canEditComment } from "@/lib/comment-edit"
import { buildProfileMap } from "@/lib/server/repositories/profile-enrichment"
import { creditCommentCreationAura, creditForumPostCreationAura } from "@/lib/server/repositories/aura-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório do Fórum — única porta de acesso às tabelas `forum_posts` e
 * `forum_comments`. Categorias vivem em `forum-categories-repository.ts` e
 * aura em `aura-repository.ts`.
 */

export type ForumCategoryInfo = {
  id: string
  slug: string
  name: string
  parent: { id: string; slug: string; name: string } | null
}

export type ForumListPost = {
  id: string
  slug: string
  title: string
  /** Opcional — post pode ter só título. */
  body: string | null
  author_name: string
  user_id: string | null
  category: ForumCategoryInfo | null
  media_image_urls: string[]
  media_video_url: string | null
  created_at: string
  is_locked: boolean
  is_pinned: boolean
  /** Só vem preenchido de verdade na aba "mine" — nas demais abas o post já chega sempre `false`. */
  is_hidden: boolean
  comment_count: number
  /** Somatório denormalizado da aura de todos os comentários do post — ver 20260823000000_forum_post_aura_from_comments.sql. */
  aura_count: number
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  /** Slug do autor — resolve tag especial (ex: SUNANO) junto do badge de tier. */
  author_display_slug: string | null
}

export type ForumPostDetail = ForumListPost
export type ForumCommentDetail = {
  id: string
  body: string
  author_name: string
  user_id: string | null
  parent_comment_id: string | null
  created_at: string
  is_edited: boolean
  aura_count: number
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_display_slug: string | null
}

export type ForumTab = "recent" | "hot" | "category" | "mine"

// ── Helpers de enriquecimento ────────────────────────────────────────────────

type CategoryRow = { id: string; slug: string; name: string; parent_id: string | null }

/** Carrega todas as categorias (tabela pequena) para resolver nome/pai em memória. */
async function buildCategoryMap(): Promise<Map<string, CategoryRow>> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("forum_categories").select("id, slug, name, parent_id")
  const map = new Map<string, CategoryRow>()
  for (const row of data ?? []) map.set(row.id, row)
  return map
}

function resolveCategoryInfo(
  categoryId: string | null,
  categoryMap: Map<string, CategoryRow>
): ForumCategoryInfo | null {
  if (!categoryId) return null
  const category = categoryMap.get(categoryId)
  if (!category) return null
  const parent = category.parent_id ? categoryMap.get(category.parent_id) ?? null : null
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    parent: parent ? { id: parent.id, slug: parent.slug, name: parent.name } : null,
  }
}

/** IDs de uma categoria + suas subcategorias (para filtrar posts por categoria-raiz). */
async function resolveCategoryIdsForFilter(categoryId: string): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("forum_categories").select("id").eq("parent_id", categoryId)
  const childIds = (data ?? []).map((row) => row.id)
  return [categoryId, ...childIds]
}

/** Slugs + data de todos os posts visíveis — usado só pelo `app/sitemap.ts`, sem o enriquecimento pesado de `listForumPosts`. */
export async function listAllForumSlugsForSitemap(): Promise<{ slug: string; updated_at: string }[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("forum_posts")
    .select("slug, created_at")
    .eq("is_hidden", false)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[forum-repository] listAllForumSlugsForSitemap:", error)
    return []
  }
  return (data ?? []).map((p) => ({ slug: p.slug, updated_at: p.created_at }))
}

// ── Leitura pública ──────────────────────────────────────────────────────────

/** Lista posts visíveis do fórum, conforme a aba selecionada. */
export async function listForumPosts(params: {
  tab: ForumTab
  categoryId?: string
  /** Obrigatório quando `tab === "mine"` — ignorado nas demais abas. */
  userId?: string
}): Promise<ForumListPost[]> {
  const db = createSupabaseAdminClient()
  const { tab, categoryId, userId } = params

  if (tab === "mine" && !userId) return []

  let query = db
    .from("forum_posts")
    .select(
      "id, slug, title, body_preview, author_name, user_id, category_id, media_image_urls, media_video_url, created_at, is_locked, is_pinned, is_hidden, aura_count"
    )

  // Em "Meus Posts" o dono também vê o que ocultou (pra poder reativar);
  // em todas as outras abas a listagem pública segue escondendo `is_hidden`.
  if (tab !== "mine") {
    query = query.eq("is_hidden", false)
  }

  if (tab === "category" && categoryId) {
    const ids = await resolveCategoryIdsForFilter(categoryId)
    query = query.in("category_id", ids)
  }

  if (tab === "hot") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte("created_at", since)
  }

  if (tab === "mine" && userId) {
    query = query.eq("user_id", userId)
  }

  // Post fixado só sobe ao topo na aba "Recente" — em "Em Alta" e "Categoria"
  // a ordenação continua só por engajamento/data, sem o pin sobrepor o critério.
  if (tab === "recent") query = query.order("is_pinned", { ascending: false })
  query = query.order("created_at", { ascending: false })
  // Sem paginação na UI ainda — limita para não trazer o fórum inteiro a
  // cada carregamento de página conforme o volume de posts cresce.
  query = query.limit(50)

  const { data: posts, error } = await query
  if (error) {
    console.error("[forum-repository] listForumPosts:", error)
    throw error
  }

  const rows = posts ?? []
  const postIds = rows.map((p) => p.id)

  const commentCounts: Record<string, number> = {}
  if (postIds.length > 0) {
    const { data: comments } = await db
      .from("forum_comments")
      .select("post_id")
      .in("post_id", postIds)
      .eq("is_hidden", false)
    for (const c of comments ?? []) {
      commentCounts[c.post_id] = (commentCounts[c.post_id] ?? 0) + 1
    }
  }

  const profileMap = await buildProfileMap(rows.map((p) => p.user_id))
  const categoryMap = await buildCategoryMap()

  const list = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    body: p.body_preview,
    author_name: p.author_name,
    user_id: p.user_id,
    category: resolveCategoryInfo(p.category_id, categoryMap),
    media_image_urls: p.media_image_urls ?? [],
    media_video_url: p.media_video_url,
    created_at: p.created_at,
    is_locked: p.is_locked,
    is_pinned: p.is_pinned,
    is_hidden: p.is_hidden,
    comment_count: commentCounts[p.id] ?? 0,
    aura_count: p.aura_count ?? 0,
    author_display_name: p.user_id ? profileMap[p.user_id]?.display_name ?? p.author_name : p.author_name,
    author_avatar_url: p.user_id ? profileMap[p.user_id]?.avatar_url ?? null : null,
    author_account_tier: p.user_id ? profileMap[p.user_id]?.account_tier ?? "common" : "common",
    author_display_slug: p.user_id ? profileMap[p.user_id]?.display_slug ?? null : null,
  }))

  // "Em Alta" = mais discutido. O `comment_count` é montado aqui em JS (vem de
  // uma segunda consulta, não é coluna de `forum_posts`), então a ordenação
  // também é em JS — sobre os 50 posts mais recentes dos últimos 30 dias já
  // recortados acima, que é o mesmo universo que a aba mostrava antes.
  if (tab === "hot") list.sort((a, b) => b.comment_count - a.comment_count)

  return list
}

/**
 * Resolve uma categoria (raiz ou subcategoria) pelo slug e lista os posts
 * dela — base da página `/forum/categoria/[slug]`, indexável por periférico
 * (ex: "mouses", "teclados").
 */
export async function getForumPostsByCategorySlug(slug: string): Promise<{
  category: ForumCategoryInfo
  posts: ForumListPost[]
} | null> {
  const db = createSupabaseAdminClient()
  const { data: category } = await db
    .from("forum_categories")
    .select("id, slug, name, parent_id")
    .eq("slug", slug)
    .eq("is_active", true)
    .maybeSingle()

  if (!category) return null

  const categoryMap = await buildCategoryMap()
  const categoryInfo = resolveCategoryInfo(category.id, categoryMap)
  if (!categoryInfo) return null

  const posts = await listForumPosts({ tab: "category", categoryId: category.id })
  return { category: categoryInfo, posts }
}

export type ForumSidebarData = {
  totalPosts: number
  totalComments: number
  categoryPostCount: number
  relatedPosts: { slug: string; title: string; created_at: string; comment_count: number }[]
}

/**
 * Dados da sidebar estilo Reddit na página do post: estatísticas gerais do
 * fórum + quantos tópicos existem na mesma categoria + outros tópicos
 * recentes dela (pra navegação lateral). Tudo em paralelo e com `head:true`
 * (só contagem) onde não precisamos das linhas.
 */
export async function getForumSidebarData(params: {
  postId: string
  categoryId: string | null
}): Promise<ForumSidebarData> {
  const db = createSupabaseAdminClient()
  const { postId, categoryId } = params

  const categoryIdsPromise = categoryId ? resolveCategoryIdsForFilter(categoryId) : Promise.resolve<string[]>([])

  const [{ count: totalPosts }, { count: totalComments }, categoryIds] = await Promise.all([
    db.from("forum_posts").select("id", { count: "exact", head: true }).eq("is_hidden", false),
    db.from("forum_comments").select("id", { count: "exact", head: true }).eq("is_hidden", false),
    categoryIdsPromise,
  ])

  if (categoryIds.length === 0) {
    return { totalPosts: totalPosts ?? 0, totalComments: totalComments ?? 0, categoryPostCount: 0, relatedPosts: [] }
  }

  const [{ count: categoryPostCount }, { data: relatedRows }] = await Promise.all([
    db.from("forum_posts").select("id", { count: "exact", head: true }).eq("is_hidden", false).in("category_id", categoryIds),
    db
      .from("forum_posts")
      .select("id, slug, title, created_at")
      .eq("is_hidden", false)
      .in("category_id", categoryIds)
      .neq("id", postId)
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  const relatedIds = (relatedRows ?? []).map((p) => p.id)
  const commentCounts: Record<string, number> = {}
  if (relatedIds.length > 0) {
    const { data: comments } = await db
      .from("forum_comments")
      .select("post_id")
      .in("post_id", relatedIds)
      .eq("is_hidden", false)
    for (const c of comments ?? []) {
      commentCounts[c.post_id] = (commentCounts[c.post_id] ?? 0) + 1
    }
  }

  return {
    totalPosts: totalPosts ?? 0,
    totalComments: totalComments ?? 0,
    categoryPostCount: categoryPostCount ?? 0,
    relatedPosts: (relatedRows ?? []).map((p) => ({
      slug: p.slug,
      title: p.title,
      created_at: p.created_at,
      comment_count: commentCounts[p.id] ?? 0,
    })),
  }
}

export type CommentSort = "recent" | "aura"
export const COMMENTS_PAGE_SIZE = 20

export type PaginatedComments = {
  comments: ForumCommentDetail[]
  totalRootCount: number
  hasMore: boolean
}

const FORUM_COMMENT_COLUMNS =
  "id, body, author_name, user_id, parent_comment_id, created_at, is_edited, aura_count"

function mapForumCommentRows(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: any[],
  profileMap: Awaited<ReturnType<typeof buildProfileMap>>
): ForumCommentDetail[] {
  return rows.map((c) => ({
    id: c.id,
    body: c.body,
    author_name: c.author_name,
    user_id: c.user_id,
    parent_comment_id: c.parent_comment_id ?? null,
    created_at: c.created_at,
    is_edited: c.is_edited ?? false,
    aura_count: c.aura_count ?? 0,
    author_display_name: c.user_id ? profileMap[c.user_id]?.display_name ?? c.author_name : c.author_name,
    author_avatar_url: c.user_id ? profileMap[c.user_id]?.avatar_url ?? null : null,
    author_account_tier: c.user_id ? profileMap[c.user_id]?.account_tier ?? "common" : "common",
    author_display_slug: c.user_id ? profileMap[c.user_id]?.display_slug ?? null : null,
  }))
}

/**
 * Lista paginada dos comentários visíveis de um post do fórum. Mesma
 * estratégia de `listBlogComments` em `blog-repository.ts`: pagina por
 * thread (comentário-raiz) pra nunca cortar uma thread ao meio — busca uma
 * página de raízes ordenada por `sort` e depois todas as respostas dessas
 * raízes numa segunda query.
 */
export async function listForumComments(
  slug: string,
  { page = 1, sort = "recent" }: { page?: number; sort?: CommentSort } = {}
): Promise<PaginatedComments> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db.from("forum_posts").select("id").eq("slug", slug).maybeSingle()
  if (!post) return { comments: [], totalRootCount: 0, hasMore: false }
  const postId = (post as { id: string }).id

  const from = (page - 1) * COMMENTS_PAGE_SIZE
  const to = from + COMMENTS_PAGE_SIZE - 1

  let rootQuery = db
    .from("forum_comments")
    .select(FORUM_COMMENT_COLUMNS, { count: "exact" })
    .eq("post_id", postId)
    .eq("is_hidden", false)
    .is("parent_comment_id", null)
  rootQuery =
    sort === "aura"
      ? rootQuery.order("aura_count", { ascending: false }).order("created_at", { ascending: false })
      : rootQuery.order("created_at", { ascending: false })
  const { data: rootRows, error: rootError, count } = await rootQuery.range(from, to)

  if (rootError) {
    console.error("[forum-repository] listForumComments (roots):", rootError.message)
    return { comments: [], totalRootCount: 0, hasMore: false }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roots = (rootRows ?? []) as any[]
  const totalRootCount = count ?? roots.length

  let replies: unknown[] = []
  if (roots.length > 0) {
    const { data: replyRows, error: replyError } = await db
      .from("forum_comments")
      .select(FORUM_COMMENT_COLUMNS)
      .eq("post_id", postId)
      .eq("is_hidden", false)
      .in(
        "parent_comment_id",
        roots.map((r) => r.id)
      )
      .order("created_at", { ascending: true })
    if (replyError) {
      console.error("[forum-repository] listForumComments (replies):", replyError.message)
    } else {
      replies = replyRows ?? []
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allRows = [...roots, ...(replies as any[])]
  const profileMap = await buildProfileMap(allRows.map((c) => c.user_id))

  return {
    comments: mapForumCommentRows(allRows, profileMap),
    totalRootCount,
    hasMore: from + roots.length < totalRootCount,
  }
}

/**
 * Busca um post pelo slug, já com a primeira página de comentários
 * enriquecida (ordenação "recent" — mesmo padrão do carregamento inicial de
 * `listBlogComments`). Páginas seguintes vêm de `listForumComments` via API.
 *
 * Post oculto (`is_hidden`) só é retornado pro próprio dono (`viewerId` bate
 * com `user_id`) — pra ele conseguir reativar o próprio post pela página de
 * detalhe. Pra qualquer outro visitante, oculto continua como se não existisse.
 */
export async function getForumPostBySlug(
  slug: string,
  viewerId?: string | null
): Promise<{
  post: ForumPostDetail
  comments: ForumCommentDetail[]
  hasMoreComments: boolean
} | null> {
  const db = createSupabaseAdminClient()

  const { data: post, error } = await db
    .from("forum_posts")
    .select(
      "id, slug, title, body, author_name, user_id, category_id, media_image_urls, media_video_url, created_at, is_locked, is_pinned, is_hidden, aura_count"
    )
    .eq("slug", slug)
    .maybeSingle()

  if (error) {
    console.error("[forum-repository] getForumPostBySlug:", error)
    throw error
  }
  if (!post) return null
  if (post.is_hidden && post.user_id !== viewerId) return null

  const [commentsPage, { count: totalCommentCount }] = await Promise.all([
    listForumComments(slug),
    db
      .from("forum_comments")
      .select("id", { count: "exact", head: true })
      .eq("post_id", post.id)
      .eq("is_hidden", false),
  ])

  const profileMap = await buildProfileMap([post.user_id, ...commentsPage.comments.map((c) => c.user_id)])
  const categoryMap = await buildCategoryMap()

  const enrichedPost: ForumPostDetail = {
    id: post.id,
    slug: post.slug,
    title: post.title,
    body: post.body,
    author_name: post.author_name,
    user_id: post.user_id,
    category: resolveCategoryInfo(post.category_id, categoryMap),
    media_image_urls: post.media_image_urls ?? [],
    media_video_url: post.media_video_url,
    created_at: post.created_at,
    is_locked: post.is_locked,
    is_pinned: post.is_pinned,
    is_hidden: post.is_hidden,
    comment_count: totalCommentCount ?? 0,
    aura_count: post.aura_count ?? 0,
    author_display_name: post.user_id
      ? profileMap[post.user_id]?.display_name ?? post.author_name
      : post.author_name,
    author_avatar_url: post.user_id ? profileMap[post.user_id]?.avatar_url ?? null : null,
    author_account_tier: post.user_id ? profileMap[post.user_id]?.account_tier ?? "common" : "common",
    author_display_slug: post.user_id ? profileMap[post.user_id]?.display_slug ?? null : null,
  }

  return { post: enrichedPost, comments: commentsPage.comments, hasMoreComments: commentsPage.hasMore }
}

// ── Escrita pública ──────────────────────────────────────────────────────────

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "")
}

/** Deriva a semente do slug das primeiras palavras do título. */
function slugSeedFromTitle(title: string) {
  return title.trim().split(/\s+/).slice(0, 8).join(" ")
}

async function createUniqueSlug(baseSlug: string) {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("forum_posts").select("slug").ilike("slug", `${baseSlug}%`)
  const taken = new Set((data ?? []).map((r) => r.slug))
  let slug = baseSlug
  let i = 2
  while (taken.has(slug)) {
    slug = `${baseSlug}-${i}`
    i++
  }
  return slug
}

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

async function validateCategoryId(categoryId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("forum_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("is_active", true)
    .maybeSingle()
  return Boolean(data)
}

const MAX_POST_IMAGES = 5

function validateMedia(mediaImageUrls?: string[] | null, mediaVideoUrl?: string | null) {
  const imageCount = mediaImageUrls?.length ?? 0
  if (imageCount > 0 && mediaVideoUrl) {
    return "Escolha apenas um tipo de mídia: imagem ou vídeo."
  }
  if (imageCount > MAX_POST_IMAGES) {
    return `Envie no máximo ${MAX_POST_IMAGES} imagens por post.`
  }
  return null
}

/** Cria um novo post de fórum. Retorna o slug gerado. */
export async function createForumPost(params: {
  userId: string
  authorName: string
  title: string
  body?: string | null
  categoryId: string
  mediaImageUrls?: string[]
  mediaVideoUrl?: string | null
}): Promise<{ ok: true; slug: string } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  const mediaError = validateMedia(params.mediaImageUrls, params.mediaVideoUrl)
  if (mediaError) return { ok: false, error: mediaError, status: 400 }

  if (!(await validateCategoryId(params.categoryId))) {
    return { ok: false, error: "Categoria inválida ou inativa.", status: 400 }
  }

  const seed = slugSeedFromTitle(params.title)
  const slug = await createUniqueSlug(slugify(seed) || `post-${Date.now()}`)

  const { data: created, error } = await db
    .from("forum_posts")
    .insert({
      slug,
      title: params.title.trim(),
      body: params.body?.trim() || null,
      author_name: params.authorName,
      user_id: params.userId,
      category_id: params.categoryId,
      media_image_urls: params.mediaImageUrls ?? [],
      media_video_url: params.mediaVideoUrl ?? null,
      is_hidden: false,
      is_locked: false,
      is_pinned: false,
      // Somatório denormalizado da aura dos comentários — nasce zerado, post
      // novo ainda não tem comentário nenhum.
      aura_count: 0,
    })
    .select("id")
    .single()

  if (error || !created) {
    console.error("[forum-repository] createForumPost:", error)
    return { ok: false, error: error?.message ?? "Erro ao criar post.", status: 400 }
  }

  // +10 de aura por criar post, 1x/dia — best-effort, não bloqueia a criação do post.
  await creditForumPostCreationAura(params.userId, created.id)

  return { ok: true, slug }
}

/** Adiciona um comentário a um post (respeitando o lock). */
export async function addForumComment(params: {
  postSlug: string
  userId: string
  authorName: string
  body: string
  parentCommentId?: string | null
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db
    .from("forum_posts")
    .select("id, is_locked")
    .eq("slug", params.postSlug)
    .maybeSingle()

  if (!post) return { ok: false, error: "Post não encontrado.", status: 404 }
  if (post.is_locked) {
    return { ok: false, error: "Este post está fechado para comentários.", status: 403 }
  }

  let parentCommentId: string | null = null
  if (params.parentCommentId) {
    // Só permite responder a um comentário raiz (sem parent) do mesmo post —
    // mantém a thread em 1 nível, como no restante do fórum.
    const { data: parent } = await db
      .from("forum_comments")
      .select("id, post_id, parent_comment_id")
      .eq("id", params.parentCommentId)
      .maybeSingle()
    if (!parent || parent.post_id !== post.id) {
      return { ok: false, error: "Comentário original não encontrado.", status: 404 }
    }
    parentCommentId = parent.parent_comment_id ? parent.parent_comment_id : parent.id
  }

  const { error } = await db.from("forum_comments").insert({
    post_id: post.id,
    body: params.body.trim(),
    author_name: params.authorName,
    user_id: params.userId,
    parent_comment_id: parentCommentId,
    is_hidden: false,
    aura_count: 0,
  })

  if (error) {
    console.error("[forum-repository] addForumComment:", error)
    return { ok: false, error: error.message, status: 400 }
  }

  // +5 de aura por comentar, 1x por post — best-effort, não bloqueia o comentário.
  await creditCommentCreationAura(params.userId, "post", post.id)

  return { ok: true }
}

/**
 * Reescreve um comentário do próprio autor, dentro da janela de edição.
 *
 * As três checagens (autoria, janela e lock do post) acontecem aqui, contra o
 * que está no banco — o botão que some na UI depois de 15 minutos é só
 * conveniência, e o `created_at` que decide vem daqui, não do cliente.
 */
export async function updateForumComment(params: {
  postSlug: string
  commentId: string
  userId: string
  body: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: comment } = await db
    .from("forum_comments")
    .select("id, post_id, user_id, created_at, is_hidden")
    .eq("id", params.commentId)
    .maybeSingle()

  if (!comment || comment.is_hidden) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }

  const { data: post } = await db
    .from("forum_posts")
    .select("id, is_locked")
    .eq("slug", params.postSlug)
    .maybeSingle()

  if (!post || post.id !== comment.post_id) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }
  if (comment.user_id !== params.userId) {
    return { ok: false, error: "Você só pode editar os seus comentários.", status: 403 }
  }
  if (post.is_locked) {
    return { ok: false, error: "Este post está fechado para comentários.", status: 403 }
  }
  if (!canEditComment(comment.created_at)) {
    return {
      ok: false,
      error: "O prazo de 15 minutos para editar este comentário já passou.",
      status: 403,
    }
  }

  const { error } = await db
    .from("forum_comments")
    .update({ body: params.body.trim(), edited_at: new Date().toISOString() })
    .eq("id", comment.id)

  if (error) {
    console.error("[forum-repository] updateForumComment:", error)
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}

/**
 * Exclui (soft-delete via `is_hidden`) um comentário do próprio autor — a
 * checagem de dono acontece aqui contra o banco, nunca confiando no `userId`
 * que o cliente alega ter. Soft-delete em vez de remoção definitiva porque
 * respostas podem apontar pro comentário; `is_hidden` já é filtrado em toda
 * listagem pública, então o efeito visível é o mesmo de excluir.
 */
export async function deleteOwnForumComment(params: {
  postSlug: string
  commentId: string
  userId: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: comment } = await db
    .from("forum_comments")
    .select("id, post_id, user_id, is_hidden")
    .eq("id", params.commentId)
    .maybeSingle()

  if (!comment || comment.is_hidden) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }

  const { data: post } = await db
    .from("forum_posts")
    .select("id")
    .eq("slug", params.postSlug)
    .maybeSingle()

  if (!post || post.id !== comment.post_id) {
    return { ok: false, error: "Comentário não encontrado.", status: 404 }
  }
  if (comment.user_id !== params.userId) {
    return { ok: false, error: "Você só pode excluir os seus próprios comentários.", status: 403 }
  }

  const { error } = await db.from("forum_comments").update({ is_hidden: true }).eq("id", comment.id)
  if (error) {
    console.error("[forum-repository] deleteOwnForumComment:", error)
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}

/** Existe ao menos um post (visível ou oculto) do usuário? Decide se a aba "Meus Posts" aparece — inclui ocultos pra ele conseguir reativar. */
export async function hasForumPostsByUser(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { count } = await db
    .from("forum_posts")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
  return (count ?? 0) > 0
}

/**
 * Oculta ou reativa um post do próprio autor — mesma semântica de
 * `is_hidden` usada pela moderação, mas a checagem de dono acontece aqui
 * contra o banco, nunca confiando no `userId` que o cliente alega ter.
 */
export async function setOwnForumPostHidden(params: {
  postSlug: string
  userId: string
  hidden: boolean
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db
    .from("forum_posts")
    .select("id, user_id, is_hidden")
    .eq("slug", params.postSlug)
    .maybeSingle()

  if (!post) {
    return { ok: false, error: "Post não encontrado.", status: 404 }
  }
  if (post.user_id !== params.userId) {
    return { ok: false, error: "Você só pode alterar os seus próprios posts.", status: 403 }
  }

  const { error } = await db.from("forum_posts").update({ is_hidden: params.hidden }).eq("id", post.id)
  if (error) {
    console.error("[forum-repository] setOwnForumPostHidden:", error)
    return { ok: false, error: error.message, status: 400 }
  }

  return { ok: true }
}

/**
 * Exclui definitivamente um post do próprio autor — mesma checagem de dono
 * de `setOwnForumPostHidden`, feita aqui contra o banco, nunca confiando no
 * `userId` que o cliente alega ter.
 */
export async function deleteOwnForumPost(params: { postSlug: string; userId: string }): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db
    .from("forum_posts")
    .select("id, user_id")
    .eq("slug", params.postSlug)
    .maybeSingle()

  if (!post) {
    return { ok: false, error: "Post não encontrado.", status: 404 }
  }
  if (post.user_id !== params.userId) {
    return { ok: false, error: "Você só pode excluir os seus próprios posts.", status: 403 }
  }

  return deleteForumPost(post.id)
}

// ── Moderação (admin) ────────────────────────────────────────────────────────

export type ModerationFilter = "all" | "visible" | "hidden" | "locked" | "pinned"

export type ModerationPost = {
  id: string
  slug: string
  title: string
  body_preview: string
  author_name: string
  author_avatar_url: string | null
  category: ForumCategoryInfo | null
  media_image_urls: string[]
  media_video_url: string | null
  is_hidden: boolean
  is_locked: boolean
  is_pinned: boolean
  created_at: string
  comment_count: number
}

export type ModerationComment = {
  id: string
  post_id: string
  body: string
  author_name: string
  author_avatar_url: string | null
  is_hidden: boolean
  created_at: string
}

/** Lista posts para a tela de moderação, com paginação, filtro e busca. */
export async function listForumPostsForModeration(params: {
  filter: ModerationFilter
  q: string
  page: number
  pageSize: number
}): Promise<{
  posts: ModerationPost[]
  commentsByPost: Record<string, ModerationComment[]>
  total: number
}> {
  const db = createSupabaseAdminClient()
  const start = (params.page - 1) * params.pageSize
  const end = start + params.pageSize - 1

  let query = db
    .from("forum_posts")
    .select(
      "id, slug, title, body_preview, author_name, user_id, category_id, media_image_urls, media_video_url, is_hidden, is_locked, is_pinned, created_at",
      { count: "exact" }
    )

  if (params.filter === "visible") query = query.eq("is_hidden", false)
  else if (params.filter === "hidden") query = query.eq("is_hidden", true)
  else if (params.filter === "locked") query = query.eq("is_locked", true)
  else if (params.filter === "pinned") query = query.eq("is_pinned", true)

  if (params.q) {
    // Escapa aspas/backslash e envolve em aspas duplas — sintaxe do PostgREST
    // para valores de filtro que podem conter vírgula/ponto (delimitadores
    // do `.or()`), evitando que `q` injete condições extras no filtro.
    const escapedQ = params.q.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    query = query.or(`body.ilike."%${escapedQ}%",author_name.ilike."%${escapedQ}%"`)
  }

  const { data: posts, count } = await query
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, end)

  const rows = posts ?? []
  const postIds = rows.map((p) => p.id)
  const commentsByPost: Record<string, ModerationComment[]> = {}

  let commentRows: {
    id: string
    post_id: string
    body: string
    author_name: string
    user_id: string | null
    is_hidden: boolean
    created_at: string
  }[] = []

  if (postIds.length > 0) {
    const { data: comments } = await db
      .from("forum_comments")
      .select("id, post_id, body, author_name, user_id, is_hidden, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true })
    commentRows = comments ?? []
  }

  const categoryMap = await buildCategoryMap()
  const profileMap = await buildProfileMap([
    ...rows.map((p) => p.user_id),
    ...commentRows.map((c) => c.user_id),
  ])

  for (const c of commentRows) {
    ;(commentsByPost[c.post_id] ??= []).push({
      id: c.id,
      post_id: c.post_id,
      body: c.body,
      author_name: c.author_name,
      author_avatar_url: c.user_id ? profileMap[c.user_id]?.avatar_url ?? null : null,
      is_hidden: c.is_hidden,
      created_at: c.created_at,
    })
  }

  const moderationPosts: ModerationPost[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    body_preview: p.body_preview ?? "",
    author_name: p.author_name,
    author_avatar_url: p.user_id ? profileMap[p.user_id]?.avatar_url ?? null : null,
    category: resolveCategoryInfo(p.category_id, categoryMap),
    media_image_urls: p.media_image_urls ?? [],
    media_video_url: p.media_video_url,
    is_hidden: p.is_hidden,
    is_locked: p.is_locked,
    is_pinned: p.is_pinned,
    created_at: p.created_at,
    comment_count: commentsByPost[p.id]?.length ?? 0,
  }))

  return { posts: moderationPosts, commentsByPost, total: count ?? 0 }
}

export type ForumPostForEdit = {
  id: string
  slug: string
  title: string
  body: string | null
  author_name: string
  category_id: string
  media_image_urls: string[]
  media_video_url: string | null
  is_hidden: boolean
  is_locked: boolean
  is_pinned: boolean
  created_at: string
}

/** Carrega um post para edição no admin. */
export async function getForumPostForEdit(slug: string): Promise<ForumPostForEdit | null> {
  const db = createSupabaseAdminClient()
  const { data: post } = await db
    .from("forum_posts")
    .select(
      "id, slug, title, body, author_name, category_id, media_image_urls, media_video_url, is_hidden, is_locked, is_pinned, created_at"
    )
    .eq("slug", slug)
    .maybeSingle()

  return post ? { ...post, media_image_urls: post.media_image_urls ?? [] } : null
}

/** Atualiza campos de um post do fórum (admin). */
export async function updateForumPost(
  slug: string,
  updates: Partial<{
    title: string
    body: string | null
    category_id: string
    media_image_urls: string[]
    media_video_url: string | null
    is_hidden: boolean
    is_locked: boolean
    is_pinned: boolean
  }>
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db.from("forum_posts").select("id").eq("slug", slug).maybeSingle()
  if (!existing) return { ok: false, error: "Post não encontrado.", status: 404 }

  if (updates.category_id && !(await validateCategoryId(updates.category_id))) {
    return { ok: false, error: "Categoria inválida ou inativa.", status: 400 }
  }

  const mediaError = validateMedia(updates.media_image_urls, updates.media_video_url)
  if (mediaError) return { ok: false, error: mediaError, status: 400 }

  // Só 1 post fixado por vez: fixar este desfixa qualquer outro que já estivesse.
  if (updates.is_pinned) {
    await db.from("forum_posts").update({ is_pinned: false }).eq("is_pinned", true).neq("id", existing.id)
  }

  const { error } = await db.from("forum_posts").update(updates).eq("id", existing.id)

  if (error) {
    console.error("[forum-repository] updateForumPost:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true }
}

/** Alterna uma flag de moderação de um post. */
export async function setForumPostFlag(
  postId: string,
  flag: "is_hidden" | "is_locked" | "is_pinned",
  value: boolean
): Promise<void> {
  const db = createSupabaseAdminClient()
  if (flag === "is_hidden") await db.from("forum_posts").update({ is_hidden: value }).eq("id", postId)
  else if (flag === "is_locked") await db.from("forum_posts").update({ is_locked: value }).eq("id", postId)
  else {
    // Só 1 post fixado por vez: fixar este desfixa qualquer outro que já estivesse.
    if (value) await db.from("forum_posts").update({ is_pinned: false }).eq("is_pinned", true).neq("id", postId)
    await db.from("forum_posts").update({ is_pinned: value }).eq("id", postId)
  }
}

/** Oculta/exibe um comentário (moderação). */
export async function setForumCommentHidden(commentId: string, hidden: boolean): Promise<void> {
  const db = createSupabaseAdminClient()
  await db.from("forum_comments").update({ is_hidden: hidden }).eq("id", commentId)
}

/** Exclui definitivamente um post do fórum (comentários e aura são removidos em cascata). */
export async function deleteForumPost(postId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("forum_posts").delete().eq("id", postId)
  if (error) {
    console.error("[forum-repository] deleteForumPost:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true }
}

/** Exclui definitivamente um post do fórum a partir do slug. */
export async function deleteForumPostBySlug(slug: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { data: existing } = await db.from("forum_posts").select("id").eq("slug", slug).maybeSingle()
  if (!existing) return { ok: false, error: "Post não encontrado.", status: 404 }
  return deleteForumPost(existing.id)
}

// ────────────────────────────────────────────
// Denúncias
// ────────────────────────────────────────────

/** Cria uma denúncia direta (sem motivo) de um post ou comentário do fórum. */
export async function createForumReport(params: {
  targetType: "post" | "comment"
  postSlug: string
  commentId?: string | null
  reporterUserId: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db.from("forum_posts").select("id").eq("slug", params.postSlug).maybeSingle()
  if (!post) return { ok: false, error: "Post não encontrado.", status: 404 }

  let commentId: string | null = null
  if (params.targetType === "comment") {
    if (!params.commentId) return { ok: false, error: "Comentário não informado.", status: 400 }
    const { data: comment } = await db
      .from("forum_comments")
      .select("id, post_id")
      .eq("id", params.commentId)
      .maybeSingle()
    if (!comment || comment.post_id !== post.id) {
      return { ok: false, error: "Comentário não encontrado.", status: 404 }
    }
    commentId = comment.id
  }

  const { error } = await db.from("forum_reports").insert({
    target_type: params.targetType,
    post_id: post.id,
    comment_id: commentId,
    reporter_user_id: params.reporterUserId,
  })

  if (error) {
    // Unique violation: já denunciou esse alvo antes.
    if (error.code === "23505") {
      return { ok: false, error: "Você já denunciou isso.", status: 409 }
    }
    console.error("[forum-repository] createForumReport:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true }
}

export type ModerationReport = {
  id: string
  target_type: "post" | "comment"
  status: "pending" | "reviewed" | "dismissed"
  created_at: string
  reporter_name: string
  post_slug: string
  post_preview: string
  comment_body: string | null
}

/** Lista denúncias para a fila de moderação, mais recentes primeiro. */
export async function listForumReportsForModeration(params: {
  status: "all" | "pending" | "reviewed" | "dismissed"
  page: number
  pageSize: number
}): Promise<{ reports: ModerationReport[]; total: number }> {
  const db = createSupabaseAdminClient()
  const start = (params.page - 1) * params.pageSize
  const end = start + params.pageSize - 1

  let query = db
    .from("forum_reports")
    .select("id, target_type, status, created_at, post_id, comment_id, reporter_user_id", { count: "exact" })

  if (params.status !== "all") query = query.eq("status", params.status)

  const { data: rows, count } = await query.order("created_at", { ascending: false }).range(start, end)
  const reportRows = rows ?? []
  if (reportRows.length === 0) return { reports: [], total: count ?? 0 }

  const postIds = [...new Set(reportRows.map((r) => r.post_id))]
  const commentIds = [...new Set(reportRows.map((r) => r.comment_id).filter((id): id is string => !!id))]
  const reporterIds = [...new Set(reportRows.map((r) => r.reporter_user_id))]

  const [{ data: posts }, { data: comments }, { data: reporters }] = await Promise.all([
    db.from("forum_posts").select("id, slug, body_preview").in("id", postIds),
    commentIds.length > 0
      ? db.from("forum_comments").select("id, body").in("id", commentIds)
      : Promise.resolve({ data: [] as { id: string; body: string }[] }),
    db.from("user_profiles").select("id, display_name").in("id", reporterIds),
  ])

  const postMap = new Map((posts ?? []).map((p) => [p.id, p]))
  const commentMap = new Map((comments ?? []).map((c) => [c.id, c]))
  const reporterMap = new Map((reporters ?? []).map((r) => [r.id, r.display_name]))

  const reports: ModerationReport[] = reportRows.map((r) => {
    const post = postMap.get(r.post_id)
    const comment = r.comment_id ? commentMap.get(r.comment_id) : null
    return {
      id: r.id,
      target_type: r.target_type as "post" | "comment",
      status: r.status as ModerationReport["status"],
      created_at: r.created_at,
      reporter_name: reporterMap.get(r.reporter_user_id) ?? "Usuário",
      post_slug: post?.slug ?? "",
      post_preview: post?.body_preview ?? "",
      comment_body: comment?.body ?? null,
    }
  })

  return { reports, total: count ?? 0 }
}

/** Marca uma denúncia como revisada ou descartada. */
export async function setForumReportStatus(
  reportId: string,
  status: "reviewed" | "dismissed"
): Promise<void> {
  const db = createSupabaseAdminClient()
  await db.from("forum_reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", reportId)
}

/** Conta denúncias pendentes, para o badge da fila de moderação. */
export async function countPendingForumReports(): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count } = await db
    .from("forum_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")
  return count ?? 0
}
