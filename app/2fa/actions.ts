"use server"

import { redirect } from "next/navigation"

import { sanitizeNextPath } from "@/lib/auth-mfa"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export type TwoFactorState = { error: string | null }

/**
 * Conclui o segundo fator: emite um challenge para o fator TOTP verificado e
 * o valida com o código de 6 dígitos. Em caso de sucesso a sessão é elevada a
 * `aal2` (o cliente SSR reescreve os cookies) e o usuário segue para `next`.
 */
export async function verifyTotpAction(
  _: TwoFactorState,
  formData: FormData
): Promise<TwoFactorState> {
  const code = String(formData.get("code") || "").replace(/\D/g, "")
  const next = sanitizeNextPath(String(formData.get("next") || ""))

  if (code.length !== 6) {
    return { error: "Informe o código de 6 dígitos." }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect("/login")
  }

  // Trava de força-bruta por conta: o Supabase já limita tentativas, esta é
  // uma defesa adicional na nossa camada.
  const limit = await checkRateLimit({
    action: "mfa_verify",
    identifier: user.id,
    maxAttempts: 5,
    windowSeconds: 300,
  })
  if (!limit.allowed) {
    return { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." }
  }

  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors()
  if (listError) {
    return { error: "Não foi possível validar o 2FA. Tente novamente." }
  }

  const factor = factors?.totp?.find((f) => f.status === "verified")
  if (!factor) {
    // Sem fator verificado o step-up não se aplica — segue o fluxo.
    redirect(next)
  }

  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: factor.id,
  })
  if (challengeError || !challenge) {
    return { error: "Não foi possível validar o 2FA. Tente novamente." }
  }

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challenge.id,
    code,
  })
  if (verifyError) {
    return { error: "Código incorreto. Verifique o app autenticador e tente novamente." }
  }

  redirect(next)
}

/** Sai da conta — escape para quem não tem acesso ao app autenticador. */
export async function cancelTwoFactorAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
