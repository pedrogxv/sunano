import "server-only"

import type { AccountTier } from "@/lib/account-tier"
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
  body: string
  author_name: string
  user_id: string | null
  category: ForumCategoryInfo | null
  media_image_url: string | null
  media_video_url: string | null
  created_at: string
  is_locked: boolean
  is_pinned: boolean
  comment_count: number
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
  aura_count: number
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_display_slug: string | null
}

export type ForumTab = "recent" | "hot" | "category"

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

// ── Leitura pública ──────────────────────────────────────────────────────────

/** Lista posts visíveis do fórum, conforme a aba selecionada. */
export async function listForumPosts(params: {
  tab: ForumTab
  categoryId?: string
}): Promise<ForumListPost[]> {
  const db = createSupabaseAdminClient()
  const { tab, categoryId } = params

  let query = db
    .from("forum_posts")
    .select(
      "id, slug, body_preview, author_name, user_id, category_id, media_image_url, media_video_url, created_at, is_locked, is_pinned"
    )
    .eq("is_hidden", false)

  if (tab === "category" && categoryId) {
    const ids = await resolveCategoryIdsForFilter(categoryId)
    query = query.in("category_id", ids)
  }

  if (tab === "hot") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    query = query.gte("created_at", since)
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
    body: p.body_preview,
    author_name: p.author_name,
    user_id: p.user_id,
    category: resolveCategoryInfo(p.category_id, categoryMap),
    media_image_url: p.media_image_url,
    media_video_url: p.media_video_url,
    created_at: p.created_at,
    is_locked: p.is_locked,
    is_pinned: p.is_pinned,
    comment_count: commentCounts[p.id] ?? 0,
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

/** Busca um post visível pelo slug, já com comentários enriquecidos. */
export async function getForumPostBySlug(slug: string): Promise<{
  post: ForumPostDetail
  comments: ForumCommentDetail[]
} | null> {
  const db = createSupabaseAdminClient()

  const { data: post, error } = await db
    .from("forum_posts")
    .select(
      "id, slug, body, author_name, user_id, category_id, media_image_url, media_video_url, created_at, is_locked, is_pinned"
    )
    .eq("slug", slug)
    .eq("is_hidden", false)
    .maybeSingle()

  if (error) {
    console.error("[forum-repository] getForumPostBySlug:", error)
    throw error
  }
  if (!post) return null

  const { data: commentRows } = await db
    .from("forum_comments")
    .select("id, body, author_name, user_id, parent_comment_id, created_at, aura_count")
    .eq("post_id", post.id)
    .eq("is_hidden", false)
    .order("created_at", { ascending: true })

  const comments = commentRows ?? []

  const profileMap = await buildProfileMap([post.user_id, ...comments.map((c) => c.user_id)])
  const categoryMap = await buildCategoryMap()

  const enrichedPost: ForumPostDetail = {
    id: post.id,
    slug: post.slug,
    body: post.body,
    author_name: post.author_name,
    user_id: post.user_id,
    category: resolveCategoryInfo(post.category_id, categoryMap),
    media_image_url: post.media_image_url,
    media_video_url: post.media_video_url,
    created_at: post.created_at,
    is_locked: post.is_locked,
    is_pinned: post.is_pinned,
    comment_count: comments.length,
    author_display_name: post.user_id
      ? profileMap[post.user_id]?.display_name ?? post.author_name
      : post.author_name,
    author_avatar_url: post.user_id ? profileMap[post.user_id]?.avatar_url ?? null : null,
    author_account_tier: post.user_id ? profileMap[post.user_id]?.account_tier ?? "common" : "common",
    author_display_slug: post.user_id ? profileMap[post.user_id]?.display_slug ?? null : null,
  }

  const enrichedComments: ForumCommentDetail[] = comments.map((c) => ({
    id: c.id,
    body: c.body,
    author_name: c.author_name,
    user_id: c.user_id,
    parent_comment_id: c.parent_comment_id,
    created_at: c.created_at,
    aura_count: c.aura_count,
    author_display_name: c.user_id ? profileMap[c.user_id]?.display_name ?? c.author_name : c.author_name,
    author_avatar_url: c.user_id ? profileMap[c.user_id]?.avatar_url ?? null : null,
    author_account_tier: c.user_id ? profileMap[c.user_id]?.account_tier ?? "common" : "common",
    author_display_slug: c.user_id ? profileMap[c.user_id]?.display_slug ?? null : null,
  }))

  return { post: enrichedPost, comments: enrichedComments }
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

/** Sem título separado — deriva a semente do slug das primeiras palavras do corpo. */
function slugSeedFromBody(body: string) {
  const firstLine = body.trim().split("\n")[0] ?? ""
  return firstLine.trim().split(/\s+/).slice(0, 8).join(" ")
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

function validateMedia(mediaImageUrl?: string | null, mediaVideoUrl?: string | null) {
  if (mediaImageUrl && mediaVideoUrl) {
    return "Escolha apenas um tipo de mídia: imagem ou vídeo."
  }
  return null
}

/** Cria um novo post de fórum. Retorna o slug gerado. */
export async function createForumPost(params: {
  userId: string
  authorName: string
  body: string
  categoryId: string
  mediaImageUrl?: string | null
  mediaVideoUrl?: string | null
}): Promise<{ ok: true; slug: string } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  const mediaError = validateMedia(params.mediaImageUrl, params.mediaVideoUrl)
  if (mediaError) return { ok: false, error: mediaError, status: 400 }

  if (!(await validateCategoryId(params.categoryId))) {
    return { ok: false, error: "Categoria inválida ou inativa.", status: 400 }
  }

  const seed = slugSeedFromBody(params.body)
  const slug = await createUniqueSlug(slugify(seed) || `post-${Date.now()}`)

  const { data: created, error } = await db
    .from("forum_posts")
    .insert({
      slug,
      body: params.body.trim(),
      author_name: params.authorName,
      user_id: params.userId,
      category_id: params.categoryId,
      media_image_url: params.mediaImageUrl ?? null,
      media_video_url: params.mediaVideoUrl ?? null,
      is_hidden: false,
      is_locked: false,
      is_pinned: false,
      // Coluna herdada de quando post tinha like/dislike: continua zerada e
      // ninguém mais lê, mas `database.types.ts` a exige no insert.
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

// ── Moderação (admin) ────────────────────────────────────────────────────────

export type ModerationFilter = "all" | "visible" | "hidden" | "locked" | "pinned"

export type ModerationPost = {
  id: string
  slug: string
  body_preview: string
  author_name: string
  category: ForumCategoryInfo | null
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
      "id, slug, body_preview, author_name, category_id, is_hidden, is_locked, is_pinned, created_at",
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

  if (postIds.length > 0) {
    const { data: comments } = await db
      .from("forum_comments")
      .select("id, post_id, body, author_name, is_hidden, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true })
    for (const c of comments ?? []) {
      ;(commentsByPost[c.post_id] ??= []).push(c)
    }
  }

  const categoryMap = await buildCategoryMap()

  const moderationPosts: ModerationPost[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    body_preview: p.body_preview ?? "",
    author_name: p.author_name,
    category: resolveCategoryInfo(p.category_id, categoryMap),
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
  body: string
  author_name: string
  category_id: string
  media_image_url: string | null
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
      "id, slug, body, author_name, category_id, media_image_url, media_video_url, is_hidden, is_locked, is_pinned, created_at"
    )
    .eq("slug", slug)
    .maybeSingle()

  return post ?? null
}

/** Atualiza campos de um post do fórum (admin). */
export async function updateForumPost(
  slug: string,
  updates: Partial<{
    body: string
    category_id: string
    media_image_url: string | null
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

  const mediaError = validateMedia(updates.media_image_url, updates.media_video_url)
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
