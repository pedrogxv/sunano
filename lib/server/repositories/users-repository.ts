import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

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
  avatar_url: string | null
  theme: string | null
  locale: string | null
  lgpd_consent_at: string | null
  lgpd_consent_version: string | null
}

/** Lê as preferências/identificação do usuário para a página de perfil. */
export async function getUserProfileSettings(
  userId: string
): Promise<UserProfileSettings | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("display_name, avatar_url, theme, locale, lgpd_consent_at, lgpd_consent_version")
    .eq("id", userId)
    .maybeSingle()
  return (data ?? null) as UserProfileSettings | null
}

/**
 * Atualiza (upsert parcial) os campos que o próprio usuário pode editar.
 * Só inclui no payload as chaves informadas, para não sobrescrever colunas
 * existentes com `null`.
 */
export async function updateUserProfileSettings(
  userId: string,
  changes: {
    displayName?: string | null
    avatarUrl?: string | null
    theme?: string | null
    locale?: string | null
  }
): Promise<void> {
  const db = createSupabaseAdminClient()
  const payload: Record<string, unknown> = { id: userId }
  if (changes.displayName !== undefined) payload.display_name = changes.displayName
  if (changes.avatarUrl !== undefined) payload.avatar_url = changes.avatarUrl
  if (changes.theme !== undefined) payload.theme = changes.theme
  if (changes.locale !== undefined) payload.locale = changes.locale
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (db.from("user_profiles") as any).upsert(payload, { onConflict: "id" })
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
  await (db.from("user_profiles") as any).upsert(
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
