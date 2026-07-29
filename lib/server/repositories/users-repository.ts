import "server-only"

import { coerceAccountTier } from "@/lib/account-tier"
import { slugifyDisplayName } from "@/lib/profile-name"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import type { PublicProfileSummary } from "@/lib/user-directory"

export type { PublicProfileSummary } from "@/lib/user-directory"

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
  "id, display_name, display_slug, avatar_url, mini_banner_url, account_tier, profile_views, created_at"

type DirectoryRow = {
  id: string
  display_name: string | null
  display_slug: string
  avatar_url: string | null
  mini_banner_url: string | null
  account_tier: string | null
  profile_views: number | null
  created_at: string
}

function toProfileSummary(row: DirectoryRow, followers = 0): PublicProfileSummary {
  return {
    id: row.id,
    display_name: row.display_name?.trim() || `Membro ${row.id.slice(0, 6)}`,
    display_slug: row.display_slug,
    avatar_url: row.avatar_url,
    mini_banner_url: row.mini_banner_url,
    account_tier: coerceAccountTier(row.account_tier),
    profile_views: row.profile_views ?? 0,
    followers,
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

/** Anexa o contador de seguidores a um lote de linhas do diretório. */
async function withFollowers(rows: DirectoryRow[]): Promise<PublicProfileSummary[]> {
  const counts = await countFollowersByUser(rows.map((r) => r.id))
  return rows.map((row) => toProfileSummary(row, counts[row.id] ?? 0))
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
  const { data, error } = await db
    .from("user_profiles")
    .select(DIRECTORY_COLUMNS)
    .ilike("display_name", `%${trimmed}%`)
    .order("profile_views", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[users-repository] searchUserProfiles:", error)
    return []
  }
  return withFollowers((data ?? []) as DirectoryRow[])
}

/** Perfis com mais visitas. */
export async function getMostVisitedProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select(DIRECTORY_COLUMNS)
    .order("profile_views", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[users-repository] getMostVisitedProfiles:", error)
    return []
  }
  return withFollowers((data ?? []) as DirectoryRow[])
}

/** Perfis criados mais recentemente. */
export async function getNewestProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select(DIRECTORY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[users-repository] getNewestProfiles:", error)
    return []
  }
  return withFollowers((data ?? []) as DirectoryRow[])
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

  const { data, error: profilesError } = await db
    .from("user_profiles")
    .select(DIRECTORY_COLUMNS)
    .in("id", ids)

  if (profilesError) {
    console.error("[users-repository] getFollowingProfiles:", profilesError)
    return []
  }

  // O `in` volta em ordem arbitrária — restaura a ordem de quando seguiu.
  const rank = new Map(ids.map((id, index) => [id, index]))
  const profiles = await withFollowers((data ?? []) as DirectoryRow[])
  return profiles.sort(
    (a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0)
  )
}

/**
 * Perfis com mais seguidores.
 *
 * A ordenação acontece aqui e não no banco porque o contador não é uma
 * coluna: agregar `user_follows` e ordenar exigiria uma view/função. Enquanto
 * a base de membros for pequena isso não compensa — o dia em que compensar,
 * a troca fica contida nesta função.
 */
export async function getMostFollowedProfiles(limit = 12): Promise<PublicProfileSummary[]> {
  const db = createSupabaseAdminClient()
  const { data: followRows, error } = await db.from("user_follows").select("following_id")

  if (error) {
    console.error("[users-repository] getMostFollowedProfiles:", error)
    return []
  }

  const counts: Record<string, number> = {}
  for (const row of (followRows ?? []) as Array<{ following_id: string }>) {
    counts[row.following_id] = (counts[row.following_id] ?? 0) + 1
  }

  const topIds = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id)

  if (topIds.length === 0) return []

  const { data, error: profilesError } = await db
    .from("user_profiles")
    .select(DIRECTORY_COLUMNS)
    .in("id", topIds)

  if (profilesError) {
    console.error("[users-repository] getMostFollowedProfiles:", profilesError)
    return []
  }

  // O `in` volta em ordem arbitrária — reordena pelo ranking de seguidores.
  return ((data ?? []) as DirectoryRow[])
    .map((row) => toProfileSummary(row, counts[row.id] ?? 0))
    .sort((a, b) => b.followers - a.followers)
}

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
 * Usado onde não dá para pedir outro nome ao usuário (login social), nunca
 * para sobrescrever uma escolha explícita.
 */
export async function resolveAvailableDisplayName(
  base: string,
  userId: string
): Promise<string> {
  const cleaned = base.trim().slice(0, 30)
  const fallback = `user-${userId.replace(/-/g, "").slice(0, 8)}`
  const root = slugifyDisplayName(cleaned).length >= 2 ? cleaned : fallback

  if (await isDisplayNameAvailable(root, userId)) return root

  for (let attempt = 2; attempt <= 50; attempt += 1) {
    const candidate = `${root}${attempt}`
    if (await isDisplayNameAvailable(candidate, userId)) return candidate
  }
  // Improvável: 50 variações ocupadas. O id não colide com nada.
  return fallback
}

/** Id do usuário dono de um slug de perfil (`/perfil/<slug>`). */
export async function findUserIdByDisplaySlug(slug: string): Promise<string | null> {
  const normalized = slugifyDisplayName(slug)
  if (!normalized) return null

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("id")
    .eq("display_slug", normalized)
    .maybeSingle()
  return (data as { id: string } | null)?.id ?? null
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

/** Cria/atualiza o perfil de um usuário a partir dos metadados de autenticação. */
export async function upsertUserProfileFromAuth(params: {
  id: string
  displayName: string
  avatarUrl: string | null
}): Promise<void> {
  const db = createSupabaseAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from("user_profiles") as any).upsert(
    {
      id: params.id,
      display_name: params.displayName,
      avatar_url: params.avatarUrl,
    },
    { onConflict: "id", ignoreDuplicates: true }
  )
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
}

/** Lê as preferências/identificação do usuário para a página de perfil. */
export async function getUserProfileSettings(
  userId: string
): Promise<UserProfileSettings | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select(
      "display_name, display_slug, avatar_url, theme, locale, lgpd_consent_at, lgpd_consent_version, banner_url, mini_banner_url, bio, account_tier"
    )
    .eq("id", userId)
    .maybeSingle()
  return (data ?? null) as UserProfileSettings | null
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (db.from("user_profiles") as any).upsert(payload, { onConflict: "id" })
  if (error) throw error
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
  profile: {
    display_name: string | null
    avatar_url: string | null
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
    body: string
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
}

/**
 * Exporta todos os dados pessoais de um usuário (LGPD Art. 18, V — portabilidade).
 */
export async function getUserDataExport(
  userId: string,
  userEmail: string | null
): Promise<UserDataExport> {
  const db = createSupabaseAdminClient()

  const [profileRes, postsRes, commentsRes, ordersRes] = await Promise.all([
    db
      .from("user_profiles")
      .select(
        "display_name, avatar_url, full_name, cpf, phone, postal_code, street, number, complement, neighborhood, city, state, lgpd_consent_at, lgpd_consent_version, created_at, updated_at"
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    profile: (profileRes.data as any) ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forum_posts: (postsRes.data as any[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    forum_comments: (commentsRes.data as any[]) ?? [],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    orders: (ordersRes.data as any[]) ?? [],
  }
}
