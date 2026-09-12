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
import { registerReferral } from "@/lib/server/repositories/referrals-repository"
import { verifyReferralFromIdentities } from "@/lib/server/referral-verification"
import { markAnimatedOAuthAvatar } from "@/lib/server/oauth-avatar"
import { importOAuthAvatar } from "@/lib/server/profile-media-upload"
import { REFERRAL_COOKIE } from "@/lib/referral-code"
import { checkRateLimit, getClientIdentifierFromHeaders } from "@/lib/server/rate-limit"

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type")
  const authError = searchParams.get("error") || searchParams.get("error_code")
  const authErrorCode = searchParams.get("error_code")
  const next = sanitizeNextPath(searchParams.get("next"))

  const supabase = await createSupabaseServerClient()

  // Vincular um login social (linkIdentity a partir de /conta > Conexões) que já
  // pertence a OUTRO perfil: o GoTrue devolve `error_code=identity_already_exists`.
  // Sem este ramo cairia no bloco `authError` genérico abaixo e a pessoa seria
  // deslogada e jogada pro /login com "erro no login" — mensagem que não explica
  // nada. Aqui devolvemos pra própria tela de Conexões com um marcador para o
  // toast específico. Não expomos QUAL é o outro perfil (minimização de dados,
  // LGPD Art. 6º): a mensagem só diz que a conta social já está em uso.
  if (
    (authErrorCode === "identity_already_exists" || authError === "identity_already_exists") &&
    (next === "/conta" || next.startsWith("/conta"))
  ) {
    return NextResponse.redirect(`${origin}/conta?link_error=account_in_use#conexoes`)
  }

  // O GoTrue devolve o erro na própria query quando o link de e-mail já não
  // vale (`?error=access_denied&error_code=otp_expired`). Sem tratar isso a
  // requisição caía no `missing_code` lá embaixo e a pessoa via "não foi
  // possível concluir o login" — mensagem errada para um link de recuperação.
  if (authError) {
    console.error(
      "[auth/callback] provedor retornou erro",
      type,
      authError,
      searchParams.get("error_description")
    )
    return NextResponse.redirect(
      `${origin}/login?error=${type === "recovery" ? "recovery_error" : "oauth_error"}`
    )
  }

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
    if (type === "signup") {
      // O template de e-mail padrão do Supabase usa {{ .ConfirmationURL }},
      // que aponta pro /auth/v1/verify do próprio GoTrue — ele consome o
      // token e SÓ ENTÃO redireciona pra cá, sem repassar `code` nem
      // `token_hash` (não há PKCE nem sessão implícita nesse fluxo, já que a
      // conta nasce via admin.createUser). Ou seja: se chegamos aqui com
      // `type=signup` e sem erro na query, o GoTrue já confirmou o e-mail —
      // só falta mandar a pessoa logar.
      return NextResponse.redirect(`${origin}/login?confirmed=1`)
    }
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // Rate limit do resgate de `code`. Fica AQUI, e não no topo da função, de
  // propósito: os ramos acima (erro devolvido pelo provedor, `token_hash` de
  // recovery/signup) são tráfego legítimo de redirect e de scanner de e-mail
  // corporativo, e não podem consumir cota — quem varre o link de recuperação
  // de alguém trancaria o dono fora do próprio callback.
  //
  // O que se protege é o caminho caro: `exchangeCodeForSession` é uma ida à
  // rede do Supabase, e um resgate bem-sucedido ainda dispara upsert de
  // perfil, medalhas, indicação e `importOAuthAvatar` — que baixa um arquivo
  // de origem externa. Um `code` inválido já falha no exchange, então isto não
  // é autenticação: é a cota que faltava para essa superfície, que todas as
  // outras rotas sensíveis do projeto já têm.
  //
  // `onError: "open"`: ao contrário do login por senha, aqui negar em falha de
  // banco derrubaria um login que o provedor já autorizou, e o `code` é de uso
  // único — a pessoa não conseguiria repetir a tentativa. Deixar passar custa
  // uma requisição a mais; fechar custa a conta.
  const rateLimit = await checkRateLimit({
    action: "oauth_callback",
    identifier: getClientIdentifierFromHeaders(request.headers),
    maxAttempts: 20,
    windowSeconds: 300,
    onError: "open",
  })
  if (!rateLimit.allowed) {
    return NextResponse.redirect(`${origin}/login?error=too_many_attempts`)
  }

  // PKCE recovery: Supabase envia code + type=recovery (em vez de token_hash).
  // Aqui, ao contrário do ramo `token_hash`, NÃO adianta adiar o consumo até
  // um clique: quem queima o token de uso único é o `/auth/v1/verify` do
  // próprio Supabase (o endereço que está no e-mail), antes de qualquer
  // requisição chegar neste callback. Se um scanner abriu o link, o `code`
  // foi emitido pra ele e o clique da pessoa já chega aqui como
  // `?error=otp_expired` — tratado no topo. Então trocamos na hora: adiar só
  // alargaria a janela em que o `code` pode expirar.
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) {
    if (type === "recovery") {
      // Reabrir o mesmo link (ou o duplo clique) cai aqui com o code já
      // consumido; se a primeira abertura criou a sessão, segue pro reset.
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (user) {
        return NextResponse.redirect(`${origin}/reset-password`)
      }
      console.error("[auth/callback] exchangeCodeForSession (recovery) falhou", error.status, error.code, error.message)
      return NextResponse.redirect(`${origin}/login?error=recovery_error`)
    }
    return NextResponse.redirect(`${origin}/login?error=oauth_error`)
  }

  if (type === "recovery") {
    return NextResponse.redirect(`${origin}/reset-password`)
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

    // E-mail não verificado no provedor social.
    //
    // O Discord permite usar a conta com o e-mail ainda não verificado, e o
    // `email` que ele devolve entra no `auth.users` como qualquer outro. Hoje
    // isto NÃO é explorável: a vinculação automática por e-mail está
    // desligada no Supabase — é o que o ramo `identity_already_exists` lá em
    // cima demonstra, já que o GoTrue recusa o merge em vez de fundir as
    // contas. O risco é o dia em que alguém ligar essa opção no painel: a
    // partir daí, cadastrar no Discord um e-mail alheio e entrar por ele
    // fundiria a sessão com a conta de senha já existente daquele e-mail,
    // sem nunca provar posse da caixa postal.
    //
    // A checagem fica aqui, no código, porque a proteção não pode depender de
    // um checkbox do painel permanecer desmarcado — é exatamente o tipo de
    // configuração que se perde numa migração de projeto. Custo zero enquanto
    // o linking estiver off (o provedor manda `email_verified: true` no caso
    // normal); rede de segurança no dia em que não estiver.
    //
    // O Google usa `email_verified`; o Discord manda `verified`. Ausência do
    // campo não reprova: provedor que não informa o estado não é tratado como
    // reprovado, senão um provedor novo quebraria o login inteiro em silêncio.
    //
    // A identidade avaliada é a que ACABOU de autenticar, escolhida por
    // `last_sign_in_at` — não `identities[0]`. Numa conta com Google e
    // Discord vinculados a ordem do array não é garantida, então o índice
    // fixo leria o provedor errado: bastaria ter um Google verificado
    // vinculado para o Discord não verificado passar (ou o inverso barraria
    // um login legítimo). `app_metadata.provider` também não serve — é o
    // primeiro provedor usado no cadastro, não o desta sessão.
    const identities = authData.user.identities ?? []
    const currentIdentity = identities.reduce<(typeof identities)[number] | null>(
      (latest, identity) => {
        if (!identity.last_sign_in_at) return latest
        if (!latest?.last_sign_in_at) return identity
        return identity.last_sign_in_at > latest.last_sign_in_at ? identity : latest
      },
      null
    )

    const identityData = currentIdentity?.identity_data ?? {}
    const claimedEmail = authData.user.email
    const emailVerifiedClaim =
      identityData.email_verified ?? identityData.verified ?? undefined

    if (claimedEmail && emailVerifiedClaim === false) {
      console.error(
        "[auth/callback] provedor devolveu e-mail não verificado — login recusado.",
        currentIdentity?.provider
      )
      await supabase.auth.signOut()
      return NextResponse.redirect(`${origin}/login?error=email_not_verified`)
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

    // Avatar animado do provedor é marcado com `#animated` para que o gate de
    // mídia animada (VIP) o reconheça — a URL do Google não tem extensão, e
    // sem isso conta comum entrava com foto de perfil em GIF. Ver
    // `lib/server/oauth-avatar.ts`.
    const providerAvatarUrl = await markAnimatedOAuthAvatar(
      authData.user.user_metadata?.avatar_url ||
        authData.user.user_metadata?.picture ||
        null
    )

    // A URL do provedor é um empréstimo: o Discord deriva o caminho do hash
    // do avatar, então trocar a foto por lá apaga a URL antiga e o perfil
    // daqui fica sem imagem (aconteceu com um perfil VIP em 2026-09-10).
    // `importAvatar` copia o arquivo para o nosso bucket — só no primeiro
    // login (quem chama é o repositório, atrás da checagem de perfil novo) e
    // nunca re-sincronizado depois, para não sobrescrever a foto que a pessoa
    // tenha escolhido no editor daqui. Falha na cópia devolve `null` e o
    // avatar fica com a URL do provedor, como antes: login não trava por
    // causa de foto.
    const { isNew } = await upsertUserProfileFromAuth({
      id: authData.user.id,
      displayName: await resolveAvailableDisplayName(suggestedName, authData.user.id),
      avatarUrl: providerAvatarUrl,
      importAvatar: (sourceUrl) => importOAuthAvatar(authData.user.id, sourceUrl),
    })
    // Primeiro login OAuth = cadastro genuíno: concede a medalha de evento ativo.
    if (isNew) {
      await awardEligibleEventMedals(authData.user.id)

      // Cupom de indicação no cadastro social. Registrado AQUI, e não depois
      // do bloco de consentimento LGPD lá embaixo, de propósito: quem se
      // cadastra pelo Google/Discord sem consentimento é desviado para
      // /consentimento antes de chegar ao fim desta função. Se a indicação
      // dependesse daquele ponto, toda indicação por login social se perderia
      // silenciosamente — o cookie continua no navegador, mas ninguém mais
      // volta aqui com `isNew` verdadeiro.
      try {
        const referralCode = request.cookies.get(REFERRAL_COOKIE)?.value
        if (referralCode) {
          const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip") ??
            null
          await registerReferral({
            referredUserId: authData.user.id,
            code: referralCode,
            signupIp: ip,
          })
        }
      } catch (referralError) {
        console.error("[auth/callback] registro de indicação falhou:", referralError)
      }
    }

    // Login social é o momento em que as identidades OAuth ficam disponíveis:
    // tenta validar a indicação pendente por qualquer uma delas. Cobre também
    // quem já tinha a conta vinculada antes de ser indicado. Best-effort — o
    // módulo nunca lança, então não há risco de travar o login por isso.
    await verifyReferralFromIdentities(
      authData.user.id,
      // `identity.id` (o `sub` da conta no Google/Discord), NUNCA
      // `identity.identity_id`: este último é o uuid do VÍNCULO, gerado novo a
      // cada vinculação, então seria único por definição e o `unique` global
      // de `referral_verified_identities` nunca colidiria — o verificador
      // viraria enfeite e a mesma conta Google validaria infinitas indicações.
      (authData.user.identities ?? []).map((identity) => ({
        provider: identity.provider,
        id: identity.id,
      }))
    )

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
