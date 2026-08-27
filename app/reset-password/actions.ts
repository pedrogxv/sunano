"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"

import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isLocalhostHost, validatePassword } from "@/lib/password-policy"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"

type State = { error: string | null }

/**
 * Consome de fato o token de recuperação — só é chamada a partir do clique
 * explícito em `/reset-password` (ver ConfirmRecoveryForm), nunca a partir de
 * um GET automático. É isso que impede um scanner de segurança de e-mail
 * (que só faz GET) de queimar o link antes da pessoa clicar de verdade.
 */
export async function confirmRecoveryAction(formData: FormData): Promise<void> {
  const tokenHash = String(formData.get("token_hash") || "")
  const code = String(formData.get("code") || "")

  const supabase = await createSupabaseServerClient()

  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
    : await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    // Sem este log a falha era indistinguível: token realmente expirado,
    // token já consumido, ou `code_verifier` ausente (o modo PKCE do
    // @supabase/ssr guarda o verifier num cookie do navegador que PEDIU a
    // recuperação — abrir o e-mail em outro navegador/app faz o
    // `exchangeCodeForSession` falhar mesmo com o link novinho).
    console.error(
      "[reset-password] confirmRecovery falhou",
      tokenHash ? "verifyOtp" : "exchangeCodeForSession",
      error.status,
      error.code,
      error.message
    )
    redirect("/login?error=recovery_error")
  }

  redirect("/reset-password")
}

export async function resetPasswordAction(_: State, formData: FormData): Promise<State> {
  const password = String(formData.get("password") || "")
  const confirm = String(formData.get("confirm") || "")

  const headersList = await headers()
  const relaxed = isLocalhostHost(headersList.get("host"))

  const passwordError = validatePassword(password, relaxed)
  if (passwordError) {
    return { error: passwordError }
  }

  if (password !== confirm) {
    return { error: "As senhas não coincidem." }
  }

  const supabase = await createSupabaseServerClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return { error: "Link de redefinição expirado. Solicite um novo." }
  }

  const identifier = getClientIdentifierFromHeaders(headersList)
  const rateLimit = await checkRateLimit({
    action: "reset_password",
    identifier: `${identifier}:${user.id}`,
    maxAttempts: 5,
    windowSeconds: 300,
  })
  if (!rateLimit.allowed) {
    return { error: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente." }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    console.error("[reset-password] updateUser failed", error.status, error.code, error.message)
    return { error: "Não foi possível atualizar a senha. O link pode ter expirado." }
  }

  redirect("/login?password_updated=1")
}
