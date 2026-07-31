"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  isAdminUser,
  resolveAvailableDisplayName,
  upsertUserProfileFromAuth,
} from "@/lib/server/repositories/users-repository"
import { awardEligibleEventMedals } from "@/lib/server/repositories/events-repository"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"

type AuthState = { error: string | null }

export async function loginUserAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  if (!email || !password) {
    return { error: "missing_credentials" }
  }

  const identifier = getClientIdentifierFromHeaders(await headers())
  const rateLimit = await checkRateLimit({
    action: "login",
    identifier: `${identifier}:${email.toLowerCase()}`,
    maxAttempts: 10,
    windowSeconds: 300,
  })
  if (!rateLimit.allowed) {
    return { error: "too_many_attempts" }
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

  // Garante o perfil do usuário para login por e-mail/senha. Mesmo cuidado do
  // OAuth (auth/callback/route.ts): o nome sugerido pode já pertencer a outra
  // conta, então resolve o primeiro slug livre antes de gravar.
  const suggestedName =
    authData.user.user_metadata?.full_name || authData.user.email?.split("@")[0] || "User"
  const { isNew } = await upsertUserProfileFromAuth({
    id: authData.user.id,
    displayName: await resolveAvailableDisplayName(suggestedName, authData.user.id),
    avatarUrl: authData.user.user_metadata?.avatar_url || null,
  })
  // Caso raro: login sem perfil ainda criado conta como cadastro genuíno.
  if (isNew) {
    await awardEligibleEventMedals(authData.user.id)
  }

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
