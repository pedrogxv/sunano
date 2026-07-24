import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import type { Database } from "@/lib/database.types"

/**
 * Repositório do Fórum — única porta de acesso às tabelas `forum_posts`,
 * `forum_comments` e `forum_votes`.
 *
 * Observação: `forum_votes`, `vote_score`, `body_preview` e `is_pinned` não
 * estão no tipo gerado `Database`; por isso há `as any` pontuais (mantém-se o
 * mesmo comportamento das rotas originais, apenas centralizado aqui).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type PeripheralCategory = Database["public"]["Tables"]["peripherals"]["Row"]["category"]

export type ForumPeripheralRef = {
  id: string
  name: string
  brand: string
  category: string
  image_url: string | null
}

export type ForumListPost = {
  id: string
  slug: string
  title: string
  body: string
  author_name: string
  user_id: string | null
  peripheral_refs: string[]
  created_at: string
  is_locked: boolean
  is_pinned: boolean
  vote_score: number
  comment_count: number
  author_display_name: string
  author_avatar_url: string | null
  peripherals: ForumPeripheralRef[]
}

export type ForumPostDetail = ForumListPost
export type ForumCommentDetail = {
  id: string
  body: string
  author_name: string
  user_id: string | null
  peripheral_refs: string[]
  created_at: string
  author_display_name: string
  author_avatar_url: string | null
  peripherals: ForumPeripheralRef[]
}

export type ForumTab = "recent" | "hot" | "peripheral"

// ── Helpers de enriquecimento ────────────────────────────────────────────────

async function buildProfileMap(userIds: string[]) {
  const map: Record<string, { display_name: string | null; avatar_url: string | null }> = {}
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return map
  const db = createSupabaseAdminClient()
  const { data } = await (db.from("user_profiles") as any)
    .select("id, display_name, avatar_url")
    .in("id", ids)
  for (const row of (data ?? []) as any[]) {
    map[row.id] = { display_name: row.display_name, avatar_url: row.avatar_url }
  }
  return map
}

async function buildPeripheralMap(refs: string[]) {
  const map: Record<string, ForumPeripheralRef> = {}
  const ids = [...new Set(refs.filter(Boolean))]
  if (ids.length === 0) return map
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("peripherals")
    .select("id, name, brand, category, image_url")
    .in("id", ids)
  for (const row of (data ?? []) as any[]) {
    map[row.id] = {
      id: row.id,
      name: row.name,
      brand: row.brand,
      category: row.category,
      image_url: row.image_url ?? null,
    }
  }
  return map
}

function resolvePeripherals(
  refs: string[] | null | undefined,
  map: Record<string, ForumPeripheralRef>
): ForumPeripheralRef[] {
  return (refs ?? [])
    .map((id) => map[id])
    .filter((p): p is ForumPeripheralRef => Boolean(p?.name))
}

// ── Leitura pública ──────────────────────────────────────────────────────────

/** Lista posts visíveis do fórum, conforme a aba selecionada. */
export async function listForumPosts(params: {
  tab: ForumTab
  category?: string
}): Promise<ForumListPost[]> {
  const db = createSupabaseAdminClient()
  const { tab, category } = params

  let query = db
    .from("forum_posts")
    .select(
      "id, slug, title, body_preview, author_name, user_id, peripheral_refs, created_at, is_locked, is_pinned, vote_score"
    )
    .eq("is_hidden", false)

  if (tab === "peripheral") {
    if (category) {
      const { data: perifs } = await db
        .from("peripherals")
        .select("id")
        .eq("category", category as PeripheralCategory)
      const perifIds = ((perifs ?? []) as any[]).map((p) => p.id)
      if (perifIds.length === 0) return []
      query = (query as any).overlaps("peripheral_refs", perifIds)
    } else {
      query = (query as any).not("peripheral_refs", "eq", "{}")
    }
  }

  if (tab === "hot") {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    query = (query as any).gte("created_at", since)
  }

  query = (query as any).order("is_pinned", { ascending: false })
  if (tab === "hot") query = (query as any).order("vote_score", { ascending: false })
  query = (query as any).order("created_at", { ascending: false })
  // Sem paginação na UI ainda — limita para não trazer o fórum inteiro a
  // cada carregamento de página conforme o volume de posts cresce.
  query = (query as any).limit(50)

  const { data: posts, error } = await (query as any)
  if (error) {
    console.error("[forum-repository] listForumPosts:", error)
    throw error
  }

  const rows = (posts ?? []) as any[]
  const postIds = rows.map((p) => p.id)

  const commentCounts: Record<string, number> = {}
  if (postIds.length > 0) {
    const { data: comments } = await db
      .from("forum_comments")
      .select("post_id")
      .in("post_id", postIds)
      .eq("is_hidden", false)
    for (const c of (comments ?? []) as any[]) {
      commentCounts[c.post_id] = (commentCounts[c.post_id] ?? 0) + 1
    }
  }

  const profileMap = await buildProfileMap(rows.map((p) => p.user_id))
  const peripheralMap = await buildPeripheralMap(rows.flatMap((p) => p.peripheral_refs ?? []))

  return rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    body: p.body_preview ?? "",
    author_name: p.author_name,
    user_id: p.user_id,
    peripheral_refs: p.peripheral_refs ?? [],
    created_at: p.created_at,
    is_locked: p.is_locked,
    is_pinned: p.is_pinned ?? false,
    vote_score: p.vote_score ?? 0,
    comment_count: commentCounts[p.id] ?? 0,
    author_display_name: p.user_id
      ? profileMap[p.user_id]?.display_name ?? p.author_name
      : p.author_name,
    author_avatar_url: p.user_id ? profileMap[p.user_id]?.avatar_url ?? null : null,
    peripherals: resolvePeripherals(p.peripheral_refs, peripheralMap),
  }))
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
      "id, slug, title, body, author_name, user_id, peripheral_refs, created_at, is_locked, is_pinned, vote_score"
    )
    .eq("slug", slug)
    .eq("is_hidden", false)
    .maybeSingle()

  if (error) {
    console.error("[forum-repository] getForumPostBySlug:", error)
    throw error
  }
  if (!post) return null

  const p = post as any

  const { data: commentRows } = await db
    .from("forum_comments")
    .select("id, body, author_name, user_id, peripheral_refs, created_at")
    .eq("post_id", p.id)
    .eq("is_hidden", false)
    .order("created_at", { ascending: true })

  const comments = (commentRows ?? []) as any[]

  const profileMap = await buildProfileMap([
    p.user_id,
    ...comments.map((c) => c.user_id),
  ])
  const peripheralMap = await buildPeripheralMap([
    ...(p.peripheral_refs ?? []),
    ...comments.flatMap((c) => c.peripheral_refs ?? []),
  ])

  const enrichedPost: ForumPostDetail = {
    id: p.id,
    slug: p.slug,
    title: p.title,
    body: p.body,
    author_name: p.author_name,
    user_id: p.user_id,
    peripheral_refs: p.peripheral_refs ?? [],
    created_at: p.created_at,
    is_locked: p.is_locked,
    is_pinned: p.is_pinned ?? false,
    vote_score: p.vote_score ?? 0,
    comment_count: comments.length,
    author_display_name: p.user_id
      ? profileMap[p.user_id]?.display_name ?? p.author_name
      : p.author_name,
    author_avatar_url: p.user_id ? profileMap[p.user_id]?.avatar_url ?? null : null,
    peripherals: resolvePeripherals(p.peripheral_refs, peripheralMap),
  }

  const enrichedComments: ForumCommentDetail[] = comments.map((c) => ({
    id: c.id,
    body: c.body,
    author_name: c.author_name,
    user_id: c.user_id,
    peripheral_refs: c.peripheral_refs ?? [],
    created_at: c.created_at,
    author_display_name: c.user_id
      ? profileMap[c.user_id]?.display_name ?? c.author_name
      : c.author_name,
    author_avatar_url: c.user_id ? profileMap[c.user_id]?.avatar_url ?? null : null,
    peripherals: resolvePeripherals(c.peripheral_refs, peripheralMap),
  }))

  return { post: enrichedPost, comments: enrichedComments }
}

/** Retorna os votos do usuário atual para um conjunto de posts. */
export async function getUserForumVotes(
  userId: string,
  postIds: string[]
): Promise<Record<string, number>> {
  const map: Record<string, number> = {}
  if (postIds.length === 0) return map
  const db = createSupabaseAdminClient()
  const { data } = await (db.from("forum_votes") as any)
    .select("post_id, value")
    .eq("user_id", userId)
    .in("post_id", postIds)
  for (const v of (data ?? []) as any[]) {
    map[v.post_id] = v.value
  }
  return map
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

async function createUniqueSlug(baseSlug: string) {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("forum_posts").select("slug").ilike("slug", `${baseSlug}%`)
  const taken = new Set(((data ?? []) as any[]).map((r) => r.slug))
  let slug = baseSlug
  let i = 2
  while (taken.has(slug)) {
    slug = `${baseSlug}-${i}`
    i++
  }
  return slug
}

export type RepositoryResult =
  | { ok: true }
  | { ok: false; error: string; status: number }

/** Cria um novo post de fórum. Retorna o slug gerado. */
export async function createForumPost(params: {
  userId: string
  authorName: string
  title: string
  body: string
  peripheralRefs: string[]
}): Promise<{ ok: true; slug: string } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  if (params.peripheralRefs.length > 0) {
    const { data: perifs } = await db
      .from("peripherals")
      .select("id")
      .in("id", params.peripheralRefs)
    if ((perifs ?? []).length !== params.peripheralRefs.length) {
      return { ok: false, error: "Um ou mais periféricos referenciados não existem.", status: 400 }
    }
  }

  const slug = await createUniqueSlug(slugify(params.title) || `post-${Date.now()}`)

  const { error } = await db.from("forum_posts").insert({
    slug,
    title: params.title.trim(),
    body: params.body.trim(),
    author_name: params.authorName,
    user_id: params.userId,
    peripheral_refs: params.peripheralRefs,
    is_hidden: false,
    is_locked: false,
  } as any)

  if (error) {
    console.error("[forum-repository] createForumPost:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true, slug }
}

/** Adiciona um comentário a um post (respeitando o lock). */
export async function addForumComment(params: {
  postSlug: string
  userId: string
  authorName: string
  body: string
  peripheralRefs: string[]
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  if (params.peripheralRefs.length > 0) {
    const { data: perifs } = await db
      .from("peripherals")
      .select("id")
      .in("id", params.peripheralRefs)
    if ((perifs ?? []).length !== params.peripheralRefs.length) {
      return { ok: false, error: "Um ou mais periféricos referenciados não existem.", status: 400 }
    }
  }

  const { data: post } = await db
    .from("forum_posts")
    .select("id, is_locked")
    .eq("slug", params.postSlug)
    .maybeSingle()

  if (!post) return { ok: false, error: "Post não encontrado.", status: 404 }
  if ((post as any).is_locked) {
    return { ok: false, error: "Este post está fechado para comentários.", status: 403 }
  }

  const { error } = await db.from("forum_comments").insert({
    post_id: (post as any).id,
    body: params.body.trim(),
    author_name: params.authorName,
    user_id: params.userId,
    peripheral_refs: params.peripheralRefs,
    is_hidden: false,
  } as any)

  if (error) {
    console.error("[forum-repository] addForumComment:", error)
    return { ok: false, error: error.message, status: 400 }
  }
  return { ok: true }
}

/** Define/remove o voto do usuário num post e devolve o novo placar. */
export async function setForumVote(params: {
  userId: string
  postSlug: string
  value: -1 | 0 | 1
}): Promise<{ ok: true; voteScore: number } | { ok: false; error: string; status: number }> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db
    .from("forum_posts")
    .select("id, is_hidden")
    .eq("slug", params.postSlug)
    .maybeSingle()

  if (!post || (post as any).is_hidden) {
    return { ok: false, error: "Post não encontrado.", status: 404 }
  }

  const postId = (post as any).id

  if (params.value === 0) {
    await (db.from("forum_votes") as any)
      .delete()
      .eq("user_id", params.userId)
      .eq("post_id", postId)
  } else {
    await (db.from("forum_votes") as any).upsert(
      { user_id: params.userId, post_id: postId, value: params.value },
      { onConflict: "user_id,post_id" }
    )
  }

  const { data: updated } = await db
    .from("forum_posts")
    .select("vote_score")
    .eq("id", postId)
    .maybeSingle()

  return { ok: true, voteScore: (updated as any)?.vote_score ?? 0 }
}

// ── Moderação (admin) ────────────────────────────────────────────────────────

export type ModerationFilter = "all" | "visible" | "hidden" | "locked" | "pinned"

export type ModerationPost = {
  id: string
  slug: string
  title: string
  body_preview: string
  author_name: string
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
      "id, slug, title, body_preview, author_name, is_hidden, is_locked, is_pinned, created_at",
      { count: "exact" }
    )

  if (params.filter === "visible") query = (query as any).eq("is_hidden", false)
  else if (params.filter === "hidden") query = (query as any).eq("is_hidden", true)
  else if (params.filter === "locked") query = (query as any).eq("is_locked", true)
  else if (params.filter === "pinned") query = (query as any).eq("is_pinned", true)

  if (params.q) {
    // Escapa aspas/backslash e envolve em aspas duplas — sintaxe do PostgREST
    // para valores de filtro que podem conter vírgula/ponto (delimitadores
    // do `.or()`), evitando que `q` injete condições extras no filtro.
    const escapedQ = params.q.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
    query = (query as any).or(`title.ilike."%${escapedQ}%",author_name.ilike."%${escapedQ}%"`)
  }

  const { data: posts, count } = await (query as any)
    .order("is_pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .range(start, end)

  const rows = (posts ?? []) as any[]
  const postIds = rows.map((p) => p.id)
  const commentsByPost: Record<string, ModerationComment[]> = {}

  if (postIds.length > 0) {
    const { data: comments } = await db
      .from("forum_comments")
      .select("id, post_id, body, author_name, is_hidden, created_at")
      .in("post_id", postIds)
      .order("created_at", { ascending: true })
    for (const c of (comments ?? []) as ModerationComment[]) {
      ;(commentsByPost[c.post_id] ??= []).push(c)
    }
  }

  const moderationPosts: ModerationPost[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    body_preview: p.body_preview ?? p.body ?? "",
    author_name: p.author_name,
    is_hidden: p.is_hidden,
    is_locked: p.is_locked,
    is_pinned: p.is_pinned ?? false,
    created_at: p.created_at,
    comment_count: commentsByPost[p.id]?.length ?? 0,
  }))

  return { posts: moderationPosts, commentsByPost, total: count ?? 0 }
}

/** Carrega um post (com periféricos resolvidos) para edição no admin. */
export async function getForumPostForEdit(slug: string): Promise<any> {
  const db = createSupabaseAdminClient()
  const { data: post } = await (db
    .from("forum_posts")
    .select(
      "id, slug, title, body, author_name, peripheral_refs, is_hidden, is_locked, is_pinned, vote_score, created_at"
    ) as any)
    .eq("slug", slug)
    .maybeSingle()

  if (!post) return null

  const refs: string[] = (post as any).peripheral_refs ?? []
  let peripherals: { id: string; name: string; brand: string; category: string }[] = []
  if (refs.length > 0) {
    const { data } = await db
      .from("peripherals")
      .select("id, name, brand, category")
      .in("id", refs)
    peripherals = (data ?? []) as typeof peripherals
  }
  return { ...(post as Record<string, unknown>), peripherals }
}

/** Atualiza campos de um post do fórum (admin). */
export async function updateForumPost(
  slug: string,
  updates: Partial<{
    title: string
    body: string
    peripheral_refs: string[]
    is_hidden: boolean
    is_locked: boolean
    is_pinned: boolean
  }>
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("forum_posts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()
  if (!existing) return { ok: false, error: "Post não encontrado.", status: 404 }

  if (updates.peripheral_refs && updates.peripheral_refs.length > 0) {
    const { data: perifs } = await db
      .from("peripherals")
      .select("id")
      .in("id", updates.peripheral_refs)
    if ((perifs ?? []).length !== updates.peripheral_refs.length) {
      return { ok: false, error: "Um ou mais periféricos referenciados não existem.", status: 400 }
    }
  }

  const { error } = await (db.from("forum_posts") as any)
    .update(updates)
    .eq("id", (existing as any).id)

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
  await (db.from("forum_posts") as any).update({ [flag]: value }).eq("id", postId)
}

/** Oculta/exibe um comentário (moderação). */
export async function setForumCommentHidden(commentId: string, hidden: boolean): Promise<void> {
  const db = createSupabaseAdminClient()
  await (db.from("forum_comments") as any).update({ is_hidden: hidden }).eq("id", commentId)
}

/** Exclui definitivamente um post do fórum (comentários e votos são removidos em cascata). */
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
  const { data: existing } = await db
    .from("forum_posts")
    .select("id")
    .eq("slug", slug)
    .maybeSingle()
  if (!existing) return { ok: false, error: "Post não encontrado.", status: 404 }
  return deleteForumPost((existing as any).id)
}
