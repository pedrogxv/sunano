import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { clampPage, rangeFor } from "@/lib/server/repositories/_shared"
import { enrichForumPostRows, type ForumListPost } from "@/lib/server/repositories/forum-repository"

/**
 * Repositório de "Posts Salvos" — relação `user_id` ⇄ `post_id` em
 * `forum_saved_posts` (ver 20260921000013_forum_saved_posts.sql). Segue o
 * mesmo modelo de `createForumReport`: resolve `slug → post.id` e trata a
 * violação de unicidade (`23505`) como um caso normal, não erro.
 */

export type ToggleSavedPostResult =
  | { ok: true; saved: boolean; savedCount: number }
  | { ok: false; error: string; status: number }

async function countSavedPost(db: ReturnType<typeof createSupabaseAdminClient>, postId: string): Promise<number> {
  const { count } = await db
    .from("forum_saved_posts")
    .select("id", { count: "exact", head: true })
    .eq("post_id", postId)
  return count ?? 0
}

/** Salva ou remove (toggle) um post da lista de salvos do usuário atual. */
export async function toggleSavedPost(userId: string, postSlug: string): Promise<ToggleSavedPostResult> {
  const db = createSupabaseAdminClient()

  const { data: post } = await db.from("forum_posts").select("id").eq("slug", postSlug).maybeSingle()
  if (!post) return { ok: false, error: "Post não encontrado.", status: 404 }

  const { data: existing } = await db
    .from("forum_saved_posts")
    .select("id")
    .eq("user_id", userId)
    .eq("post_id", post.id)
    .maybeSingle()

  if (existing) {
    const { error } = await db.from("forum_saved_posts").delete().eq("id", existing.id)
    if (error) {
      console.error("[forum-saved-posts-repository] toggleSavedPost (delete):", error)
      return { ok: false, error: "Erro ao remover dos salvos.", status: 500 }
    }
    return { ok: true, saved: false, savedCount: await countSavedPost(db, post.id) }
  }

  const { error } = await db.from("forum_saved_posts").insert({ user_id: userId, post_id: post.id })
  if (error) {
    // Corrida de duplo-clique: já foi salvo por outra requisição concorrente — trata como sucesso.
    if (error.code === "23505") return { ok: true, saved: true, savedCount: await countSavedPost(db, post.id) }
    console.error("[forum-saved-posts-repository] toggleSavedPost (insert):", error)
    return { ok: false, error: "Erro ao salvar post.", status: 500 }
  }
  return { ok: true, saved: true, savedCount: await countSavedPost(db, post.id) }
}

/** Se o usuário atual já salvou este post — hidrata o estado inicial do botão no card. */
export async function getUserSavedPostState(userId: string, postSlug: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data: post } = await db.from("forum_posts").select("id").eq("slug", postSlug).maybeSingle()
  if (!post) return false

  const { data } = await db
    .from("forum_saved_posts")
    .select("id")
    .eq("user_id", userId)
    .eq("post_id", post.id)
    .maybeSingle()
  return Boolean(data)
}

/**
 * Todos os `post_id` que o usuário atual já salvou — sem join com
 * `forum_posts`, é só a lista de ids. Usada para hidratar o estado de TODOS
 * os botões "salvar" da sessão numa tacada só (`SavedPostsProvider`), em vez
 * de cada `PostCard` perguntar individualmente e o ícone "piscar" errado por
 * 2-3s até a resposta dele voltar.
 */
export async function listSavedPostIdsForUser(userId: string): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("forum_saved_posts").select("post_id").eq("user_id", userId)
  if (error) {
    console.error("[forum-saved-posts-repository] listSavedPostIdsForUser:", error)
    return []
  }
  return (data ?? []).map((row) => row.post_id)
}

export const SAVED_POSTS_PAGE_SIZE = 20

export type PaginatedSavedPosts = {
  posts: ForumListPost[]
  total: number
  totalPages: number
}

/**
 * Posts salvos pelo usuário, paginado (numerado, não infinite scroll — ver
 * decisão do produto). Posts ocultados/removidos depois de salvos nunca
 * aparecem aqui (`!inner` join filtra `is_hidden = false` antes do `range()`,
 * então a contagem/paginação já reflete a exclusão corretamente).
 */
export async function listSavedPosts(userId: string, page = 1): Promise<PaginatedSavedPosts> {
  const db = createSupabaseAdminClient()
  const pageClamped = clampPage(page)
  const [from, to] = rangeFor(pageClamped, SAVED_POSTS_PAGE_SIZE)

  const { data: saved, count, error } = await db
    .from("forum_saved_posts")
    .select(
      "post_id, forum_posts!inner(id, slug, title, body_preview, author_name, user_id, category_id, media_image_urls, media_video_url, created_at, is_locked, is_pinned, is_hidden, aura_count)",
      { count: "exact" }
    )
    .eq("user_id", userId)
    .eq("forum_posts.is_hidden", false)
    .order("created_at", { ascending: false })
    .range(from, to)

  if (error) {
    console.error("[forum-saved-posts-repository] listSavedPosts:", error)
    throw error
  }

  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / SAVED_POSTS_PAGE_SIZE))

  const rows = (saved ?? [])
    .map((row) => (Array.isArray(row.forum_posts) ? row.forum_posts[0] : row.forum_posts))
    .filter((post): post is NonNullable<typeof post> => Boolean(post))

  const posts = await enrichForumPostRows(rows)

  return { posts, total, totalPages }
}
