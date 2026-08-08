import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import type { Database } from "@/lib/database.types"
import { SITE_OWNER_SLUG } from "@/lib/special-tag"
import { completeDailyMission } from "@/lib/server/repositories/achievements-repository"

type AuraLedgerReason = Database["public"]["Tables"]["aura_ledger"]["Row"]["reason"]

/**
 * Repositório do sistema de Aura — reagir (like/dislike) em comentários
 * (`forum_aura`), saldo pessoal (`user_aura_wallet`) e extrato
 * (`aura_ledger`), além dos bônus de criar post/comentário. Toda a
 * atomicidade vive nas funções Postgres `toggle_forum_aura`,
 * `credit_forum_post_creation_aura` e `credit_comment_creation_aura` (ver
 * 20260804_aura_rebalance.sql); este repositório só chama as RPCs e traduz
 * o resultado.
 *
 * Post também recebe reação, mas só "dar aura" (like) — nunca dislike, pra
 * nunca render aura negativa pro autor (ver
 * 20260824000000_forum_post_direct_aura.sql, que reabre o que
 * 20260804130000_aura_no_post_reactions.sql tinha fechado). Por não ter o
 * terceiro estado de "trocar like<->dislike", isso vive numa função/helper
 * dedicados (`toggle_forum_post_aura` / `togglePostAura`) em vez de reusar
 * `toggleAura`.
 */

export type ToggleAuraTarget = "comment" | "blog_comment"
export type ReactionKind = "like" | "dislike"

export type ToggleAuraErrorCode = "self_reaction" | "not_found" | "daily_limit" | "rate_limited" | "unauthenticated" | "unknown"

export type ToggleAuraResult =
  | { ok: true; reaction: ReactionKind | null; auraCount: number }
  | { ok: false; error: string; code: ToggleAuraErrorCode; status: number }

/** Dá, troca ou remove (toggle) a reação do usuário atual num comentário. */
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
      return { ok: false, error: "Você não pode reagir no seu próprio comentário.", code: "self_reaction", status: 400 }
    }
    if (error.message?.includes("target not found")) {
      return { ok: false, error: "Comentário não encontrado.", code: "not_found", status: 404 }
    }
    if (error.message?.includes("daily_aura_limit_reached")) {
      return { ok: false, error: "Você atingiu o limite de 50 reações dadas hoje. Volte amanhã!", code: "daily_limit", status: 429 }
    }
    console.error("[aura-repository] toggleAura:", error)
    return { ok: false, error: "Erro ao reagir.", code: "unknown", status: 400 }
  }

  const result = data?.[0]
  if (!result) {
    return { ok: false, error: "Erro ao reagir.", code: "unknown", status: 400 }
  }
  // Missão diária "dar aura" só quando o resultado é "curtiu" (like), nunca ao remover ou trocar pra dislike.
  if (result.reaction === "like") {
    await completeDailyMission(params.giverId, "aura")
  }
  return { ok: true, reaction: result.reaction as ReactionKind | null, auraCount: result.aura_count }
}

/** Dá ou remove (toggle) a aura do usuário atual num post — só "like", sem dislike (ver `toggle_forum_post_aura`). */
export async function togglePostAura(giverId: string, postId: string): Promise<ToggleAuraResult> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db.rpc("toggle_forum_post_aura", {
    p_giver_id: giverId,
    p_post_id: postId,
  })

  if (error) {
    if (error.message?.includes("self_aura_not_allowed")) {
      return { ok: false, error: "Você não pode dar aura no seu próprio post.", code: "self_reaction", status: 400 }
    }
    if (error.message?.includes("target not found")) {
      return { ok: false, error: "Post não encontrado.", code: "not_found", status: 404 }
    }
    if (error.message?.includes("daily_aura_limit_reached")) {
      return { ok: false, error: "Você atingiu o limite de 50 reações dadas hoje. Volte amanhã!", code: "daily_limit", status: 429 }
    }
    console.error("[aura-repository] togglePostAura:", error)
    return { ok: false, error: "Erro ao dar aura.", code: "unknown", status: 400 }
  }

  const result = data?.[0]
  if (!result) {
    return { ok: false, error: "Erro ao dar aura.", code: "unknown", status: 400 }
  }
  // Missão diária "dar aura" só quando o resultado é "curtiu" — post só tem like, nunca dislike, mas o toggle pode estar removendo.
  if (result.reaction === "like") {
    await completeDailyMission(giverId, "aura")
  }
  return { ok: true, reaction: result.reaction as ReactionKind | null, auraCount: result.aura_count }
}

/** Se o usuário atual já deu aura no post — hidrata o estado inicial do botão. */
export async function getUserPostAuraReaction(userId: string, postId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("forum_aura")
    .select("post_id")
    .eq("giver_id", userId)
    .eq("post_id", postId)
    .maybeSingle()
  return Boolean(data)
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

/** Mesmas `reason`s que `toggle_forum_aura` conta pro limite diário de "dados" (ver 20260804120000_aura_rebalance.sql). */
const DAILY_LIMIT_REASONS: AuraLedgerReason[] = [
  "post_aura_received", "comment_aura_received", "blog_post_aura_received", "blog_comment_aura_received",
  "post_aura_disliked", "comment_aura_disliked", "blog_post_aura_disliked", "blog_comment_aura_disliked",
]

export const DAILY_AURA_GIVE_LIMIT = 50

export type AuraUsage = {
  balance: number
  /** Quantas reações (like/dislike, dar ou trocar) o usuário já deu nas últimas 24h. */
  givenToday: number
  limit: number
  /** `true` quando `givenToday >= limit` — não pode mais dar reação até o rolling window liberar. */
  limitReached: boolean
  /**
   * Quando a reação mais antiga da janela sai do rolling 24h e libera 1 vaga —
   * não é um "reset" fixo (não existe um contador que zera à meia-noite; ver
   * `toggle_forum_aura`), é só a estimativa de quando `givenToday` cai. `null`
   * quando o usuário não está perto do limite (não vale a pena calcular).
   */
  nextSlotAt: string | null
}

/**
 * Saldo + quanto do limite diário de "dar reação" (50/24h, rolling window —
 * não é um contador que zera à meia-noite) o usuário já consumiu, pra
 * exibir na TopBar. Espelha a mesma contagem de `toggle_forum_aura` no
 * banco; se a lógica de lá mudar, atualizar aqui também.
 */
export async function getUserAuraUsage(userId: string): Promise<AuraUsage> {
  const db = createSupabaseAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [{ data: wallet }, { data: ledgerRows, count }] = await Promise.all([
    db.from("user_aura_wallet").select("balance").eq("user_id", userId).maybeSingle(),
    db
      .from("aura_ledger")
      .select("created_at", { count: "exact" })
      .eq("giver_id", userId)
      .gte("created_at", since)
      .in("reason", DAILY_LIMIT_REASONS)
      .order("created_at", { ascending: true })
      .limit(1),
  ])

  const givenToday = count ?? 0
  const limitReached = givenToday >= DAILY_AURA_GIVE_LIMIT
  const oldest = ledgerRows?.[0]?.created_at ?? null
  const nextSlotAt =
    limitReached && oldest ? new Date(new Date(oldest).getTime() + 24 * 60 * 60 * 1000).toISOString() : null

  return {
    balance: wallet?.balance ?? 0,
    givenToday,
    limit: DAILY_AURA_GIVE_LIMIT,
    limitReached,
    nextSlotAt,
  }
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

/** Um comentário por (like, dislike) — conjuntos sempre mutuamente exclusivos. */
export type ReactionSets = { liked: Set<string>; disliked: Set<string> }

/** Quais comentários (dentre os informados) o usuário atual já curtiu/descurtiu. */
export async function getUserAuraGiven(
  userId: string,
  targets: {
    commentIds?: string[]
    blogCommentIds?: string[]
  }
): Promise<{
  comments: ReactionSets
  blogComments: ReactionSets
}> {
  const comments: ReactionSets = { liked: new Set(), disliked: new Set() }
  const blogComments: ReactionSets = { liked: new Set(), disliked: new Set() }
  const commentIds = targets.commentIds ?? []
  const blogCommentIds = targets.blogCommentIds ?? []
  if (commentIds.length === 0 && blogCommentIds.length === 0) {
    return { comments, blogComments }
  }

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("forum_aura")
    .select("comment_id, blog_comment_id, kind")
    .eq("giver_id", userId)
    .or(
      [
        commentIds.length > 0 ? `comment_id.in.(${commentIds.join(",")})` : null,
        blogCommentIds.length > 0 ? `blog_comment_id.in.(${blogCommentIds.join(",")})` : null,
      ]
        .filter(Boolean)
        .join(",")
    )

  for (const row of data ?? []) {
    const bucket = row.comment_id ? comments : row.blog_comment_id ? blogComments : null
    if (!bucket) continue
    const id = (row.comment_id ?? row.blog_comment_id) as string
    ;(row.kind === "dislike" ? bucket.disliked : bucket.liked).add(id)
  }

  return { comments, blogComments }
}
