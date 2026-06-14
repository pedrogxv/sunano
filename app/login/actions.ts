"use server"

import { redirect } from "next/navigation"
import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isAdminUser, upsertUserProfileFromAuth } from "@/lib/server/repositories/users-repository"

type AuthState = { error: string | null }

export async function loginUserAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  if (!email || !password) {
    return { error: "missing_credentials" }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    return { error: "invalid_credentials" }
  }

  const { data: authData } = await supabase.auth.getUser()
  if (!authData.user) {
    return { error: "invalid_credentials" }
  }

  // Garante o perfil do usuário para login por e-mail/senha.
  await upsertUserProfileFromAuth({
    id: authData.user.id,
    displayName:
      authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "User",
    avatarUrl: authData.user.user_metadata?.avatar_url || null,
  })

  // Admins vão para o painel; demais usuários para o fórum.
  const destination = (await isAdminUser(authData.user.id)) ? "/admin" : "/forum"

  // 2FA ativo: a sessão nasce em aal1 e precisa concluir o segundo fator
  // antes de acessar qualquer coisa. Manda direto para a verificação.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
    redirect(`/2fa?next=${encodeURIComponent(destination)}`)
  }

  redirect(destination)
}

export async function logoutUserAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/login")
}
