import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getUserProfiles } from "@/lib/server/repositories/users-repository"

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
  excerpt: string | null
  cover_image_url: string | null
  cover_thumbnail_url: string | null
  read_time_minutes: number | null
  created_at: string
  comment_count: number
  admin_profiles: BlogAuthor
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

export type BlogComment = {
  id: string
  body: string
  author_name: string
  user_id: string | null
  created_at: string
  author_display_name: string
  author_avatar_url: string | null
}

const LIST_COLUMNS =
  "id, title, slug, post_type, author_id, excerpt, cover_image_url, cover_thumbnail_url, read_time_minutes, created_at, admin_profiles(display_name, avatar_url, email), peripherals(id, name, brand, category)"

const DETAIL_COLUMNS =
  "id, title, slug, post_type, peripheral_id, author_id, excerpt, cover_image_url, cover_thumbnail_url, video_url, content, read_time_minutes, created_at, admin_profiles(display_name, avatar_url, email), peripherals(id, name, brand, category)"

// Variantes sem `post_type`, usadas como fallback caso a migração
// `blog_post_type.sql` ainda não tenha sido aplicada.
const LIST_COLUMNS_LEGACY = LIST_COLUMNS.replace("post_type, ", "")
const DETAIL_COLUMNS_LEGACY = DETAIL_COLUMNS.replace("post_type, ", "")

/** Indica que o erro veio de a coluna `post_type` ainda não existir. */
function isMissingPostType(message: string | null | undefined) {
  return Boolean(message && message.includes("post_type"))
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

/** Lista posts publicados, opcionalmente filtrando por periférico. */
export async function listPublishedPosts(peripheralId?: string | null): Promise<BlogListPost[]> {
  const db = createSupabaseAdminClient()
  const runQuery = (columns: string) => {
    let query = db
      .from("blog_posts")
      .select(columns)
      .eq("is_published", true)
      .order("created_at", { ascending: false })
    if (peripheralId) query = query.eq("peripheral_id", peripheralId)
    return query
  }

  let { data, error } = await runQuery(LIST_COLUMNS)
  if (error && isMissingPostType(error.message)) {
    ({ data, error } = await runQuery(LIST_COLUMNS_LEGACY))
  }
  if (error) {
    console.error("[blog-repository] listPublishedPosts:", error)
    return []
  }

  const rows = (data ?? []) as unknown as BlogListPost[]
  const counts = await countCommentsByPost(rows.map((p) => p.id))
  return rows.map((p) => ({ ...p, post_type: p.post_type ?? "review", comment_count: counts[p.id] ?? 0 }))
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

  let { data, error } = await runQuery(DETAIL_COLUMNS)
  if (error && isMissingPostType(error.message)) {
    ({ data, error } = await runQuery(DETAIL_COLUMNS_LEGACY))
  }
  if (error) {
    console.error("[blog-repository] getPublishedPostBySlug:", error)
    return null
  }
  if (!data) return null

  const post = data as unknown as BlogPostDetail
  const counts = await countCommentsByPost([post.id])
  return { ...post, post_type: post.post_type ?? "review", comment_count: counts[post.id] ?? 0 }
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

/**
 * Lista os comentários visíveis de uma notícia, já enriquecidos com o perfil
 * público (`user_profiles`) do autor. Resiliente caso a tabela ainda não exista.
 */
export async function listBlogComments(slug: string): Promise<BlogComment[]> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db
    .from("blog_posts")
    .select("id")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle()
  if (!post) return []

  const postId = (post as { id: string }).id
  const { data: rows, error } = await db
    .from("blog_comments")
    .select("id, body, author_name, user_id, created_at")
    .eq("post_id", postId)
    .eq("is_hidden", false)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[blog-repository] listBlogComments:", error.message)
    return []
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const comments = (rows ?? []) as any[]
  const profiles = await getUserProfiles(comments.map((c) => c.user_id).filter(Boolean))

  return comments.map((c) => ({
    id: c.id,
    body: c.body,
    author_name: c.author_name,
    user_id: c.user_id,
    created_at: c.created_at,
    author_display_name: c.user_id
      ? profiles[c.user_id]?.display_name ?? c.author_name
      : c.author_name,
    author_avatar_url: c.user_id ? profiles[c.user_id]?.avatar_url ?? null : null,
  }))
}

/** Cria um comentário em uma notícia (exige usuário autenticado). */
export async function addBlogComment(params: {
  postSlug: string
  userId: string
  authorName: string
  body: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db
    .from("blog_posts")
    .select("id")
    .eq("slug", params.postSlug)
    .eq("is_published", true)
    .maybeSingle()
  if (!post) return { ok: false, error: "Notícia não encontrada.", status: 404 }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("blog_comments") as any).insert({
    post_id: (post as { id: string }).id,
    body: params.body.trim(),
    author_name: params.authorName,
    user_id: params.userId,
    is_hidden: false,
  })

  if (error) {
    console.error("[blog-repository] addBlogComment:", error.message)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true }
}
