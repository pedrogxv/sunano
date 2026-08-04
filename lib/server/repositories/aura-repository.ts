import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { SITE_OWNER_SLUG } from "@/lib/special-tag"

/**
 * Repositório do sistema de Aura — reagir (like/dislike) em posts e
 * comentários (`forum_aura`), saldo pessoal (`user_aura_wallet`) e extrato
 * (`aura_ledger`), além dos bônus de criar post/comentário. Toda a
 * atomicidade vive nas funções Postgres `toggle_forum_aura`,
 * `credit_forum_post_creation_aura` e `credit_comment_creation_aura` (ver
 * 20260804_aura_rebalance.sql); este repositório só chama as RPCs e traduz
 * o resultado.
 */

export type ToggleAuraTarget = "post" | "comment" | "blog_post" | "blog_comment"
export type ReactionKind = "like" | "dislike"

export type ToggleAuraResult =
  | { ok: true; reaction: ReactionKind | null; auraCount: number }
  | { ok: false; error: string; status: number }

/** Dá, troca ou remove (toggle) a reação do usuário atual num post ou comentário. */
export async function toggleAura(params: {
  giverId: string
  targetType: ToggleAuraTarget
  targetId: string
  kind: ReactionKind
}): Promise<ToggleAuraResult> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db.rpc("toggle_forum_aura", {
    p_giver_id: params.giverId,
    p_target_type: params.targetType,
    p_target_id: params.targetId,
    p_kind: params.kind,
  })

  if (error) {
    if (error.message?.includes("self_aura_not_allowed")) {
      return { ok: false, error: "Você não pode reagir no seu próprio post ou comentário.", status: 400 }
    }
    if (error.message?.includes("target not found")) {
      return { ok: false, error: "Post ou comentário não encontrado.", status: 404 }
    }
    if (error.message?.includes("daily_aura_limit_reached")) {
      return { ok: false, error: "Você atingiu o limite de 50 reações dadas hoje. Volte amanhã!", status: 429 }
    }
    console.error("[aura-repository] toggleAura:", error)
    return { ok: false, error: "Erro ao reagir.", status: 400 }
  }

  const result = data?.[0]
  if (!result) {
    return { ok: false, error: "Erro ao reagir.", status: 400 }
  }
  return { ok: true, reaction: result.reaction as ReactionKind | null, auraCount: result.aura_count }
}

/**
 * Credita +10 de aura ao autor por criar um post no fórum, no máximo 1x a
 * cada 24h (ver `credit_forum_post_creation_aura`). Best-effort: erros são
 * logados mas não impedem a criação do post em si.
 */
export async function creditForumPostCreationAura(userId: string, postId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("credit_forum_post_creation_aura", {
    p_user_id: userId,
    p_post_id: postId,
  })
  if (error) {
    console.error("[aura-repository] creditForumPostCreationAura:", error)
  }
}

/**
 * Credita +5 de aura ao autor por comentar, no máximo 1x por post/notícia
 * (ver `credit_comment_creation_aura`). Best-effort: erros são logados mas
 * não impedem o comentário em si.
 */
export async function creditCommentCreationAura(
  userId: string,
  targetType: "post" | "blog_post",
  targetId: string
): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("credit_comment_creation_aura", {
    p_user_id: userId,
    p_target_type: targetType,
    p_target_id: targetId,
  })
  if (error) {
    console.error("[aura-repository] creditCommentCreationAura:", error)
  }
}

/** Saldo de aura acumulado por um usuário. 0 se ele nunca recebeu aura. */
export async function getUserAuraBalance(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_aura_wallet")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle()
  return data?.balance ?? 0
}

const AURA_RANK_TOP_CUTOFF = 100

/**
 * Id do dono do site, resolvido a partir do slug reservado (`SITE_OWNER_SLUG`)
 * e cacheado em memória — não muda em produção, então uma consulta por
 * instância do servidor basta. Usado só para excluí-lo do cálculo do ranking
 * público de Aura (`getUserAuraRank`); o saldo dele continua intacto na
 * carteira.
 */
let cachedOwnerId: string | null | undefined

async function getSiteOwnerId(
  db: ReturnType<typeof createSupabaseAdminClient>
): Promise<string | null> {
  if (cachedOwnerId !== undefined) return cachedOwnerId
  const { data } = await db
    .from("user_profiles")
    .select("id")
    .eq("display_slug", SITE_OWNER_SLUG)
    .maybeSingle()
  cachedOwnerId = (data as { id: string } | null)?.id ?? null
  return cachedOwnerId
}

/**
 * Posição do usuário no ranking geral de Aura (1 = maior saldo), ou `null`
 * se ele não tem aura nenhuma ou cai fora do Top 100 — a badge de posição no
 * perfil só faz sentido dentro desse recorte.
 *
 * O dono do site não participa do ranking público: no próprio perfil dele
 * isso retorna `null` (sem badge), e o saldo dele é excluído da comparação
 * usada para calcular a posição dos demais — sem isso, todo mundo abaixo
 * dele apareceria uma posição atrás da que deveria.
 */
export async function getUserAuraRank(userId: string): Promise<number | null> {
  const db = createSupabaseAdminClient()
  const ownerId = await getSiteOwnerId(db)
  if (userId === ownerId) return null

  const { data: wallet } = await db
    .from("user_aura_wallet")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle()

  const balance = wallet?.balance ?? 0
  if (balance <= 0) return null

  let countQuery = db
    .from("user_aura_wallet")
    .select("user_id", { count: "exact", head: true })
    .gt("balance", balance)
  if (ownerId) countQuery = countQuery.neq("user_id", ownerId)

  const { count, error } = await countQuery

  if (error) {
    console.error("[aura-repository] getUserAuraRank:", error)
    return null
  }

  const rank = (count ?? 0) + 1
  return rank <= AURA_RANK_TOP_CUTOFF ? rank : null
}

export type AuraLedgerEntry = {
  id: string
  delta: number
  reason: string
  createdAt: string
}

/** Extrato de aura do usuário (mais recentes primeiro). */
export async function listAuraLedger(userId: string, limit = 50): Promise<AuraLedgerEntry[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("aura_ledger")
    .select("id, delta, reason, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[aura-repository] listAuraLedger:", error)
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    delta: row.delta,
    reason: row.reason,
    createdAt: row.created_at,
  }))
}

/** Um post/comentário por (like, dislike) — conjuntos sempre mutuamente exclusivos. */
export type ReactionSets = { liked: Set<string>; disliked: Set<string> }

/** Quais posts/comentários (dentre os informados) o usuário atual já curtiu/descurtiu. */
export async function getUserAuraGiven(
  userId: string,
  targets: {
    postIds: string[]
    commentIds: string[]
    blogPostIds?: string[]
    blogCommentIds?: string[]
  }
): Promise<{
  posts: ReactionSets
  comments: ReactionSets
  blogPosts: ReactionSets
  blogComments: ReactionSets
}> {
  const posts: ReactionSets = { liked: new Set(), disliked: new Set() }
  const comments: ReactionSets = { liked: new Set(), disliked: new Set() }
  const blogPosts: ReactionSets = { liked: new Set(), disliked: new Set() }
  const blogComments: ReactionSets = { liked: new Set(), disliked: new Set() }
  const blogPostIds = targets.blogPostIds ?? []
  const blogCommentIds = targets.blogCommentIds ?? []
  if (
    targets.postIds.length === 0 &&
    targets.commentIds.length === 0 &&
    blogPostIds.length === 0 &&
    blogCommentIds.length === 0
  ) {
    return { posts, comments, blogPosts, blogComments }
  }

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("forum_aura")
    .select("post_id, comment_id, blog_post_id, blog_comment_id, kind")
    .eq("giver_id", userId)
    .or(
      [
        targets.postIds.length > 0 ? `post_id.in.(${targets.postIds.join(",")})` : null,
        targets.commentIds.length > 0 ? `comment_id.in.(${targets.commentIds.join(",")})` : null,
        blogPostIds.length > 0 ? `blog_post_id.in.(${blogPostIds.join(",")})` : null,
        blogCommentIds.length > 0 ? `blog_comment_id.in.(${blogCommentIds.join(",")})` : null,
      ]
        .filter(Boolean)
        .join(",")
    )

  for (const row of data ?? []) {
    const bucket = row.post_id
      ? posts
      : row.comment_id
        ? comments
        : row.blog_post_id
          ? blogPosts
          : row.blog_comment_id
            ? blogComments
            : null
    if (!bucket) continue
    const id = (row.post_id ?? row.comment_id ?? row.blog_post_id ?? row.blog_comment_id) as string
    ;(row.kind === "dislike" ? bucket.disliked : bucket.liked).add(id)
  }

  return { posts, comments, blogPosts, blogComments }
}
