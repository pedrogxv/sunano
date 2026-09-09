import "server-only"

import { REFERRAL_STREAK_DAYS } from "@/lib/referral-code"
import {
  claimReferralIdentity,
  getPendingReferralFor,
  validateReferral,
  type ReferralVia,
} from "@/lib/server/repositories/referrals-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Os verificadores do Programa de Indicação: o que transforma um cadastro em
 * uma indicação que PAGA.
 *
 * Por que existe um gate: cadastro puro é gratuito de repetir. Pagar 50 de
 * Aura por cadastro é pagar por e-mail descartável. Cada caminho aqui custa
 * alguma coisa que não escala de graça:
 *
 *   discord_member  — a conta do Discord é única no site inteiro
 *                     (`unique (discord_user_id)`, 20261015000000)
 *   oauth_identity  — o par (provider, provider_id) é único no site inteiro
 *                     (`referral_verified_identities`)
 *   streak_3d       — 3 dias de missões completas; caro em TEMPO, que é a
 *                     única coisa que um fraudador não consegue paralelizar
 *
 * TODA função deste módulo é best-effort e NUNCA lança: elas rodam pendurdas
 * em login, callback de OAuth e conclusão de missão diária. Uma indicação que
 * falha não pode derrubar nenhum desses fluxos — o usuário perderia o acesso
 * por causa de um bônus.
 */

/**
 * Tenta validar a indicação pendente de `userId` por um caminho específico.
 * Silenciosa quando não há indicação pendente (o caso comum: a esmagadora
 * maioria dos usuários não foi indicada por ninguém).
 */
export async function tryValidateReferral(userId: string, via: ReferralVia): Promise<void> {
  try {
    const pending = await getPendingReferralFor(userId)
    if (!pending) return

    const result = await validateReferral(userId, via)
    if (result === "capped_ip" || result === "capped_total") {
      // Não é erro: a indicação foi para revisão manual em /admin/indicacoes.
      console.warn("[referral-verification] indicação retida por teto:", userId, result)
    }
  } catch (err) {
    console.error("[referral-verification] tryValidateReferral falhou:", err)
  }
}

/**
 * Caminho `oauth_identity`: registra a identidade e valida se ela ainda
 * estava livre.
 *
 * `in_use` (outra conta do site já usou esta conta Google/Discord) não valida
 * nada — é exatamente o ataque que o `unique` global existe para barrar.
 * `already_mine` também não revalida: a identidade já foi contada uma vez.
 */
export async function verifyReferralByIdentity(params: {
  userId: string
  provider: "google" | "discord"
  providerId: string
}): Promise<"validated" | "identity_in_use" | "no_referral" | "noop"> {
  try {
    const pending = await getPendingReferralFor(params.userId)

    const claim = await claimReferralIdentity(params)
    if (claim === "in_use") return "identity_in_use"
    if (claim === "error") return "noop"

    if (!pending) return "no_referral"
    // `already_mine` significa que esta identidade já foi reivindicada por
    // este mesmo usuário antes — só vale como gate na primeira vez.
    if (claim !== "claimed") return "noop"

    const result = await validateReferral(params.userId, "oauth_identity")
    return result === "validated" ? "validated" : "noop"
  } catch (err) {
    console.error("[referral-verification] verifyReferralByIdentity falhou:", err)
    return "noop"
  }
}

/**
 * Caminho `streak_3d`. Chamado depois de `complete_daily_mission`, que é o
 * único momento em que a ofensiva avança.
 *
 * Lê `current_streak` direto porque a missão acabou de ser concluída HOJE —
 * a ofensiva está viva por construção, não há o caso de "streak antiga
 * expirada" que `getUserStreak` precisa tratar na leitura.
 */
export async function verifyReferralByStreak(userId: string): Promise<void> {
  try {
    const pending = await getPendingReferralFor(userId)
    if (!pending) return

    const db = createSupabaseAdminClient()
    const { data } = await db
      .from("user_streaks")
      .select("current_streak")
      .eq("user_id", userId)
      .maybeSingle()

    if ((data?.current_streak ?? 0) < REFERRAL_STREAK_DAYS) return

    await tryValidateReferral(userId, "streak_3d")
  } catch (err) {
    console.error("[referral-verification] verifyReferralByStreak falhou:", err)
  }
}

/**
 * Varre as identidades OAuth que o usuário já tem vinculadas e tenta validar
 * por qualquer uma delas. Chamado no login social: cobre quem vinculou a
 * conta ANTES de ser indicado, ou antes de o programa existir.
 */
export async function verifyReferralFromIdentities(
  userId: string,
  identities: { provider: string; id: string }[]
): Promise<void> {
  try {
    const pending = await getPendingReferralFor(userId)
    if (!pending) return

    for (const identity of identities) {
      if (identity.provider !== "google" && identity.provider !== "discord") continue
      const result = await verifyReferralByIdentity({
        userId,
        provider: identity.provider,
        providerId: identity.id,
      })
      if (result === "validated") return
    }
  } catch (err) {
    console.error("[referral-verification] verifyReferralFromIdentities falhou:", err)
  }
}
