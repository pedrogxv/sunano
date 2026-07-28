import { NextRequest, NextResponse } from "next/server"

import { isMfaStepUpRequired } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import {
  isAdminUser,
  resolveAvailableDisplayName,
  upsertUserProfileFromAuth,
} from "@/lib/server/repositories/users-repository"

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
    // O nome vindo do Google/Discord pode já pertencer a outra conta — e não
    // dá para parar o login e pedir outro. Entra o primeiro livre derivado
    // dele ("tried", "tried2"…); o dono ajusta depois em /perfil.
    const suggestedName =
      authData.user.user_metadata?.full_name ||
      authData.user.user_metadata?.name ||
      authData.user.email?.split("@")[0] ||
      "User"

    await upsertUserProfileFromAuth({
      id: authData.user.id,
      displayName: await resolveAvailableDisplayName(suggestedName, authData.user.id),
      avatarUrl:
        authData.user.user_metadata?.avatar_url ||
        authData.user.user_metadata?.picture ||
        null,
    })

    // O destino do OAuth vem da query (`next`) e é controlável pelo cliente —
    // o botão do /admin/login manda "/admin". Quem não tem perfil
    // administrativo nunca pode ser levado ao painel: sem isso a pessoa
    // entrava, era barrada pelo proxy e ficava logada presa no /admin/login,
    // sem explicação. Espelha o `loginAction`: encerra a sessão e avisa.
    const wantsAdmin = next === "/admin" || next.startsWith("/admin/")
    const isAdmin = await isAdminUser(authData.user.id)

    if (wantsAdmin && !isAdmin) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/admin/login?error=no_admin_access`)
    }

    // Admins que entraram pelo site público vão direto ao painel.
    const destination = next === "/forum" && isAdmin ? "/admin" : next

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
