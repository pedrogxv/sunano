import "server-only"

import { cache } from "react"
import { unstable_cache } from "next/cache"
import { coerceAccountTier } from "@/lib/account-tier"
import { slugifyDisplayName, validateDisplayName } from "@/lib/profile-name"
import { SITE_OWNER_SLUG } from "@/lib/special-tag"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  coerceMediaAdjustments,
  DEFAULT_ADJUSTMENTS,
  type ProfileMediaAdjustments,
} from "@/lib/profile-media-adjust"
import type { MiniProfile } from "@/lib/mini-profile"
import type { PublicProfileSummary } from "@/lib/user-directory"
import { getUserStreaksByUser } from "@/lib/server/repositories/achievements-repository"

export type { PublicProfileSummary } from "@/lib/user-directory"
export type { MiniProfile } from "@/lib/mini-profile"

/**
 * Repositório de Perfis — acesso às tabelas `user_profiles` e `admin_profiles`.
 */

export type UserProfile = {
  display_name: string | null
  avatar_url: string | null
}

export type AdminProfileSummary = {
  display_name: string | null
  avatar_url: string | null
  email: string | null
}

/** Perfil público de um usuário do fórum. */
export async function getUserProfile(userId: string): Promise<UserProfile | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("display_name, avatar_url")
    .eq("id", userId)
    .maybeSingle()
  return (data ?? null) as UserProfile | null
}

export type UserVipStatus = { account_tier: string | null; vip_expires_at: string | null }

/** Tier + validade do VIP — usado por GET /api/auth/me para alimentar a tag do dropdown do topbar. */
export async function getUserVipStatus(userId: string): Promise<UserVipStatus | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("account_tier, vip_expires_at")
    .eq("id", userId)
    .maybeSingle()
  return (data ?? null) as UserVipStatus | null
}

/** Perfis públicos de vários usuários do fórum, indexados por id. */
export async function getUserProfiles(
  userIds: string[]
): Promise<Record<string, UserProfile>> {
  const map: Record<string, UserProfile> = {}
  if (userIds.length === 0) return map
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("id, display_name, avatar_url")
    .in("id", [...new Set(userIds)])
  for (const row of (data ?? []) as Array<{ id: string } & UserProfile>) {
    map[row.id] = { display_name: row.display_name, avatar_url: row.avatar_url }
  }
  return map
}

const DIRECTORY_COLUMNS =
  "id, display_name, display_slug, avatar_url, mini_banner_url, account_tier, vip_expires_at, profile_views, created_at"

type DirectoryRow = {
  id: string
  display_name: string | null
  display_slug: string
  avatar_url: string | null
  mini_banner_url: string | null
  account_tier: string | null
  vip_expires_at: string | null
  profile_views: number | null
  created_at: string
}

function toProfileSummary(
  row: DirectoryRow,
  followers = 0,
  aura = 0,
  mediaAdjustments: ProfileMediaAdjustments = DEFAULT_ADJUSTMENTS,
  activity = 0,
  streak = 0
): PublicProfileSummary {
  return {
    id: row.id,
    media_adjustments: mediaAdjustments,
    display_name: row.display_name?.trim() || `Membro ${row.id.slice(0, 6)}`,
    display_slug: row.display_slug,
    avatar_url: row.avatar_url,
    mini_banner_url: row.mini_banner_url,
    account_tier: coerceAccountTier(row.account_tier),
    vip_expires_at: row.vip_expires_at,
    profile_views: row.profile_views ?? 0,
    followers,
    aura,
    activity,
    streak,
    created_at: row.created_at,
  }
}

/**
 * Quantos seguidores cada usuário tem, indexado por id.
 *
 * Uma query só para o lote inteiro: pedir o contador perfil a perfil faria
 * a grade de `/pessoas` disparar uma consulta por card.
 */
async function countFollowersByUser(userIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  if (userIds.length === 0) return counts

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_follows")
    .select("following_id")
    .in("following_id", userIds)

  if (error) {
    console.error("[users-repository] countFollowersByUser:", error)
    return counts
  }
  for (const row of (data ?? []) as Array<{ following_id: string }>) {
    counts[row.following_id] = (counts[row.following_id] ?? 0) + 1
  }
  return counts
}

/**
 * Enquadramento das imagens de cada usuário, indexado por id.
 *
 * Query própria (e não uma coluna a mais no `select` do diretório) por causa
 * do descompasso conhecido entre as migrations versionadas e o banco: se
 * `media_adjustments` ainda não tiver sido criada no ambiente, o PostgREST
 * responde 42703 e derrubaria a listagem inteira. Isolada aqui, a falta da
 * coluna só significa "todo mundo no enquadramento padrão".
 */
export async function getMediaAdjustmentsByUser(
  userIds: string[]
): Promise<Record<string, ProfileMediaAdjustments>> {
  const map: Record<string, ProfileMediaAdjustments> = {}
  if (userIds.length === 0) return map

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select("id, media_adjustments")
    .in("id", userIds)

  if (error) {
    // 42703 = coluna inexistente: migration ainda não aplicada, segue no padrão.
    if (error.code !== "42703") {
      console.error("[users-repository] getMediaAdjustmentsByUser:", error)
    }
    return map
  }
  for (const row of (data ?? []) as Array<{ id: string; media_adjustments: unknown }>) {
    map[row.id] = coerceMediaAdjustments(row.media_adjustments)
  }
  return map
}

/**
 * Saldo de Aura de cada usuário, indexado por id. Mesma carteira que o fórum
 * credita (`user_aura_wallet`, ver 20260806_forum_aura.sql) — quem nunca
 * recebeu aura não tem linha, e fica de fora do mapa (lido como 0).
 */
async function getAuraByUser(userIds: string[]): Promise<Record<string, number>> {
  const balances: Record<string, number> = {}
  if (userIds.length === 0) return balances

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_aura_wallet")
    .select("user_id, balance")
    .in("user_id", userIds)

  if (error) {
    console.error("[users-repository] getAuraByUser:", error)
    return balances
  }
  for (const row of (data ?? []) as Array<{ user_id: string; balance: number }>) {
    balances[row.user_id] = row.balance
  }
  return balances
}

/**
 * Atividade (posts do fórum + comentários do fórum + comentários em
 * notícias) de um lote de usuários, indexada por id. Posts de notícia ficam
 * de fora: `blog_posts.author_id` aponta para `admin_profiles`, não para
 * membros comuns — só o comentário ali é atividade de usuário de verdade.
 * Itens ocultos pela moderação não contam, mesmo padrão de `countForumActivity`.
 *
 * Reaproveita o mapa global cacheado de `getActivityCounts` (5 min) em vez de
 * rodar 3 queries próprias filtradas por `userIds` — `withCounters` chama
 * isto para CADA card do diretório de pessoas (Aura, Visitados, Seguidores,
 * Seguindo, Streak), então essas 3 queries eram refeitas a cada troca de aba
 * mesmo já existindo o agregado cacheado.
 */
async function countActivityByUser(userIds: string[]): Promise<Record<string, number>> {
  const counts: Record<string, number> = {}
  if (userIds.length === 0) return counts

  const allCounts = await getActivityCounts()
  for (const id of userIds) {
    counts[id] = allCounts[id] ?? 0
  }
  return counts
}

/**
 * Mesma contagem de atividade, mas para a base inteira de usuários — usada
 * pelo ranking "Mais Ativos" e pela posição do usuário nele. Sem view/função
 * de agregação (ver `getMostFollowedProfiles`), então soma em JS; compensa
 * enquanto a base de membros for pequena.
 *
 * `unstable_cache` (5 min): esta é a query mais cara do diretório — 3 full
 * scans (`forum_posts`, `forum_comments`, `blog_comments`) sem filtro nem
 * limite. Era refeita a cada troca de aba em `/pessoas` (sem cache nenhum,
 * `force-dynamic`) e a cada visita de qualquer perfil (via
 * `getUserActivityRank`). Um ranking de atividade não precisa de segundo a
 * segundo — 5 min de defasagem é imperceptível e corta a maior parte da carga.
 */
const getActivityCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const db = createSupabaseAdminClient()
    const [posts, comments, blogComments] = await Promise.all([
      db.from("forum_posts").select("user_id").eq("is_hidden", false),
      db.from("forum_comments").select("user_id").eq("is_hidden", false),
      db.from("blog_comments").select("user_id").eq("is_hidden", false),
    ])

    const counts: Record<string, number> = {}
    for (const res of [posts, comments, blogComments]) {
      if (res.error) {
        console.error("[users-repository] getActivityCounts:", res.error)
        continue
      }
      for (const row of (res.data ?? []) as Array<{ user_id: string | null }>) {
        if (!row.user_id) continue
        counts[row.user_id] = (counts[row.user_id] ?? 0) + 1
      }
    }
    return counts
  },
  ["users-repository:getActivityCounts"],
  { revalidate: 300 }
)

/**
 * Filtro compartilhado por TODAS as abas do diretório de pessoas (Aura,
 * Visitados, Seguidores, Seguindo) e pela busca: esconde o dono do site
 * (`SITE_OWNER_SLUG`) e qualquer conta banida (`account_banned_at`) das
 * listagens públicas sem apagar seus dados — os demais usuários sobem uma
 * posição. Antes cada função repetia (ou esquecia de repetir) o `.neq` na sua
 * própria query; centralizado aqui, uma aba nova herda o filtro por padrão.
 * O perfil público (`/perfil/[slug]`) continua acessível por link direto — só
 * as listagens/rankings/busca usam este filtro.
 */
function excludeFromPublicListings<
  Q extends { neq(column: string, value: string): Q; is(column: string, value: null): Q },
>(query: Q): Q {
  return query.neq("display_slug", SITE_OWNER_SLUG).is("account_banned_at", null)
}

/**
 * Anexa seguidores e saldo de Aura a um lote de linhas do diretório. Os dois
 * contadores vêm em paralelo e num lote só cada — o card mostra ambos, e pedir
 * perfil a perfil faria a grade disparar uma consulta por card.
 */
async function withCounters(rows: DirectoryRow[]): Promise<PublicProfileSummary[]> {
  const ids = rows.map((r) => r.id)
  const [followers, aura, adjustments, activity, streaks] = await Promise.all([
    countFollowersByUser(ids),
    getAuraByUser(ids),
    getMediaAdjustmentsByUser(ids),
    countActivityByUser(ids),
    getUserStreaksByUser(ids),
  ])
  return rows.map((row) =>
    toProfileSummary(
      row,
      followers[row.id] ?? 0,
      aura[row.id] ?? 0,
      adjustments[row.id] ?? DEFAULT_ADJUSTMENTS,
      activity[row.id] ?? 0,
      streaks[row.id] ?? 0
    )
  )
}

/**
 * Busca perfis pelo nome de exibição. Termos com menos de 2 caracteres não
 * buscam — evita varrer a tabela a cada tecla antes de o usuário terminar
 * de escrever.
 */
export async function searchUserProfiles(
  query: string,
  limit = 10
): Promise<PublicProfileSummary[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const db = createSupabaseAdminClient()
  const { data, error } = await excludeFromPublicListings(
    db.from("user_profiles").select(DIRECTORY_COLUMNS)
  )
    .ilike("display_name", `%${trimmed}%`)
    .order("profile_views", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[users-repository] searchUserProfiles:", error)
    return []
  }
  return withCounters((data ?? []) as DirectoryRow[])
}

/** Perfis com mais visitas. O dono do site fica de fora (ver `excludeFromPublicListings`). */
export async function getMostVisitedProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await excludeFromPublicListings(
    db.from("user_profiles").select(DIRECTORY_COLUMNS)
  )
    .order("profile_views", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[users-repository] getMostVisitedProfiles:", error)
    return []
  }
  return withCounters((data ?? []) as DirectoryRow[])
}

/**
 * Perfis com mais Aura acumulada (`user_aura_wallet.balance`, a carteira que o
 * fórum credita).
 *
 * O ranking sai da carteira, não de `user_profiles`: só quem já recebeu aura
 * tem linha lá, então a consulta pesada já vem limitada a esse grupo. Como
 * quase ninguém tem aura no começo, o resto da página é preenchido com os
 * demais membros — todos empatados em 0 —, ordenados por visitas, que é a
 * ordem que esta aba tinha antes e continua visível no card. Sem isso o
 * diretório inteiro encolheria para meia dúzia de cards.
 *
 * O dono do site (`SITE_OWNER_SLUG`) não participa deste ranking público:
 * sua aura continua sendo somada normalmente na carteira, só não aparece
 * aqui, nem no pódio nem na lista — os demais sobem uma posição para
 * preencher a vaga. Buscamos um item a mais que `limit` na carteira só para
 * cobrir o caso dele estar entre os top N; o `slice` abaixo recorta de volta.
 */
export async function getTopAuraProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()

  const { data: wallets, error: walletsError } = await db
    .from("user_aura_wallet")
    .select("user_id, balance")
    .gt("balance", 0)
    .order("balance", { ascending: false })
    .limit(limit + 1)

  if (walletsError) {
    console.error("[users-repository] getTopAuraProfiles:", walletsError)
  }

  const balances = new Map(
    ((wallets ?? []) as Array<{ user_id: string; balance: number }>).map((r) => [
      r.user_id,
      r.balance,
    ])
  )
  const rankedIds = [...balances.keys()]

  const { data: rankedRows, error: rankedError } = rankedIds.length
    ? await excludeFromPublicListings(
        db.from("user_profiles").select(DIRECTORY_COLUMNS).in("id", rankedIds)
      )
    : { data: [], error: null }

  if (rankedError) {
    console.error("[users-repository] getTopAuraProfiles ranked:", rankedError)
  }

  // A carteira pode apontar para uma conta sem perfil (perfil excluído): o
  // ranking é o que voltou de user_profiles, não o que voltou da carteira.
  const ranked = ((rankedRows ?? []) as DirectoryRow[])
    .sort((a, b) => (balances.get(b.id) ?? 0) - (balances.get(a.id) ?? 0))
    .slice(0, limit)

  const remaining = limit - ranked.length
  let fillers: DirectoryRow[] = []
  if (remaining > 0) {
    let query = excludeFromPublicListings(db.from("user_profiles").select(DIRECTORY_COLUMNS))
      .order("profile_views", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(remaining)
    if (ranked.length > 0) {
      query = query.not("id", "in", `(${ranked.map((r) => r.id).join(",")})`)
    }

    const { data, error } = await query
    if (error) {
      console.error("[users-repository] getTopAuraProfiles fillers:", error)
    }
    fillers = (data ?? []) as DirectoryRow[]
  }

  // `withCounters` preserva a ordem que chega — ranqueados por aura, depois o
  // preenchimento — e é ele quem carimba o saldo em cada card.
  return withCounters([...ranked, ...fillers])
}

/**
 * Perfis com a maior ofensiva ativa ("Maiores Ofensivas").
 *
 * `user_streaks.current_streak` sozinho não basta: uma ofensiva com
 * `last_completed_date` de mais de 1 dia atrás está expirada (mesma regra de
 * `isStreakActive` em `achievements-repository.ts`), mas o banco não zera a
 * linha sozinho — só a leitura decide isso. Por isso busca-se um lote maior
 * que `limit` ordenado por `current_streak` e filtra-se as expiradas em JS
 * antes de cortar pro tamanho pedido; o `getUserStreaksByUser` do
 * `withCounters` reaplica a mesma regra depois, então o número que aparece
 * no card sempre bate com o motivo de ele estar no ranking.
 *
 * O dono do site fica de fora (mesmo critério de `getTopAuraProfiles`).
 */
export async function getTopStreakProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()

  const { data: streakRows, error: streaksError } = await db
    .from("user_streaks")
    .select("user_id, current_streak, last_completed_date")
    .gt("current_streak", 0)
    .order("current_streak", { ascending: false })
    .limit(limit * 3 + 10)

  if (streaksError) {
    console.error("[users-repository] getTopStreakProfiles:", streaksError)
  }

  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const active = ((streakRows ?? []) as Array<{
    user_id: string
    current_streak: number
    last_completed_date: string | null
  }>)
    .filter((r) => r.last_completed_date === today || r.last_completed_date === yesterday)
    .slice(0, limit)

  const rankedIds = active.map((r) => r.user_id)

  const { data: rankedRows, error: rankedError } = rankedIds.length
    ? await excludeFromPublicListings(
        db.from("user_profiles").select(DIRECTORY_COLUMNS).in("id", rankedIds)
      )
    : { data: [], error: null }

  if (rankedError) {
    console.error("[users-repository] getTopStreakProfiles ranked:", rankedError)
  }

  const streakByUser = new Map(active.map((r) => [r.user_id, r.current_streak]))
  const ranked = ((rankedRows ?? []) as DirectoryRow[]).sort(
    (a, b) => (streakByUser.get(b.id) ?? 0) - (streakByUser.get(a.id) ?? 0)
  )

  const remaining = limit - ranked.length
  let fillers: DirectoryRow[] = []
  if (remaining > 0) {
    let query = excludeFromPublicListings(db.from("user_profiles").select(DIRECTORY_COLUMNS))
      .order("profile_views", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(remaining)
    if (ranked.length > 0) {
      query = query.not("id", "in", `(${ranked.map((r) => r.id).join(",")})`)
    }

    const { data, error } = await query
    if (error) {
      console.error("[users-repository] getTopStreakProfiles fillers:", error)
    }
    fillers = (data ?? []) as DirectoryRow[]
  }

  return withCounters([...ranked, ...fillers])
}

/** Perfis criados mais recentemente. */
export async function getNewestProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await excludeFromPublicListings(
    db.from("user_profiles").select(DIRECTORY_COLUMNS)
  )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[users-repository] getNewestProfiles:", error)
    return []
  }
  return withCounters((data ?? []) as DirectoryRow[])
}

/** Perfis que `userId` segue, do mais recente para o mais antigo. */
export async function getFollowingProfiles(
  userId: string,
  limit = 48
): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const { data: follows, error } = await db
    .from("user_follows")
    .select("following_id, created_at")
    .eq("follower_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[users-repository] getFollowingProfiles:", error)
    return []
  }

  const ids = (follows ?? []).map((r) => (r as { following_id: string }).following_id)
  if (ids.length === 0) return []

  const { data, error: profilesError } = await excludeFromPublicListings(
    db.from("user_profiles").select(DIRECTORY_COLUMNS).in("id", ids)
  )

  if (profilesError) {
    console.error("[users-repository] getFollowingProfiles:", profilesError)
    return []
  }

  // O `in` volta em ordem arbitrária — restaura a ordem de quando seguiu.
  const rank = new Map(ids.map((id, index) => [id, index]))
  const profiles = await withCounters((data ?? []) as DirectoryRow[])
  return profiles.sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  )
}

/** Perfis que seguem `userId`, do mais recente para o mais antigo. */
export async function getFollowerProfiles(
  userId: string,
  limit = 48
): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const { data: follows, error } = await db
    .from("user_follows")
    .select("follower_id, created_at")
    .eq("following_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[users-repository] getFollowerProfiles:", error)
    return []
  }

  const ids = (follows ?? []).map((r) => (r as { follower_id: string }).follower_id)
  if (ids.length === 0) return []

  const { data, error: profilesError } = await excludeFromPublicListings(
    db.from("user_profiles").select(DIRECTORY_COLUMNS).in("id", ids)
  )

  if (profilesError) {
    console.error("[users-repository] getFollowerProfiles:", profilesError)
    return []
  }

  // O `in` volta em ordem arbitrária — restaura a ordem de quando passou a seguir.
  const rank = new Map(ids.map((id, index) => [id, index]))
  const profiles = await withCounters((data ?? []) as DirectoryRow[])
  return profiles.sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  )
}

/**
 * Contagem agregada de `user_follows` (quantos seguidores cada `following_id`
 * tem), para o ranking "Mais Seguidos".
 *
 * `unstable_cache` (5 min): sem coluna/view de agregação, a única forma de
 * ordenar por número de seguidores é trazer TODA a tabela `user_follows` e
 * somar em JS. Cachear evita repetir esse full scan a cada troca de aba no
 * diretório `/pessoas` — mesmo raciocínio de `getActivityCounts`.
 */
const getFollowCounts = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const db = createSupabaseAdminClient()
    const { data: followRows, error } = await db.from("user_follows").select("following_id")

    if (error) {
      console.error("[users-repository] getFollowCounts:", error)
      return {}
    }

    const counts: Record<string, number> = {}
    for (const row of (followRows ?? []) as Array<{ following_id: string }>) {
      counts[row.following_id] = (counts[row.following_id] ?? 0) + 1
    }
    return counts
  },
  ["users-repository:getFollowCounts"],
  { revalidate: 300 }
)

/**
 * Perfis com mais seguidores.
 *
 * A ordenação acontece aqui e não no banco porque o contador não é uma
 * coluna: agregar `user_follows` e ordenar exigiria uma view/função. Enquanto
 * a base de membros for pequena isso não compensa — o dia em que compensar,
 * a troca fica contida nesta função.
 *
 * O dono do site fica de fora (ver `excludeFromPublicListings`). A contagem de
 * seguidores é feita por id, então buscamos um a mais que `limit` para cobrir
 * o caso dele estar entre os top N — mesmo padrão de `getTopAuraProfiles`.
 */
export async function getMostFollowedProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const counts = await getFollowCounts()

  const topIds = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit + 1)
    .map(([id]) => id)

  if (topIds.length === 0) return []

  const { data, error: profilesError } = await excludeFromPublicListings(
    db.from("user_profiles").select(DIRECTORY_COLUMNS).in("id", topIds)
  )

  if (profilesError) {
    console.error("[users-repository] getMostFollowedProfiles:", profilesError)
    return []
  }

  // Os seguidores já foram contados aqui; só aura e atividade faltam buscar.
  const rows = (data ?? []) as DirectoryRow[]
  const [aura, activity] = await Promise.all([
    getAuraByUser(rows.map((r) => r.id)),
    countActivityByUser(rows.map((r) => r.id)),
  ])

  // O `in` volta em ordem arbitrária — reordena pelo ranking de seguidores.
  return rows
    .map((row) =>
      toProfileSummary(
        row,
        counts[row.id] ?? 0,
        aura[row.id] ?? 0,
        DEFAULT_ADJUSTMENTS,
        activity[row.id] ?? 0
      )
    )
    .sort((a, b) => b.followers - a.followers)
    .slice(0, limit)
}

/**
 * Perfis com mais atividade (posts do fórum + comentários do fórum + comentários
 * em notícias somados).
 *
 * Mesma estratégia de `getMostFollowedProfiles`: sem coluna nem view para
 * ordenar no banco, então soma em JS a partir das três tabelas de origem.
 * O dono do site fica de fora (ver `excludeFromPublicListings`); buscamos um a mais
 * que `limit` para cobrir o caso dele estar entre os top N.
 */
export async function getMostActiveProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const counts = await getActivityCounts()

  const topIds = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit + 1)
    .map(([id]) => id)

  if (topIds.length === 0) return []

  const { data, error: profilesError } = await excludeFromPublicListings(
    db.from("user_profiles").select(DIRECTORY_COLUMNS).in("id", topIds)
  )

  if (profilesError) {
    console.error("[users-repository] getMostActiveProfiles:", profilesError)
    return []
  }

  const rows = (data ?? []) as DirectoryRow[]
  const [followers, aura, adjustments] = await Promise.all([
    countFollowersByUser(rows.map((r) => r.id)),
    getAuraByUser(rows.map((r) => r.id)),
    getMediaAdjustmentsByUser(rows.map((r) => r.id)),
  ])

  // O `in` volta em ordem arbitrária — reordena pela contagem de atividade.
  return rows
    .map((row) =>
      toProfileSummary(
        row,
        followers[row.id] ?? 0,
        aura[row.id] ?? 0,
        adjustments[row.id] ?? DEFAULT_ADJUSTMENTS,
        counts[row.id] ?? 0
      )
    )
    .sort((a, b) => b.activity - a.activity)
    .slice(0, limit)
}

/**
 * Ids fixos dos moderadores da comunidade, exibidos na sidebar do Fórum.
 *
 * Não é o mesmo conceito do `role` de `admin_profiles` (que controla acesso
 * ao painel admin): Ryantech, por exemplo, tem `role: "admin"` ali, não
 * "moderator". Lista mantida à mão até existir um flag próprio para
 * "moderador da comunidade".
 */
const FORUM_MODERATOR_IDS = [
  "2d1a5685-391e-41a4-9042-2b45d2eb6e99", // victinho
  "755eaaed-d9b7-443b-8312-728446c8d538", // end
  "de85833c-70b8-440b-ab10-0202ae869c13", // ryantechofc
]

/** Perfis dos moderadores da comunidade, na ordem fixa acima. */
export async function getForumModeratorProfiles(): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select(DIRECTORY_COLUMNS)
    .in("id", FORUM_MODERATOR_IDS)

  if (error) {
    console.error("[users-repository] getForumModeratorProfiles:", error)
    return []
  }

  const rows = (data ?? []) as DirectoryRow[]
  const byId = new Map(rows.map((row) => [row.id, row]))
  return FORUM_MODERATOR_IDS.map((id) => byId.get(id))
    .filter((row): row is DirectoryRow => Boolean(row))
    .map((row) => toProfileSummary(row))
}

const ACTIVITY_RANK_TOP_CUTOFF = 100

/**
 * Posição do usuário no ranking geral de atividade (1 = mais posts +
 * comentários), ou `null` se ele não tem atividade nenhuma ou cai fora do
 * Top 100 — mesmo recorte de `getUserAuraRank`, para a badge no perfil só
 * aparecer quando a posição diz alguma coisa.
 *
 * O dono do site não participa deste ranking público, mesmo critério de
 * `getUserAuraRank`.
 */
export const getUserActivityRank = cache(async (userId: string): Promise<number | null> => {
  const ownerId = await findUserIdByDisplaySlug(SITE_OWNER_SLUG)
  if (userId === ownerId) return null

  const counts = await getActivityCounts()
  const activity = counts[userId] ?? 0
  if (activity <= 0) return null

  let rank = 1
  for (const [id, count] of Object.entries(counts)) {
    if (id === ownerId || id === userId) continue
    if (count > activity) rank += 1
  }
  return rank <= ACTIVITY_RANK_TOP_CUTOFF ? rank : null
})

/**
 * Registra uma visita ao perfil público. Via RPC (`increment_profile_views`)
 * para o incremento ser atômico — ver `20260730_people_directory.sql`.
 */
export async function incrementProfileViews(userId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("increment_profile_views", { p_user_id: userId })
  if (error) console.error("[users-repository] incrementProfileViews:", error)
}

/** Quantas pessoas seguem este perfil. */
export async function countFollowers(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("user_follows")
    .select("follower_id", { count: "exact", head: true })
    .eq("following_id", userId)

  if (error) {
    console.error("[users-repository] countFollowers:", error)
    return 0
  }
  return count ?? 0
}

/** `true` quando `followerId` já segue `followingId`. */
export async function isFollowing(followerId: string, followingId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_follows")
    .select("follower_id")
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
    .maybeSingle()
  return Boolean(data)
}

/**
 * Passa a seguir um perfil. Idempotente: a PK composta transforma o segundo
 * "seguir" num conflito, que é ignorado em vez de virar erro na UI.
 */
export async function followUser(followerId: string, followingId: string): Promise<void> {
  if (followerId === followingId) return
  const db = createSupabaseAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("user_follows") as any).upsert(
    { follower_id: followerId, following_id: followingId },
    { onConflict: "follower_id,following_id", ignoreDuplicates: true }
  )
  if (error) throw error
}

/** Deixa de seguir. Idempotente. */
export async function unfollowUser(followerId: string, followingId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  await db
    .from("user_follows")
    .delete()
    .eq("follower_id", followerId)
    .eq("following_id", followingId)
}

/**
 * Dentre `userIds`, quais o usuário já segue. Serve para a grade de
 * `/pessoas` renderizar o estado certo de cada botão sem uma chamada por card.
 */
export async function getFollowedIdsAmong(
  followerId: string,
  userIds: string[]
): Promise<string[]> {
  if (userIds.length === 0) return []
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_follows")
    .select("following_id")
    .eq("follower_id", followerId)
    .in("following_id", userIds)

  if (error) {
    console.error("[users-repository] getFollowedIdsAmong:", error)
    return []
  }
  return (data ?? []).map((r) => (r as { following_id: string }).following_id)
}

/**
 * `true` quando o nome ainda está livre. A checagem é pelo slug — é ele que
 * tem índice único —, então "João Silva" e "joao silva" disputam a mesma vaga.
 * `exceptUserId` deixa o próprio dono "reservar" o nome que já usa.
 */
export async function isDisplayNameAvailable(
  name: string,
  exceptUserId?: string
): Promise<boolean> {
  const slug = slugifyDisplayName(name)
  if (!slug) return false

  const db = createSupabaseAdminClient()
  let query = db.from("user_profiles").select("id").eq("display_slug", slug).limit(1)
  if (exceptUserId) query = query.neq("id", exceptUserId)

  const { data, error } = await query
  // Na dúvida (erro de rede/coluna) não liberamos o nome: o índice único do
  // banco ainda barra a gravação, mas a UI não deve prometer o que não pode.
  if (error) return false
  return (data ?? []).length === 0
}

/**
 * Primeiro nome livre a partir de `base` — "tried", "tried2", "tried3"…
 * Usado onde não dá para pedir outro nome ao usuário (login social, e-mail
 * derivado no primeiro save de perfil), nunca para sobrescrever uma escolha
 * explícita. Pula tanto colisão de unicidade quanto nomes reservados
 * (`validateDisplayName`) — sem isso, uma conta cujo nome/e-mail sugerido bate
 * com uma palavra reservada (ex.: e-mail "sunano@...") ficava com um nome
 * jamais gravável por essa via, mesmo sem ter escolhido esse nome.
 */
export async function resolveAvailableDisplayName(
  base: string,
  userId: string
): Promise<string> {
  const cleaned = base.trim().slice(0, 30)
  const fallback = `user-${userId.replace(/-/g, "").slice(0, 8)}`
  const root = slugifyDisplayName(cleaned).length >= 2 ? cleaned : fallback

  const usable = async (candidate: string) =>
    !validateDisplayName(candidate) && (await isDisplayNameAvailable(candidate, userId))

  if (await usable(root)) return root

  for (let attempt = 2; attempt <= 50; attempt += 1) {
    const candidate = `${root}${attempt}`
    if (await usable(candidate)) return candidate
  }
  // Improvável: 50 variações ocupadas/reservadas. O id não colide com nada.
  return fallback
}

/** Id do usuário dono de um slug de perfil (`/perfil/<slug>`). */
// `React.cache`: chamada por `resolveUserId` em `/perfil/[handle]` (2x:
// generateMetadata + página) e de novo dentro de `getUserActivityRank`
// (via `getSiteOwnerId`) na mesma requisição — dedupe por (slug).
export const findUserIdByDisplaySlug = cache(async (slug: string): Promise<string | null> => {
  const normalized = slugifyDisplayName(slug)
  if (!normalized) return null

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("id")
    .eq("display_slug", normalized)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
})

/**
 * Dados do cartão de preview rápido ("Mini Perfil"), resolvidos por slug.
 *
 * Existe separado de `getProfileShowcase` porque o cartão é carregado sob
 * demanda no hover: ele não precisa de setup, medalhas nem favoritos, e
 * puxar tudo isso a cada passada de mouse sairia caro.
 */
export async function getMiniProfileBySlug(slug: string): Promise<MiniProfile | null> {
  const normalized = slugifyDisplayName(slug)
  if (!normalized) return null

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select(`${DIRECTORY_COLUMNS}, bio`)
    .eq("display_slug", normalized)
    .maybeSingle()

  if (error || !data) {
    if (error) console.error("[users-repository] getMiniProfileBySlug:", error)
    return null
  }

  const row = data as DirectoryRow & { bio: string | null }
  const [followers, aura, adjustments, activity, streaks] = await Promise.all([
    countFollowersByUser([row.id]),
    getAuraByUser([row.id]),
    getMediaAdjustmentsByUser([row.id]),
    countActivityByUser([row.id]),
    getUserStreaksByUser([row.id]),
  ])
  const summary = toProfileSummary(
    row,
    followers[row.id] ?? 0,
    aura[row.id] ?? 0,
    adjustments[row.id] ?? DEFAULT_ADJUSTMENTS,
    activity[row.id] ?? 0
  )

  return { ...summary, bio: row.bio, streak: streaks[row.id] ?? 0 }
}

/** Resumo do perfil administrativo (usado pela sidebar admin). */
export async function getAdminProfileSummary(
  userId: string
): Promise<AdminProfileSummary | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("admin_profiles")
    .select("display_name, avatar_url, email")
    .eq("id", userId)
    .maybeSingle()
  return (data ?? null) as AdminProfileSummary | null
}

/** Indica se o usuário possui acesso administrativo. */
export async function isAdminUser(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("admin_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle()
  return Boolean(data)
}

/**
 * Cria/atualiza o perfil de um usuário a partir dos metadados de autenticação.
 *
 * Retorna `isNew: true` quando essa chamada criou o perfil pela primeira vez
 * (primeiro login OAuth, ou fallback de login por senha sem perfil ainda) —
 * usado para conceder medalhas de evento só a cadastros genuínos, nunca a
 * cada login de quem já tem conta.
 */
export async function upsertUserProfileFromAuth(params: {
  id: string
  displayName: string
  avatarUrl: string | null
}): Promise<{ isNew: boolean }> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("user_profiles")
    .select("id")
    .eq("id", params.id)
    .maybeSingle()

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("user_profiles") as any).upsert(
    {
      id: params.id,
      display_name: params.displayName,
      avatar_url: params.avatarUrl,
    },
    { onConflict: "id", ignoreDuplicates: true }
  )
  // `ignoreDuplicates` só cobre conflito de `id`; qualquer outro erro (ex.:
  // colisão residual de display_slug) ficava mudo aqui e a conta seguia
  // logada sem perfil, sumida do /pessoas para sempre. Não propaga para não
  // travar o login por causa do diretório público — só loga para dar pra achar.
  if (error) {
    console.error("[users-repository] upsertUserProfileFromAuth:", error)
    return { isNew: false }
  }
  return { isNew: !existing }
}

/** Preferências e identificação editáveis pelo próprio usuário em /perfil. */
export type UserProfileSettings = {
  display_name: string | null
  /** Derivado de `display_name` pelo banco — segmento da URL do perfil. */
  display_slug: string | null
  avatar_url: string | null
  theme: string | null
  locale: string | null
  lgpd_consent_at: string | null
  lgpd_consent_version: string | null
  /** Campos da vitrine pública (`/perfil/<slug>`). */
  banner_url: string | null
  mini_banner_url: string | null
  bio: string | null
  /** Somente leitura pelo usuário — definido pela administração. */
  account_tier: string | null
  /** Validade do VIP — `null` = sem expiração (manual/cargo). Usar sempre com `isVipActive`. */
  vip_expires_at: string | null
  youtube_handle: string | null
  tiktok_handle: string | null
  /** Enquadramento das imagens. Padrão quando a coluna ainda não existe. */
  media_adjustments: ProfileMediaAdjustments
}

/** Lê as preferências/identificação do usuário para a página de perfil. */
export async function getUserProfileSettings(
  userId: string
): Promise<UserProfileSettings | null> {
  const db = createSupabaseAdminClient()
  const [{ data }, adjustments] = await Promise.all([
    db
      .from("user_profiles")
      .select(
        "display_name, display_slug, avatar_url, theme, locale, lgpd_consent_at, lgpd_consent_version, banner_url, mini_banner_url, bio, account_tier, vip_expires_at, youtube_handle, tiktok_handle"
      )
      .eq("id", userId)
      .maybeSingle(),
    getMediaAdjustmentsByUser([userId]),
  ])
  if (!data) return null
  return {
    ...(data as Omit<UserProfileSettings, "media_adjustments">),
    media_adjustments: adjustments[userId] ?? DEFAULT_ADJUSTMENTS,
  }
}

/**
 * Atualiza (upsert parcial) os campos que o próprio usuário pode editar.
 * Só inclui no payload as chaves informadas, para não sobrescrever colunas
 * existentes com `null`.
 *
 * Lança o erro do banco em vez de engoli-lo: o índice único de `display_slug`
 * é o que impede dois perfis com o mesmo nome, e a rota precisa desse 23505
 * para responder "nome já em uso" em vez de fingir que salvou.
 */
export async function updateUserProfileSettings(
  userId: string,
  changes: {
    displayName?: string | null
    avatarUrl?: string | null
    theme?: string | null
    locale?: string | null
    bannerUrl?: string | null
    miniBannerUrl?: string | null
    bio?: string | null
    youtubeHandle?: string | null
    tiktokHandle?: string | null
    mediaAdjustments?: ProfileMediaAdjustments
  }
): Promise<void> {
  const db = createSupabaseAdminClient()
  const payload: Record<string, unknown> = { id: userId }
  if (changes.displayName !== undefined) payload.display_name = changes.displayName
  if (changes.avatarUrl !== undefined) payload.avatar_url = changes.avatarUrl
  if (changes.theme !== undefined) payload.theme = changes.theme
  if (changes.locale !== undefined) payload.locale = changes.locale
  if (changes.bannerUrl !== undefined) payload.banner_url = changes.bannerUrl
  if (changes.miniBannerUrl !== undefined) payload.mini_banner_url = changes.miniBannerUrl
  if (changes.bio !== undefined) payload.bio = changes.bio
  if (changes.youtubeHandle !== undefined) payload.youtube_handle = changes.youtubeHandle
  if (changes.tiktokHandle !== undefined) payload.tiktok_handle = changes.tiktokHandle
  if (changes.mediaAdjustments !== undefined) payload.media_adjustments = changes.mediaAdjustments
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("user_profiles") as any).upsert(payload, { onConflict: "id" })

  // Enquadramento só é gravável depois da migration 20260817. Enquanto ela não
  // roda, salvar o resto do perfil não pode falhar por causa dele: repete sem a
  // coluna e deixa o aviso no log.
  if (error?.code === "42703" && changes.mediaAdjustments !== undefined) {
    console.warn("[users-repository] media_adjustments ausente — aplique 20260817_profile_media_adjustments.sql")
    delete payload.media_adjustments
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retry = await (db.from("user_profiles") as any).upsert(payload, { onConflict: "id" })
    if (retry.error) throw retry.error
    return
  }
  if (error) throw error
}

/**
 * Indica se o usuário já tem consentimento LGPD registrado. Usado pelo gate
 * de consentimento do OAuth (app/auth/callback/route.ts) — o cadastro por
 * e-mail/senha exige o checkbox antes de criar a conta, mas o login social
 * cria a conta direto no `exchangeCodeForSession`, sem ponto nenhum para
 * bloquear a criação; o gate pós-login é o único lugar onde dá pra cobrar isso.
 */
export async function hasRecordedLgpdConsent(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("lgpd_consent_at")
    .eq("id", userId)
    .maybeSingle()
  return Boolean((data as { lgpd_consent_at: string | null } | null)?.lgpd_consent_at)
}

/**
 * Registra o consentimento LGPD do usuário (Art. 7 e Art. 8 da Lei 13.709/2018).
 * Deve ser chamado no momento do cadastro ou quando o usuário aceita a política.
 */
export async function recordLgpdConsent(params: {
  userId: string
  version: string
  ipAddress?: string | null
}): Promise<void> {
  const db = createSupabaseAdminClient()
  const consentAt = new Date().toISOString()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from("user_profiles") as any).upsert(
    {
      id: params.userId,
      lgpd_consent_at: consentAt,
      lgpd_consent_version: params.version,
    },
    { onConflict: "id" }
  )
  await db.from("audit_log").insert({
    user_id: params.userId,
    actor_id: params.userId,
    action: "consent_recorded",
    metadata: { version: params.version, ip_address: params.ipAddress ?? null },
    ip_address: params.ipAddress ?? null,
  })
}

/**
 * Registra o aceite do termo de integridade das mini reviews (item 1.2) —
 * idempotente (só grava se ainda não tinha aceitado) e nunca reexibido depois.
 */
export async function acceptReviewsIntegrityTerm(userId: string): Promise<string> {
  const db = createSupabaseAdminClient()
  const acceptedAt = new Date().toISOString()
  await db
    .from("user_profiles")
    .update({ reviews_integrity_accepted_at: acceptedAt })
    .eq("id", userId)
    .is("reviews_integrity_accepted_at", null)

  const { data } = await db
    .from("user_profiles")
    .select("reviews_integrity_accepted_at")
    .eq("id", userId)
    .maybeSingle()
  return (data as { reviews_integrity_accepted_at: string | null } | null)?.reviews_integrity_accepted_at ?? acceptedAt
}

/**
 * Exclui todos os dados pessoais do usuário e registra a operação no audit_log.
 * Anonimiza fórum e pedidos via função SQL para preservar integridade referencial.
 * A conta de autenticação (Supabase Auth) deve ser removida separadamente.
 */
export async function deleteUserAccountData(
  userId: string,
  options?: { ipAddress?: string | null; actorId?: string }
): Promise<void> {
  const db = createSupabaseAdminClient()

  // Anonimiza posts/comentários do fórum e pedidos da loja via função SQL
  await db.rpc("anonymize_user_data", { p_user_id: userId })

  // Remove o perfil do usuário
  await db.from("user_profiles").delete().eq("id", userId)

  // Registra a exclusão no log de auditoria
  await db.from("audit_log").insert({
    user_id: userId,
    actor_id: options?.actorId ?? userId,
    action: "account_deleted",
    table_name: "user_profiles",
    record_id: userId,
    metadata: { reason: "user_request" },
    ip_address: options?.ipAddress ?? null,
  })
}

/**
 * Exclusão administrativa de uma conta, iniciada por um WEB Master a partir do
 * painel. Remove o perfil administrativo (se houver), anonimiza fórum/pedidos
 * e remove o perfil público, registrando no audit_log com o WEB Master como
 * autor da ação — distinto de `deleteUserAccountData`, que registra a própria
 * pessoa como autora (autoexclusão via LGPD).
 *
 * Não remove a conta em si (Supabase Auth): isso é feito separadamente pela
 * rota, com `auth.admin.deleteUser`, no mesmo padrão de `app/api/profile/delete`.
 */
export async function deleteUserAsAdmin(
  targetId: string,
  options: { actorId: string; targetEmail?: string | null; ipAddress?: string | null }
): Promise<void> {
  const db = createSupabaseAdminClient()

  await db.from("admin_profiles").delete().eq("id", targetId)
  await db.rpc("anonymize_user_data", { p_user_id: targetId })
  await db.from("user_profiles").delete().eq("id", targetId)

  await db.from("audit_log").insert({
    user_id: targetId,
    actor_id: options.actorId,
    action: "admin_user_deleted",
    table_name: "user_profiles",
    record_id: targetId,
    metadata: { email: options.targetEmail ?? null },
    ip_address: options.ipAddress ?? null,
  })
}

/** Dados de compra do cadastro completo (todos opcionais). */
export type PurchaseProfileInput = {
  fullName?: string | null
  cpf?: string | null
  phone?: string | null
  postalCode?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
}

/**
 * Cria/atualiza o perfil de um usuário no cadastro: nome de exibição e,
 * quando informados, os dados de compra (cadastro completo). Sobrescreve o
 * registro (onConflict id) para que o cadastro defina o perfil inicial.
 */
export async function upsertUserProfileOnSignup(params: {
  id: string
  displayName: string
  purchase?: PurchaseProfileInput | null
  lgpdConsentAt?: string | null
  lgpdConsentVersion?: string | null
}): Promise<void> {
  const db = createSupabaseAdminClient()
  const p = params.purchase ?? {}
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("user_profiles") as any).upsert(
    {
      id: params.id,
      display_name: params.displayName,
      full_name: p.fullName ?? null,
      cpf: p.cpf ?? null,
      phone: p.phone ?? null,
      postal_code: p.postalCode ?? null,
      street: p.street ?? null,
      number: p.number ?? null,
      complement: p.complement ?? null,
      neighborhood: p.neighborhood ?? null,
      city: p.city ?? null,
      state: p.state ?? null,
      lgpd_consent_at: params.lgpdConsentAt ?? null,
      lgpd_consent_version: params.lgpdConsentVersion ?? null,
    },
    { onConflict: "id" }
  )
  // Propaga o 23505 de `display_slug`: o cadastro precisa saber que o nome foi
  // tomado entre a checagem e a gravação, em vez de criar um usuário no Auth
  // sem perfil correspondente.
  if (error) throw error
}

export type UserDataExport = {
  exported_at: string
  email: string | null
  profile: {
    display_name: string | null
    avatar_url: string | null
    banner_url: string | null
    mini_banner_url: string | null
    bio: string | null
    theme: string | null
    locale: string | null
    account_tier: string | null
    profile_views: number | null
    full_name: string | null
    cpf: string | null
    phone: string | null
    postal_code: string | null
    street: string | null
    number: string | null
    complement: string | null
    neighborhood: string | null
    city: string | null
    state: string | null
    lgpd_consent_at: string | null
    lgpd_consent_version: string | null
    created_at: string
    updated_at: string
  } | null
  forum_posts: Array<{
    id: string
    title: string
    body: string | null
    created_at: string
  }>
  forum_comments: Array<{
    id: string
    post_id: string
    body: string
    created_at: string
  }>
  orders: Array<{
    id: string
    total_cents: number
    status: string
    payment_method: string | null
    items: Record<string, unknown>[]
    created_at: string
  }>
  /** Perfis que este usuário segue. */
  following: Array<{ user_id: string; created_at: string }>
  /** Perfis que seguem este usuário. */
  followers: Array<{ user_id: string; created_at: string }>
  /** Setup exibido no perfil (mouse, teclado, headset, monitor, mousepad). */
  setup_items: Array<{ slot: string; peripheral_id: string; updated_at: string }>
  /** Periféricos curtidos/favoritados. */
  favorite_peripherals: Array<{ peripheral_id: string; position: number; created_at: string }>
  /** Medalhas conquistadas. */
  medals: Array<{ medal_id: string; awarded_at: string; pinned: boolean; pinned_order: number | null }>
}

/**
 * Exporta todos os dados pessoais de um usuário (LGPD Art. 18, V — portabilidade).
 */
export async function getUserDataExport(
  userId: string,
  userEmail: string | null
): Promise<UserDataExport> {
  const db = createSupabaseAdminClient()

  const [
    profileRes,
    postsRes,
    commentsRes,
    ordersRes,
    followingRes,
    followersRes,
    setupRes,
    favoritesRes,
    medalsRes,
  ] = await Promise.all([
    db
      .from("user_profiles")
      .select(
        "display_name, avatar_url, banner_url, mini_banner_url, bio, theme, locale, account_tier, profile_views, full_name, cpf, phone, postal_code, street, number, complement, neighborhood, city, state, lgpd_consent_at, lgpd_consent_version, created_at, updated_at"
      )
      .eq("id", userId)
      .maybeSingle(),
    db
      .from("forum_posts")
      .select("id, title, body, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    db
      .from("forum_comments")
      .select("id, post_id, body, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    db
      .from("store_orders")
      .select("id, total_cents, status, payment_method, items, created_at")
      .contains("metadata", { user_id: userId })
      .order("created_at", { ascending: false }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.from("user_follows") as any)
      .select("following_id, created_at")
      .eq("follower_id", userId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (db.from("user_follows") as any)
      .select("follower_id, created_at")
      .eq("following_id", userId),
    db
      .from("user_setup_items")
      .select("slot, peripheral_id, updated_at")
      .eq("user_id", userId),
    db
      .from("user_favorite_peripherals")
      .select("peripheral_id, position, created_at")
      .eq("user_id", userId)
      .order("position", { ascending: true }),
    db
      .from("user_medals")
      .select("medal_id, awarded_at, pinned, pinned_order")
      .eq("user_id", userId)
      .order("awarded_at", { ascending: false }),
  ])

  // Log da exportação (Art. 37 — rastreabilidade)
  await db.from("audit_log").insert({
    user_id: userId,
    actor_id: userId,
    action: "data_exported",
    metadata: { email: userEmail },
  })

  return {
    exported_at: new Date().toISOString(),
    email: userEmail,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile: (profileRes.data as any) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forum_posts: (postsRes.data as any[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forum_comments: (commentsRes.data as any[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orders: (ordersRes.data as any[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    following: ((followingRes.data as any[]) ?? []).map((r) => ({
      user_id: r.following_id as string,
      created_at: r.created_at as string,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    followers: ((followersRes.data as any[]) ?? []).map((r) => ({
      user_id: r.follower_id as string,
      created_at: r.created_at as string,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    setup_items: (setupRes.data as any[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    favorite_peripherals: (favoritesRes.data as any[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    medals: (medalsRes.data as any[]) ?? [],
  }
}
