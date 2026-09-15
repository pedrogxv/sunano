import "server-only"

import type { User } from "@supabase/supabase-js"

/**
 * Janela em que a conta ainda é "recém-criada". O /consentimento vem logo
 * depois do primeiro login social; 30 minutos cobrem quem demora a ler a
 * política sem alcançar ninguém que já use o site (sem consentimento o proxy
 * não deixa navegar).
 */
const FRESH_SOCIAL_ACCOUNT_MAX_AGE_MS = 30 * 60 * 1000

const SOCIAL_PROVIDERS = new Set(["google", "discord"])

/**
 * Conta que acabou de nascer de um login com Google/Discord.
 *
 * O Supabase só junta o login social a uma conta existente quando o e-mail é o
 * mesmo. Quem tem conta com um e-mail e entra pelo Discord de outro e-mail
 * ganha uma conta nova, sem aviso, e essa conta passa a segurar o Discord: ao
 * tentar vinculá-lo na conta de verdade vem "já está ligada a outro perfil".
 * O /consentimento é a primeira tela dessa conta nova, então é lá que ela é
 * identificada e, se a pessoa não seguir, descartada.
 *
 * Só identidades sociais: conta com login por e-mail/senha nunca entra aqui.
 * Quem chama ainda precisa confirmar que o consentimento não foi registrado.
 */
export function isFreshSocialAccount(user: User): boolean {
  const identities = user.identities ?? []
  const createdAt = Date.parse(user.created_at)

  return (
    identities.length > 0 &&
    identities.every((identity) => SOCIAL_PROVIDERS.has(identity.provider)) &&
    Number.isFinite(createdAt) &&
    Date.now() - createdAt < FRESH_SOCIAL_ACCOUNT_MAX_AGE_MS
  )
}

/** Nome do provedor para o texto da tela ("Discord", "Google"). */
export function freshSocialProviderLabel(user: User): string {
  const providers = new Set((user.identities ?? []).map((identity) => identity.provider))
  if (providers.has("discord") && providers.has("google")) return "Google ou Discord"
  return providers.has("discord") ? "Discord" : "Google"
}
