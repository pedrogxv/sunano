"use server"

import { redirect } from "next/navigation"

import { hasAnyAdminAccess } from "@/lib/admin-permissions"
import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  resolveAvailableDisplayName,
  upsertUserProfileFromAuth,
} from "@/lib/server/repositories/users-repository"

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
  if (!authData.user) {
    await supabase.auth.signOut()
    return { error: AUTH_ERRORS.noAdminAccess }
  }

  const { data: profile } = await supabase
    .from("admin_profiles")
    .select("id, role, permissions")
    .eq("id", authData.user.id)
    .maybeSingle()

  if (!profile) {
    await supabase.auth.signOut()
    return { error: AUTH_ERRORS.noAdminAccess }
  }

  if (!hasAnyAdminAccess(profile)) {
    await supabase.auth.signOut()
    return { error: AUTH_ERRORS.noAdminAccess }
  }

  // Admin também é membro comum (fórum, perfil público, "Meu Setup"): sem
  // isto a conta nunca ganha linha em `user_profiles` (só `admin_profiles`),
  // e a tela de /perfil fica travada no nome-fallback derivado do e-mail,
  // sem conseguir salvar nada — ver app/login/actions.ts, que já faz isto.
  await upsertUserProfileFromAuth({
    id: authData.user.id,
    displayName: await resolveAvailableDisplayName(
      authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "User",
      authData.user.id
    ),
    avatarUrl: authData.user.user_metadata?.avatar_url || null,
  })

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