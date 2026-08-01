import "server-only"

import { createHash, randomBytes } from "crypto"

import { TRUSTED_DEVICE_MAX_AGE_SECONDS } from "@/lib/auth-mfa"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * "Lembrar este dispositivo" para o 2FA: como o Supabase não tem esse
 * conceito nativo, a confiança é controlada inteiramente por esta camada —
 * o JWT da sessão continua em `aal1`, e cada leitura de rota decide se
 * aceita isso com base num cookie opaco cujo hash bate com uma linha aqui
 * ainda não expirada (ver `isMfaStepUpRequired` + este módulo em
 * `proxy.ts`, `app/2fa/actions.ts`, `app/login/actions.ts`, `app/admin/actions.ts`).
 *
 * Nunca armazena o token em texto puro — só o hash SHA-256, no mesmo
 * espírito de `lib/server/rate-limit.ts` (identificador derivado, não o dado
 * bruto).
 */

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export async function createTrustedDevice(
  userId: string,
  userAgent: string | null
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url")
  const expiresAt = new Date(Date.now() + TRUSTED_DEVICE_MAX_AGE_SECONDS * 1000)

  const db = createSupabaseAdminClient()
  await db.from("mfa_trusted_devices").insert({
    user_id: userId,
    token_hash: hashToken(token),
    user_agent: userAgent,
    expires_at: expiresAt.toISOString(),
  })

  return { token, expiresAt }
}

/** Verifica se `token` (valor cru do cookie) confirma este dispositivo como confiável para `userId`. */
export async function isTrustedDevice(userId: string, token: string | undefined | null): Promise<boolean> {
  if (!token) return false

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("mfa_trusted_devices")
    .select("id")
    .eq("user_id", userId)
    .eq("token_hash", hashToken(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  return Boolean(data)
}

/** Revoga todos os dispositivos confiáveis do usuário — chamado ao desativar o 2FA ou sob pedido explícito (conta > segurança). */
export async function revokeAllTrustedDevices(userId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  await db.from("mfa_trusted_devices").delete().eq("user_id", userId)
}

/** Quantos dispositivos confiáveis ainda válidos o usuário tem — exibido em Segurança da conta. */
export async function countTrustedDevices(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count } = await db
    .from("mfa_trusted_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gt("expires_at", new Date().toISOString())

  return count ?? 0
}
