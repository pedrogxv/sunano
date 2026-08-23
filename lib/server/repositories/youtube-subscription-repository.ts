import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Conquista especial "Inscrito" (binária, sem tiers) — concedida ao
 * confirmar inscrição no canal do YouTube via OAuth (ver
 * app/auth/youtube/callback/route.ts). Toda a atomicidade (conceder +
 * creditar 50 de Aura) vive na função Postgres `confirm_youtube_subscription`
 * (ver 20260921120000_youtube_subscription_achievement.sql); este
 * repositório só chama a RPC e lê a tabela resultante, mesmo padrão de
 * `aura-store-repository.ts`.
 */

/** Se o usuário já confirmou a inscrição no canal do YouTube. */
export async function hasConfirmedYoutubeSubscription(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_youtube_subscription")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[youtube-subscription-repository] hasConfirmedYoutubeSubscription:", error)
    return false
  }
  return Boolean(data)
}

/** Concede a conquista + credita 50 de Aura. Idempotente: retorna `false` se já tinha sido concedida antes. */
export async function confirmYoutubeSubscription(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("confirm_youtube_subscription", { p_user_id: userId })

  if (error) {
    console.error("[youtube-subscription-repository] confirmYoutubeSubscription:", error)
    return false
  }
  return Boolean(data)
}
