"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import type { AMREntry } from "@supabase/supabase-js"

import { IMPERSONATION_ORIGIN_COOKIE } from "@/lib/impersonation-shared"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isLocalhostHost, validatePassword } from "@/lib/password-policy"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"

type State = { error: string | null }

/**
 * Métodos com que a sessão de um link de e-mail é marcada pelo Supabase
 * Auth: `otp` quando o token do link é verificado por `verifyOtp` (nosso
 * `confirmRecoveryAction`), `recovery`/`magiclink` quando chega pelo fluxo
 * PKCE do callback. Login por senha (`password`) e social (`oauth`) nunca
 * entram aqui.
 */
const RECOVERY_METHODS = new Set(["otp", "recovery", "magiclink"])

/** Janela para concluir a troca depois de abrir o link. */
const RECOVERY_WINDOW_SECONDS = 60 * 60

/**
 * A sessão atual nasceu de um link de recuperação recente?
 *
 * Sem esta checagem, qualquer sessão logada trocava a senha aqui sem pedir a
 * senha atual (a rota de Conta > Segurança pede), então uma sessão roubada
 * virava perda permanente da conta. Entradas em formato string (hook de
 * token customizado) não trazem horário: valem só pelo método.
 */
function isFreshRecoverySession(methods: ReadonlyArray<AMREntry | string> | undefined): boolean {
  const nowSeconds = Math.floor(Date.now() / 1000)
  return (methods ?? []).some((entry) => {
    if (typeof entry === "string") return RECOVERY_METHODS.has(entry)
    return RECOVERY_METHODS.has(entry.method) && nowSeconds - entry.timestamp <= RECOVERY_WINDOW_SECONDS
  })
}

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

  // Sessão "logado como" é somente leitura: nunca troca a senha do alvo. O
  // proxy já recusa POST nessa sessão; esta é a segunda trava.
  if ((await cookies()).get(IMPERSONATION_ORIGIN_COOKIE)?.value) {
    return { error: "Sessão de acesso é somente leitura." }
  }

  const { data: assurance } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (!isFreshRecoverySession(assurance?.currentAuthenticationMethods)) {
    return {
      error:
        "Esta tela só troca a senha a partir do link de recuperação enviado por email. Se você está logado, troque em Conta > Segurança, que pede a senha atual.",
    }
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
