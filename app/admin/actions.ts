"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { hasAnyAdminAccess } from "@/lib/admin-permissions"
import { isMfaStepUpRequired, TRUSTED_DEVICE_COOKIE_NAME } from "@/lib/auth-mfa"
import { verifyTurnstileToken } from "@/lib/server/integrations/turnstile"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"
import { isTrustedDevice } from "@/lib/server/repositories/mfa-trusted-devices-repository"
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
  captchaFailed: "captcha_failed",
  tooManyAttempts: "too_many_attempts",
} as const

export async function loginAction(_: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim()
  const password = String(formData.get("password") || "")

  if (!email || !password) {
    return { error: AUTH_ERRORS.missingCredentials }
  }

  // Mesmas duas barreiras do login público (app/login/actions.ts). Este
  // formulário chama `signInWithPassword` para QUALQUER conta, não só admin,
  // então sem elas ele era o atalho de força bruta que contornava o captcha
  // do /login. A ação de rate limit é a MESMA ("login", mesmo identificador):
  // alternar entre os dois formulários não dobra a cota de tentativas.
  const headersList = await headers()
  const turnstileToken = formData.get("cf_turnstile_response")
  const clientIp = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const captcha = await verifyTurnstileToken(
    typeof turnstileToken === "string" ? turnstileToken : null,
    clientIp
  )
  if (!captcha.success) {
    return { error: AUTH_ERRORS.captchaFailed }
  }

  const rateLimit = await checkRateLimit({
    action: "login",
    identifier: `${getClientIdentifierFromHeaders(headersList)}:${email.toLowerCase()}`,
    maxAttempts: 10,
    windowSeconds: 300,
    onError: "closed",
  })
  if (!rateLimit.allowed) {
    return { error: AUTH_ERRORS.tooManyAttempts }
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

  // 2FA ativo: conclui o segundo fator antes de liberar o painel — a menos
  // que este navegador já tenha sido marcado como confiável (ver /2fa/actions.ts).
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
    const trustedToken = (await cookies()).get(TRUSTED_DEVICE_COOKIE_NAME)?.value
    if (!(await isTrustedDevice(authData.user.id, trustedToken))) {
      redirect("/2fa?next=%2Fadmin")
    }
  }

  redirect("/admin")
}

export async function logoutAction() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect("/admin/login")
}