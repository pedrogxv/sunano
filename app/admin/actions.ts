"use server"

import { redirect } from "next/navigation"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

type AuthState = {
  error: string | null
}

const AUTH_ERRORS = {
  missingCredentials: "missing_credentials",
  invalidCredentials: "invalid_credentials",
  noAdminAccess: "no_admin_access",
} as const

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  if (!email || !password) {
    return { error: AUTH_ERRORS.missingCredentials }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: AUTH_ERRORS.invalidCredentials }
  }

  const { data: authData } = await supabase.auth.getUser()
  const { data: profile } = authData.user
    ? await supabase
        .from("admin_profiles")
        .select("id, role, permissions")
        .eq("id", authData.user.id)
        .maybeSingle()
    : { data: null }

  if (!profile) {
    await supabase.auth.signOut()
    return { error: AUTH_ERRORS.noAdminAccess }
  }

  if (!hasAdminPermission(profile, "dashboard_read")) {
    await supabase.auth.signOut()
    return { error: AUTH_ERRORS.noAdminAccess }
  }

  // 2FA ativo: conclui o segundo fator antes de liberar o painel.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
    redirect("/2fa?next=%2Fadmin")
  }

  redirect("/admin")
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/admin/login")
}