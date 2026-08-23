import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório do ban geral de conta — distinto de `market-repository.ts`
 * (`setMarketBan`), que só restringe o Mercado. Aqui a conta perde login,
 * some das listagens públicas e tem conteúdo/aura ajustados; toda a lógica
 * atômica vive nas RPCs `admin_ban_account`/`admin_unban_account`
 * (20260923000001_account_ban.sql) — este arquivo só chama a RPC e registra
 * em `audit_log` (mesmo padrão de `setMarketBan`, já que a RPC não tem acesso
 * ao `actorId` de quem clicou banir).
 */

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

export type AccountBanStatus = {
  isBanned: boolean
  reason: string | null
  bannedAt: string | null
}

/** Lido no login e a cada request autenticada (middleware) — leve, uma linha. */
export async function getAccountBanStatus(userId: string): Promise<AccountBanStatus> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("account_banned_at, account_ban_reason")
    .eq("id", userId)
    .maybeSingle()

  return {
    isBanned: Boolean(data?.account_banned_at),
    reason: data?.account_ban_reason ?? null,
    bannedAt: data?.account_banned_at ?? null,
  }
}

export async function banAccount(
  userId: string,
  reason: string,
  options: { actorId: string; ipAddress?: string | null }
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("admin_ban_account", { p_user_id: userId, p_reason: reason })

  if (error) {
    return { ok: false, error: "Não foi possível banir a conta.", status: 400 }
  }

  await db.from("audit_log").insert({
    user_id: userId,
    actor_id: options.actorId,
    action: "admin_account_banned",
    table_name: "user_profiles",
    record_id: userId,
    metadata: { reason },
    ip_address: options.ipAddress ?? null,
  })

  return { ok: true }
}

export async function unbanAccount(
  userId: string,
  options: { actorId: string; ipAddress?: string | null }
): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("admin_unban_account", { p_user_id: userId })

  if (error) {
    return { ok: false, error: "Não foi possível desbanir a conta.", status: 400 }
  }

  await db.from("audit_log").insert({
    user_id: userId,
    actor_id: options.actorId,
    action: "admin_account_unbanned",
    table_name: "user_profiles",
    record_id: userId,
    metadata: {},
    ip_address: options.ipAddress ?? null,
  })

  return { ok: true }
}
