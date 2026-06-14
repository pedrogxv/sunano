"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  upsertUserProfileOnSignup,
  recordLgpdConsent,
  type PurchaseProfileInput,
} from "@/lib/server/repositories/users-repository"

export type RegisterState = { error: string | null; needsConfirmation?: boolean }

const LGPD_POLICY_VERSION = "2026-06"

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
  if (password.length < 6) {
    return { error: "password_too_short" }
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

  const headersList = await headers()
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
  await upsertUserProfileOnSignup({
    id: data.user.id,
    displayName,
    purchase,
    lgpdConsentAt: consentAt,
    lgpdConsentVersion: LGPD_POLICY_VERSION,
  })

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
