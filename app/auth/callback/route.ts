import { NextRequest, NextResponse } from "next/server"

import { isMfaStepUpRequired, sanitizeNextPath } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { getAccountBanStatus } from "@/lib/server/repositories/account-ban-repository"
import {
  hasRecordedLgpdConsent,
  isAdminUser,
  resolveAvailableDisplayName,
  upsertUserProfileFromAuth,
} from "@/lib/server/repositories/users-repository"
import { awardEligibleEventMedals } from "@/lib/server/repositories/events-repository"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const next = sanitizeNextPath(searchParams.get("next"))

  const supabase = await createSupabaseServerClient()

  if (tokenHash && type === "recovery") {
    // Não consome o token aqui: scanners de segurança de e-mail corporativos
    // (Outlook Safe Links, Defender etc.) seguem todo link de um e-mail
    // recebido com um GET automático, e o token de recuperação é de uso
    // único — se essa varredura chegasse a chamar `verifyOtp`, o clique real
    // da pessoa encontraria o link já "expirado". Só repassamos o hash pra
    // `/reset-password`, que exige um clique explícito (POST) antes de
    // verificar de fato — algo que um bot de varredura não faz.
    return NextResponse.redirect(`${origin}/reset-password?token_hash=${encodeURIComponent(tokenHash)}`)
  }

  if (tokenHash && type === "signup") {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "signup" })
    if (error) {
      // Também de uso único: se o clique duplo (ou o link já usado) já
      // confirmou a conta antes, `verifyOtp` falha na segunda tentativa mesmo
      // a pessoa já podendo logar — manda pro login sem alarmar.
      if (/expired|invalid/i.test(error.message)) {
        return NextResponse.redirect(`${origin}/login?error=confirmation_error`)
      }
      return NextResponse.redirect(`${origin}/login`)
    }
    // Confirmar o e-mail não cria sessão (ver nota em app/register/actions.ts
    // sobre `confirmed_at`) — a pessoa ainda precisa logar com a senha.
    await supabase.auth.signOut()
    return NextResponse.redirect(`${origin}/login?confirmed=1`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // PKCE recovery: Supabase envia code + type=recovery (em vez de token_hash).
  // Mesmo raciocínio do ramo `token_hash` acima — o `code` também é de uso
  // único, então não trocamos por sessão aqui; só repassamos pro
  // `/reset-password`, que exige o clique explícito antes de consumir.
  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password?code=${encodeURIComponent(code)}`)
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    return NextResponse.redirect(`${origin}/login?error=oauth_error`)
  }

  const { data: authData } = await supabase.auth.getUser()
  if (authData.user) {
    // Conta banida: abortar antes de qualquer outra coisa (upsert de perfil,
    // 2FA, LGPD) — não deve nem chegar a progredir por essas etapas.
    const banStatus = await getAccountBanStatus(authData.user.id)
    if (banStatus.isBanned) {
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=account_banned`)
    }

    // Garante o perfil do usuário a partir dos metadados do OAuth.
    // O nome vindo do Google/Discord pode já pertencer a outra conta — e não
    // dá para parar o login e pedir outro. Entra o primeiro livre derivado
    // dele ("tried", "tried2"…); o dono ajusta depois em /perfil.
    const suggestedName =
      authData.user.user_metadata?.full_name ||
      authData.user.user_metadata?.name ||
      authData.user.email?.split("@")[0] ||
      "User"

    const { isNew } = await upsertUserProfileFromAuth({
      id: authData.user.id,
      displayName: await resolveAvailableDisplayName(suggestedName, authData.user.id),
      avatarUrl:
        authData.user.user_metadata?.avatar_url ||
        authData.user.user_metadata?.picture ||
        null,
    })
    // Primeiro login OAuth = cadastro genuíno: concede a medalha de evento ativo.
    if (isNew) {
      await awardEligibleEventMedals(authData.user.id)
    }

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
    const postMfaDestination = isMfaStepUpRequired({ current: aal?.currentLevel ?? null, next: aal?.nextLevel ?? null })
      ? `/2fa?next=${encodeURIComponent(destination)}`
      : destination

    // Cadastro por e-mail/senha exige o checkbox de consentimento LGPD antes
    // de criar a conta (app/register/actions.ts). O login social não passa
    // por ali — a conta já nasce no exchangeCodeForSession acima —, então
    // este é o único ponto onde dá pra cobrar o consentimento sem deixar a
    // pessoa usar a plataforma sem ele.
    const hasConsent = await hasRecordedLgpdConsent(authData.user.id)
    if (!hasConsent) {
      return NextResponse.redirect(`${origin}/consentimento?next=${encodeURIComponent(postMfaDestination)}`)
    }

    return NextResponse.redirect(`${origin}${postMfaDestination}`)
  }

  return NextResponse.redirect(`${origin}${next}`)
}
