import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Conquista especial "No Discord" (binária, sem tiers) — concedida ao
 * confirmar, via OAuth do Discord (escopo `guilds`), que o usuário é membro
 * do servidor oficial (ver app/auth/discord/callback/route.ts). Toda a
 * atomicidade (conceder + creditar 50 de Aura) vive na função Postgres
 * `confirm_discord_membership` (ver
 * 20261015000000_discord_membership_achievement.sql); este repositório só
 * chama a RPC e lê a tabela resultante, mesmo padrão de
 * `youtube-subscription-repository.ts`.
 */

/**
 * Por que a concessão não creditou. `granted` é o único caso feliz.
 * `account_in_use` = outra conta do site já resgatou com ESSA conta do
 * Discord (a RPC tem `unique (discord_user_id)` justamente para isso).
 */
export type ConfirmDiscordMembershipResult = "granted" | "already" | "account_in_use" | "error"

/** Se o usuário já confirmou que é membro do servidor do Discord. */
export async function hasConfirmedDiscordMembership(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_discord_membership")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[discord-membership-repository] hasConfirmedDiscordMembership:", error)
    return false
  }
  return Boolean(data)
}

/**
 * Concede a conquista + credita 50 de Aura. Idempotente: retorna `already`
 * se este usuário já tinha a conquista, e `account_in_use` se a conta do
 * Discord informada já foi usada por outro usuário do site.
 */
export async function confirmDiscordMembership(
  userId: string,
  discordUserId: string
): Promise<ConfirmDiscordMembershipResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("confirm_discord_membership", {
    p_user_id: userId,
    p_discord_user_id: discordUserId,
  })

  if (error) {
    console.error("[discord-membership-repository] confirmDiscordMembership:", error)
    return "error"
  }
  return (data as ConfirmDiscordMembershipResult) ?? "error"
}
