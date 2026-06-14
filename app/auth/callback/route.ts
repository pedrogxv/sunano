import { NextRequest, NextResponse } from "next/server"

import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { isAdminUser, upsertUserProfileFromAuth } from "@/lib/server/repositories/users-repository"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = searchParams.get("next") ?? "/forum"

  const supabase = await createSupabaseServerClient()

  if (tokenHash && type === "recovery") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" })
    if (error) {
      // O token de recuperação é de uso único: ao reabrir o link ele já foi
      // consumido. Se a primeira abertura já criou a sessão de recuperação,
      // seguimos para o reset em vez de mostrar erro.
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      return NextResponse.redirect(`${origin}/login?error=recovery_error`)
    }
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    // PKCE recovery reaberto: o code também é de uso único. Se a sessão de
    // recuperação já foi criada na primeira abertura, segue para o reset.
    if (type === "recovery") {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
    }
    return NextResponse.redirect(`${origin}/login?error=oauth_error`)
  }

  // PKCE recovery: Supabase envia code + type=recovery (em vez de token_hash)
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`)
  }

  const { data: authData } = await supabase.auth.getUser()
  if (authData.user) {
    // Garante o perfil do usuário a partir dos metadados do OAuth.
    await upsertUserProfileFromAuth({
      id: authData.user.id,
      displayName:
        authData.user.user_metadata?.full_name ||
        authData.user.user_metadata?.name ||
        authData.user.email?.split("@")[0] ||
        "User",
      avatarUrl:
        authData.user.user_metadata?.avatar_url ||
        authData.user.user_metadata?.picture ||
        null,
    })

    // Admins são redirecionados ao painel.
    const destination =
      next === "/forum" && (await isAdminUser(authData.user.id)) ? "/admin" : next

    // 2FA ativo: a sessão OAuth também nasce em aal1. Exige o segundo fator
    // antes de seguir para o destino.
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })) {
      return NextResponse.redirect(`${origin}/2fa?next=${encodeURIComponent(destination)}`)
    }

    return NextResponse.redirect(`${origin}${destination}`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
