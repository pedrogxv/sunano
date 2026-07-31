"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
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

export type RegisterState = { error: string | null; needsConfirmation?: boolean }

/** Erro do `auth.signUp`, na forma em que o supabase-js devolve. */
type SignUpError = { message: string; code?: string; status?: number }

/**
 * Traduz a falha do `auth.signUp` num código que o formulário sabe exibir, e
 * diz se a culpa é do servidor.
 *
 * Antes tudo virava `signup_failed` ("Não foi possível concluir o cadastro"),
 * o que mandava a pessoa tentar de novo sem dizer o que houve — inclusive
 * quando tentar de novo não ia adiantar. O caso real mais comum é
 * `over_email_send_rate_limit`: o Supabase recusa o cadastro porque a cota de
 * e-mails do projeto acabou, e o e-mail de confirmação não sai. Não tem
 * relação nenhuma com o que foi digitado, e o cadastro por Google/Discord
 * continua funcionando (não manda e-mail).
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

export async function registerUserAction(
  _: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const email = clean(formData.get("email")).toLowerCase()
  const password = String(formData.get("password") || "")
  const confirmPassword = String(formData.get("confirm_password") || "")
  const displayName = clean(formData.get("display_name"))
  const lgpdConsent = formData.get("lgpd_consent") === "on"

  if (!lgpdConsent) {
    return { error: "lgpd_consent_required" }
  }

  if (!email || !password || !displayName) {
    return { error: "missing_fields" }
  }

  // O nome é único no site (ele vira a URL do perfil). Verificar antes do
  // signUp evita criar o usuário no Auth e falhar depois, ao gravar o perfil.
  const invalidName = validateDisplayName(displayName)
  if (invalidName) {
    return { error: invalidName }
  }
  if (!(await isDisplayNameAvailable(displayName))) {
    return { error: "display_name_taken" }
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
    return { error: "too_many_attempts" }
  }

  const relaxed = isLocalhostHost(headersList.get("host"))
  const passwordError = validatePassword(password, relaxed)
  if (passwordError) {
    return { error: passwordError }
  }
  if (password !== confirmPassword) {
    return { error: "password_mismatch" }
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
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: purchase.fullName || displayName } },
  })

  if (error) {
    if (/already registered|already exists|User already/i.test(error.message)) {
      // Não revela que o email já está cadastrado (evita enumeração de contas) —
      // responde com o mesmo estado de um cadastro novo pendente de confirmação.
      return { error: null, needsConfirmation: true }
    }

    const { state, serverFault } = mapSignUpError(error)
    // O erro real só existia aqui dentro: sem este log, uma indisponibilidade do
    // provedor de e-mail chegava ao suporte como "erro genérico ao cadastrar".
    console.error(
      "[register] auth.signUp falhou:",
      JSON.stringify({ status: error.status, code: error.code, message: error.message, state })
    )
    if (serverFault) {
      await refundRateLimitAttempt(rateLimit.attemptId)
    }
    return { error: state }
  }

  if (!data.user) {
    console.error("[register] auth.signUp retornou sem usuário e sem erro.")
    await refundRateLimitAttempt(rateLimit.attemptId)
    return { error: "signup_unavailable" }
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

  // `auth.signUp` sempre cria um id novo: este é sempre um cadastro genuíno,
  // então concede a medalha de qualquer evento ativo (ex: "Pioneiro").
  await awardEligibleEventMedals(data.user.id)

  if (!data.session) {
    return { error: null, needsConfirmation: true }
  }

  redirect("/forum")
}
