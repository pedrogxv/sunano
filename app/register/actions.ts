"use server"

import { redirect } from "next/navigation"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  upsertUserProfileOnSignup,
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

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: purchase.fullName || displayName } },
  })

  if (error) {
    // Supabase sinaliza email já cadastrado de formas diferentes; tratamos o caso comum.
    if (/already registered|already exists|User already/i.test(error.message)) {
      return { error: "email_in_use" }
    }
    return { error: "signup_failed" }
  }

  if (!data.user) {
    return { error: "signup_failed" }
  }

  // Cria o perfil (com dados de compra, se informados). Usa o id do usuário
  // criado — funciona mesmo quando a confirmação de email está habilitada.
  await upsertUserProfileOnSignup({ id: data.user.id, displayName, purchase })

  // Sem sessão = confirmação de email habilitada no projeto Supabase.
  if (!data.session) {
    return { error: null, needsConfirmation: true }
  }

  redirect("/forum")
}
