"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isLocalhostHost, validatePassword } from "@/lib/password-policy"
import { LGPD_POLICY_VERSION } from "@/lib/lgpd"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"
import { validateDisplayName } from "@/lib/profile-name"
import {
  isDisplayNameAvailable,
  resolveAvailableDisplayName,
  upsertUserProfileOnSignup,
  recordLgpdConsent,
  type PurchaseProfileInput,
} from "@/lib/server/repositories/users-repository"

export type RegisterState = { error: string | null; needsConfirmation?: boolean }

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
      return { error: "email_in_use" }
    }
    return { error: "signup_failed" }
  }

  if (!data.user) {
    return { error: "signup_failed" }
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

  if (!data.session) {
    return { error: null, needsConfirmation: true }
  }

  redirect("/forum")
}
