import "server-only"

import { profileMediaProxyUrl } from "@/lib/account-tier"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getProfileFramesByUser } from "@/lib/server/repositories/vip-founder-repository"
import { normalizeReferralCode, validateReferralCode } from "@/lib/referral-code"

/**
 * Repositório do Programa de Indicação — única porta de acesso a
 * `referral_codes`, `referrals` e `referral_verified_identities`.
 *
 * Toda a atomicidade (creditar os dois níveis, aplicar tetos, resolver o
 * "avô") vive nas funções Postgres de
 * 20261023000000_referral_program.sql — é Aura sendo criada, então o
 * TypeScript nunca soma saldo por conta própria. Aqui só chamamos as RPCs e
 * traduzimos o resultado, mesmo padrão de `discord-membership-repository.ts`.
 */

export type ReferralStatus = "pending" | "validated" | "rejected" | "expired"
export type ReferralVia = "discord_member" | "oauth_identity" | "streak_3d"

export type ReferralRow = {
  referred_user_id: string
  referrer_user_id: string
  status: ReferralStatus
  validated_via: ReferralVia | null
  expires_at: string
  validated_at: string | null
  rejected_reason: string | null
  created_at: string
}

/** Uma indicação já enriquecida com o nome de quem foi indicado, para o painel. */
export type ReferralListItem = {
  userId: string
  displayName: string
  avatarUrl: string | null
  /**
   * Moldura de quem foi indicado — a MESMA que a pessoa leva para o perfil e
   * para o fórum. Sem ela a lista desenhava um avatar cru, que é como cada
   * tela nova voltava a "esquecer" a moldura (ver `AGENTS.md`).
   */
  frame: ProfileFrameIdentity
  status: ReferralStatus
  validatedVia: ReferralVia | null
  expiresAt: string
  createdAt: string
}

export type ReferralStats = {
  code: string | null
  canCustomizeCode: boolean
  validated: number
  pending: number
  auraEarned: number
}

/**
 * Código do usuário, criado na primeira chamada. `seed` é o nome de exibição
 * — vira a parte legível do código.
 */
export async function ensureReferralCode(userId: string, seed: string | null): Promise<string | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("ensure_referral_code", {
    p_user_id: userId,
    p_seed: seed,
  })
  if (error) {
    console.error("[referrals-repository] ensureReferralCode:", error)
    return null
  }
  return data as string
}

export type SetCodeResult = "ok" | "taken" | "already_customized" | "not_found" | "invalid" | "error"

/** Personalização do código — vale uma vez só (o banco impõe via `customized_at`). */
export async function setReferralCode(userId: string, code: string): Promise<SetCodeResult> {
  const normalized = normalizeReferralCode(code)
  if (validateReferralCode(normalized)) return "invalid"

  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("set_referral_code", {
    p_user_id: userId,
    p_code: normalized,
  })
  if (error) {
    console.error("[referrals-repository] setReferralCode:", error)
    return "error"
  }
  return data as SetCodeResult
}

/**
 * Quem é o dono de um código. Usado no cadastro para mostrar "Você foi
 * indicado por Fulano" antes de a conta existir — por isso roda com service
 * role (quem digita o cupom ainda não tem sessão).
 *
 * Devolve só o nome público: nada de e-mail ou id, que é o que um endpoint
 * aberto a anônimos poderia vazar em massa.
 */
export async function getReferrerPublicName(code: string): Promise<string | null> {
  const normalized = normalizeReferralCode(code)
  if (!normalized) return null

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("referral_codes")
    .select("user_id")
    .eq("code", normalized)
    .maybeSingle()

  if (error || !data) return null

  const { data: profile } = await db
    .from("user_profiles")
    .select("display_name")
    .eq("id", data.user_id)
    .maybeSingle()

  return profile?.display_name ?? null
}

export type RegisterReferralResult =
  | "ok"
  | "invalid_code"
  | "self_referral"
  | "already_referred"
  | "referrer_banned"
  | "error"

/**
 * Grava a indicação no cadastro (status `pending`). NÃO credita Aura — o
 * crédito só sai quando o indicado cumpre um dos verificadores.
 *
 * Best-effort por contrato: quem chama (cadastro por e-mail e callback do
 * OAuth) nunca deve falhar por causa de um cupom inválido.
 */
export async function registerReferral(params: {
  referredUserId: string
  code: string
  signupIp?: string | null
}): Promise<RegisterReferralResult> {
  const normalized = normalizeReferralCode(params.code)
  if (!normalized) return "invalid_code"

  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("register_referral", {
    p_referred_user_id: params.referredUserId,
    p_code: normalized,
    p_signup_ip: params.signupIp ?? null,
  })
  if (error) {
    console.error("[referrals-repository] registerReferral:", error)
    return "error"
  }
  return data as RegisterReferralResult
}

export type ClaimIdentityResult = "claimed" | "already_mine" | "in_use" | "error"

/**
 * Reserva o par (provider, provider_id) globalmente. É este `unique` que faz
 * "vincular uma conta Google" ser um verificador de verdade: a mesma conta
 * Google/Discord nunca valida duas indicações no site.
 */
export async function claimReferralIdentity(params: {
  userId: string
  provider: "google" | "discord"
  providerId: string
}): Promise<ClaimIdentityResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("claim_referral_identity", {
    p_user_id: params.userId,
    p_provider: params.provider,
    p_provider_id: params.providerId,
  })
  if (error) {
    console.error("[referrals-repository] claimReferralIdentity:", error)
    return "error"
  }
  return data as ClaimIdentityResult
}

export type ValidateReferralResult =
  | "validated"
  | "not_pending"
  | "expired"
  | "capped_ip"
  | "capped_total"
  | "no_referral"
  | "error"

/** Valida a indicação de `referredUserId` e credita os dois níveis (atômico na RPC). */
export async function validateReferral(
  referredUserId: string,
  via: ReferralVia
): Promise<ValidateReferralResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("validate_referral", {
    p_referred_user_id: referredUserId,
    p_via: via,
  })
  if (error) {
    console.error("[referrals-repository] validateReferral:", error)
    return "error"
  }
  return data as ValidateReferralResult
}

/** A indicação pendente de um usuário, se houver — usada pelos gatilhos de validação. */
export async function getPendingReferralFor(userId: string): Promise<ReferralRow | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("referrals")
    .select(
      "referred_user_id, referrer_user_id, status, validated_via, expires_at, validated_at, rejected_reason, created_at"
    )
    .eq("referred_user_id", userId)
    .eq("status", "pending")
    .maybeSingle()

  if (error) {
    console.error("[referrals-repository] getPendingReferralFor:", error)
    return null
  }
  return data as ReferralRow | null
}

/** Resumo do painel: código, contadores e Aura já ganha com indicações. */
export async function getReferralStats(userId: string, seed: string | null): Promise<ReferralStats> {
  const db = createSupabaseAdminClient()

  const code = await ensureReferralCode(userId, seed)

  const [{ data: codeRow }, { data: rows }, { data: ledger }] = await Promise.all([
    db.from("referral_codes").select("customized_at").eq("user_id", userId).maybeSingle(),
    db.from("referrals").select("status").eq("referrer_user_id", userId),
    db
      .from("aura_ledger")
      .select("delta")
      .eq("user_id", userId)
      .in("reason", ["referral_signup", "referral_indirect"]),
  ])

  const list = rows ?? []
  return {
    code,
    canCustomizeCode: !codeRow?.customized_at,
    validated: list.filter((r) => r.status === "validated").length,
    pending: list.filter((r) => r.status === "pending").length,
    auraEarned: (ledger ?? []).reduce((sum, row) => sum + (row.delta ?? 0), 0),
  }
}

/**
 * Lista de quem o usuário indicou, com nome e status. O painel mostra o que
 * falta cada pendente cumprir, então o status cru basta — nada de expor
 * `signup_ip` (dado pessoal) para o navegador.
 */
export async function listMyReferrals(userId: string, limit = 100): Promise<ReferralListItem[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("referrals")
    .select("referred_user_id, status, validated_via, expires_at, created_at")
    .eq("referrer_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[referrals-repository] listMyReferrals:", error)
    return []
  }

  const rows = data ?? []
  if (rows.length === 0) return []

  const referredIds = rows.map((r) => r.referred_user_id)

  // Moldura em LOTE para a lista inteira — uma consulta por avatar seria N+1.
  const [{ data: profiles }, frameOf] = await Promise.all([
    db
      .from("user_profiles")
      .select("id, display_name, avatar_url, account_tier, vip_expires_at")
      .in("id", referredIds),
    getProfileFramesByUser(referredIds),
  ])

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))

  return rows.map((row) => {
    const profile = byId.get(row.referred_user_id)
    return {
      userId: row.referred_user_id,
      displayName: profile?.display_name ?? "Usuário",
      // Nunca a coluna crua — ver `profileMediaProxyUrl` em `lib/account-tier.ts`.
      avatarUrl: profile?.avatar_url ? profileMediaProxyUrl(row.referred_user_id, "avatar") : null,
      frame: frameOf(
        row.referred_user_id,
        profile?.account_tier ?? null,
        profile?.vip_expires_at ?? null
      ),
      status: row.status as ReferralStatus,
      validatedVia: row.validated_via as ReferralVia | null,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }
  })
}

// ───────────────────────────── Admin ─────────────────────────────

export type AdminReferralItem = ReferralListItem & {
  referrerId: string
  referrerName: string
  rejectedReason: string | null
}

/**
 * Fila de revisão do admin. O filtro padrão são as rejeitadas por teto
 * (`ip_limit` / `max_per_user`): são as únicas em que um usuário legítimo
 * pode ter sido barrado — várias pessoas na mesma casa, CGNAT, faculdade.
 */
export async function listReferralsForAdmin(params: {
  status?: ReferralStatus
  onlyCapped?: boolean
  limit?: number
}): Promise<AdminReferralItem[]> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("referrals")
    .select(
      "referred_user_id, referrer_user_id, status, validated_via, expires_at, created_at, rejected_reason"
    )
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 100)

  if (params.status) query = query.eq("status", params.status)
  if (params.onlyCapped) query = query.in("rejected_reason", ["ip_limit", "max_per_user"])

  const { data, error } = await query
  if (error) {
    console.error("[referrals-repository] listReferralsForAdmin:", error)
    return []
  }

  const rows = data ?? []
  if (rows.length === 0) return []

  const ids = [...new Set(rows.flatMap((r) => [r.referred_user_id, r.referrer_user_id]))]
  // Moldura em LOTE para a fila inteira — nunca uma consulta por linha.
  const [{ data: profiles }, frameOf] = await Promise.all([
    db
      .from("user_profiles")
      .select("id, display_name, avatar_url, account_tier, vip_expires_at")
      .in("id", ids),
    getProfileFramesByUser(ids),
  ])

  const byId = new Map((profiles ?? []).map((p) => [p.id, p]))

  return rows.map((row) => ({
    userId: row.referred_user_id,
    displayName: byId.get(row.referred_user_id)?.display_name ?? "Usuário",
    // Nunca a coluna crua — ver `profileMediaProxyUrl` em `lib/account-tier.ts`.
    avatarUrl: byId.get(row.referred_user_id)?.avatar_url
      ? profileMediaProxyUrl(row.referred_user_id, "avatar")
      : null,
    frame: frameOf(
      row.referred_user_id,
      byId.get(row.referred_user_id)?.account_tier ?? null,
      byId.get(row.referred_user_id)?.vip_expires_at ?? null
    ),
    status: row.status as ReferralStatus,
    validatedVia: row.validated_via as ReferralVia | null,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    referrerId: row.referrer_user_id,
    referrerName: byId.get(row.referrer_user_id)?.display_name ?? "Usuário",
    rejectedReason: row.rejected_reason,
  }))
}

/** Decisão manual do admin sobre uma indicação. Registra em `audit_log`. */
export async function reviewReferral(params: {
  referredUserId: string
  approve: boolean
  adminId: string
  reason?: string | null
}): Promise<"validated" | "rejected" | "not_pending" | "no_referral" | "error"> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("review_referral", {
    p_referred_user_id: params.referredUserId,
    p_approve: params.approve,
    p_reason: params.reason ?? null,
  })
  if (error) {
    console.error("[referrals-repository] reviewReferral:", error)
    return "error"
  }

  await db.from("audit_log").insert({
    user_id: params.referredUserId,
    actor_id: params.adminId,
    action: params.approve ? "admin_referral_approved" : "admin_referral_rejected",
    table_name: "referrals",
    record_id: params.referredUserId,
    metadata: { result: data, reason: params.reason ?? null },
  })

  return data as "validated" | "rejected" | "not_pending" | "no_referral"
}
