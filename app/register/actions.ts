"use server"

import { headers } from "next/headers"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { isLocalhostHost, validatePassword } from "@/lib/password-policy"
import { LGPD_POLICY_VERSION } from "@/lib/lgpd"
import {
  checkRateLimit,
  getClientIdentifierFromHeaders,
  refundRateLimitAttempt,
} from "@/lib/server/rate-limit"
import { validateDisplayName } from "@/lib/profile-name"
import {
  isDisplayNameAvailable,
  resolveAvailableDisplayName,
  upsertUserProfileOnSignup,
  recordLgpdConsent,
  type PurchaseProfileInput,
} from "@/lib/server/repositories/users-repository"
import { awardEligibleEventMedals } from "@/lib/server/repositories/events-repository"

export type RegisterState = {
  error: string | null
  needsConfirmation?: boolean
  /**
   * A conta já existia e já está confirmada — a pessoa deve fazer login, não
   * esperar por um novo email. Distinto de `needsConfirmation`: aquele cobre
   * tanto cadastro novo quanto conta existente ainda não confirmada (que
   * ganha um reenvio); este é só para quem já pode entrar.
   */
  alreadyRegistered?: boolean
  /**
   * Ecoa de volta os campos não sensíveis que a pessoa preencheu, para o form
   * poder repopulá-los depois de um erro. `<form action={fn}>` (React 19)
   * reseta os campos não controlados assim que a action termina — mesmo em
   * erro — então sem isso o usuário perdia tudo e tinha que digitar de novo.
   * Senha nunca entra aqui: nem por LGPD (minimização, Art. 6, VI) nem por
   * segurança faz sentido ela voltar do servidor pro client.
   */
  values?: { displayName: string; email: string }
}

/** Erro do `auth.signUp`, na forma em que o supabase-js devolve. */
type SignUpError = { message: string; code?: string; status?: number }

/**
 * Traduz a falha do `auth.admin.createUser` num código que o formulário sabe
 * exibir, e diz se a culpa é do servidor.
 *
 * Antes tudo virava `signup_failed` ("Não foi possível concluir o cadastro"),
 * o que mandava a pessoa tentar de novo sem dizer o que houve — inclusive
 * quando tentar de novo não ia adiantar. `over_email_send_rate_limit` não é
 * mais alcançável aqui porque a criação da conta (admin API) não depende do
 * envio de e-mail — fica só como salvaguarda caso o Supabase mude esse
 * comportamento. O envio do e-mail de confirmação agora é best-effort,
 * separado da criação da conta (ver `registerUserAction`).
 *
 * `serverFault` marca as falhas que não são culpa de quem se cadastrou: elas
 * são logadas como erro e devolvem a tentativa ao rate limit.
 */
function mapSignUpError(error: SignUpError): { state: string; serverFault: boolean } {
  const code = error.code ?? ""
  const message = error.message ?? ""

  if (code === "over_email_send_rate_limit" || /email rate limit/i.test(message)) {
    return { state: "email_send_limit", serverFault: true }
  }
  if (code === "over_request_rate_limit" || error.status === 429) {
    return { state: "too_many_attempts", serverFault: true }
  }
  if (code === "weak_password") {
    return { state: "weak_password", serverFault: false }
  }
  if (code === "email_address_invalid" || code === "validation_failed") {
    return { state: "invalid_email", serverFault: false }
  }
  if (code === "signup_disabled" || code === "email_provider_disabled") {
    return { state: "signup_disabled", serverFault: true }
  }
  // 5xx do Auth/banco: indisponibilidade, não erro de preenchimento.
  if ((error.status ?? 0) >= 500) {
    return { state: "signup_unavailable", serverFault: true }
  }
  return { state: "signup_failed", serverFault: true }
}

function clean(value: FormDataEntryValue | null): string {
  return String(value ?? "").trim()
}

function optional(value: FormDataEntryValue | null): string | null {
  const v = clean(value)
  return v.length > 0 ? v : null
}

/** `origin` nem sempre é enviado; reconstrói a partir do host quando faltar (mesmo padrão de forgot-password/actions.ts). */
function resolveOrigin(headersList: Headers): string {
  const host = headersList.get("host") ?? ""
  const proto = headersList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")
  return headersList.get("origin") || (host ? `${proto}://${host}` : "")
}

export async function registerUserAction(
  _: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const email = clean(formData.get("email")).toLowerCase()
  const password = String(formData.get("password") || "")
  const confirmPassword = String(formData.get("confirm_password") || "")
  const displayName = clean(formData.get("display_name"))
  const lgpdConsent = formData.get("lgpd_consent") === "on"
  const values = { displayName, email }

  if (!lgpdConsent) {
    return { error: "lgpd_consent_required", values }
  }

  if (!email || !password || !displayName) {
    return { error: "missing_fields", values }
  }

  // O nome é único no site (ele vira a URL do perfil). Verificar antes do
  // signUp evita criar o usuário no Auth e falhar depois, ao gravar o perfil.
  const invalidName = validateDisplayName(displayName)
  if (invalidName) {
    return { error: invalidName, values }
  }
  if (!(await isDisplayNameAvailable(displayName))) {
    return { error: "display_name_taken", values }
  }

  const headersList = await headers()

  const identifier = getClientIdentifierFromHeaders(headersList)
  const rateLimit = await checkRateLimit({
    action: "register",
    identifier,
    maxAttempts: 5,
    windowSeconds: 3600,
  })
  if (!rateLimit.allowed) {
    return { error: "too_many_attempts", values }
  }

  const relaxed = isLocalhostHost(headersList.get("host"))
  const passwordError = validatePassword(password, relaxed)
  if (passwordError) {
    return { error: passwordError, values }
  }
  if (password !== confirmPassword) {
    return { error: "password_mismatch", values }
  }

  // Dados de compra (cadastro completo) — todos opcionais.
  const purchase: PurchaseProfileInput = {
    fullName: optional(formData.get("full_name")),
    cpf: optional(formData.get("cpf")),
    phone: optional(formData.get("phone")),
    postalCode: optional(formData.get("postal_code")),
    street: optional(formData.get("street")),
    number: optional(formData.get("number")),
    complement: optional(formData.get("complement")),
    neighborhood: optional(formData.get("neighborhood")),
    city: optional(formData.get("city")),
    state: optional(formData.get("state")),
  }

  const ipAddress =
    headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    headersList.get("x-real-ip") ??
    null

  const consentAt = new Date().toISOString()

  const supabase = await createSupabaseServerClient()
  const adminClient = createSupabaseAdminClient()

  // Cria a conta via admin API: ao contrário de `auth.signUp`, isso nunca
  // dispara e-mail — a criação da conta deixa de depender da cota de envio
  // do provedor. O e-mail de confirmação é enviado à parte, logo abaixo,
  // como tentativa best-effort que não bloqueia o cadastro.
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: purchase.fullName || displayName },
  })

  if (error) {
    if (error.code === "email_exists" || /already registered|already exists|User already/i.test(error.message)) {
      // A conta já existe: descobrir se está confirmada tentando reenviar o
      // email de confirmação. O GoTrue recusa esse reenvio com
      // `email_already_confirmed` (HTTP 422/400) quando a conta já pode
      // logar — nesse caso mandamos a pessoa para o login em vez de fingir
      // "conta criada". Se a conta ainda estiver em limbo (nunca confirmou),
      // o reenvio funciona de verdade e ela sai do beco sem saída que existia
      // antes (cadastrar de novo não fazia nada).
      try {
        const { error: resendError } = await supabase.auth.resend({
          type: "signup",
          email,
          options: { emailRedirectTo: `${resolveOrigin(headersList)}/auth/callback?type=signup` },
        })
        if (resendError) {
          if (resendError.code === "email_already_confirmed" || /already confirmed/i.test(resendError.message)) {
            return { error: null, alreadyRegistered: true, values }
          }
          console.error(
            "[register] resend para email_exists falhou:",
            JSON.stringify({ status: resendError.status, code: resendError.code, message: resendError.message })
          )
        }
      } catch (resendException) {
        console.error("[register] resend para email_exists lançou exceção:", resendException)
      }
      return { error: null, needsConfirmation: true, values }
    }

    const { state, serverFault } = mapSignUpError(error)
    // O erro real só existia aqui dentro: sem este log, uma indisponibilidade do
    // provedor de e-mail chegava ao suporte como "erro genérico ao cadastrar".
    console.error(
      "[register] auth.admin.createUser falhou:",
      JSON.stringify({ status: error.status, code: error.code, message: error.message, state })
    )
    if (serverFault) {
      await refundRateLimitAttempt(rateLimit.attemptId)
    }
    return { error: state, values }
  }

  if (!data.user) {
    console.error("[register] auth.admin.createUser retornou sem usuário e sem erro.")
    await refundRateLimitAttempt(rateLimit.attemptId)
    return { error: "signup_unavailable", values }
  }

  // Envia o e-mail de confirmação. Best-effort: se o provedor estiver sem
  // cota, a conta já foi criada mesmo assim — a tela de "conta criada" tem
  // um botão de reenvio (`resendConfirmationAction`) para esse caso.
  try {
    const { error: resendError } = await supabase.auth.resend({
      type: "signup",
      email,
      options: { emailRedirectTo: `${resolveOrigin(headersList)}/auth/callback?type=signup` },
    })
    if (resendError) {
      console.error("[register] resend do e-mail de confirmação falhou:", resendError.message)
    }
  } catch (resendException) {
    console.error("[register] resend do e-mail de confirmação lançou exceção:", resendException)
  }

  // Cria o perfil com o registro de consentimento LGPD.
  try {
    await upsertUserProfileOnSignup({
      id: data.user.id,
      displayName,
      purchase,
      lgpdConsentAt: consentAt,
      lgpdConsentVersion: LGPD_POLICY_VERSION,
    })
  } catch {
    // Alguém tomou o nome entre a checagem e a gravação. O usuário já existe
    // no Auth: deixá-lo sem perfil quebraria a conta, então entra com um nome
    // livre derivado do escolhido — dá para trocar depois em /perfil.
    await upsertUserProfileOnSignup({
      id: data.user.id,
      displayName: await resolveAvailableDisplayName(displayName, data.user.id),
      purchase,
      lgpdConsentAt: consentAt,
      lgpdConsentVersion: LGPD_POLICY_VERSION,
    })
  }

  // Registra o consentimento no audit_log.
  await recordLgpdConsent({
    userId: data.user.id,
    version: LGPD_POLICY_VERSION,
    ipAddress,
  })

  // A admin API sempre cria um id novo: este é sempre um cadastro genuíno,
  // então concede a medalha de qualquer evento ativo (ex: "Pioneiro").
  await awardEligibleEventMedals(data.user.id)

  // O Supabase não permite sessão para email não confirmado (verificado por
  // completo: `signInWithPassword` recusa com "Email not confirmed" mesmo com
  // "Confirm email" desativado no projeto — a checagem é sobre o
  // `confirmed_at` do próprio usuário, não sobre a configuração do projeto).
  // A pessoa entra depois de clicar no link; aqui só confirmamos que a conta
  // foi criada com sucesso.
  return { error: null, needsConfirmation: true, values }
}

export type ResendConfirmationState = { error: string | null; success: boolean }

/**
 * Reenvia o e-mail de confirmação a partir da tela de "conta criada".
 *
 * Não exige sessão (a pessoa ainda não confirmou, então não tem uma) — o
 * rate limit é o próprio `auth.resend` do Supabase, do mesmo jeito que
 * `forgotPasswordAction` (app/forgot-password/actions.ts) já faz para o
 * link de recuperação de senha. Sempre responde de forma genérica quando o
 * Supabase aceita a chamada, sem revelar se a conta existe ou já foi
 * confirmada (evita enumeração de contas).
 */
export async function resendConfirmationAction(
  _: ResendConfirmationState,
  formData: FormData
): Promise<ResendConfirmationState> {
  const email = clean(formData.get("email")).toLowerCase()
  if (!email) {
    return { error: "missing_fields", success: false }
  }

  const headersList = await headers()
  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: { emailRedirectTo: `${resolveOrigin(headersList)}/auth/callback?type=signup` },
  })

  if (error) {
    console.error("[resend-confirmation] auth.resend falhou:", error.status, error.message)
    if (error.status === 429 || /rate limit|too many/i.test(error.message)) {
      return { error: "email_send_limit", success: false }
    }
    return { error: "resend_failed", success: false }
  }

  return { error: null, success: true }
}
