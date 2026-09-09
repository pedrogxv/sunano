import { NextRequest, NextResponse } from "next/server"

import { sanitizeNextPath } from "@/lib/auth-mfa"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { getDiscordGuildId, isMemberOfGuild } from "@/lib/server/integrations/discord"
import { confirmDiscordMembership } from "@/lib/server/repositories/discord-membership-repository"
import { tryValidateReferral } from "@/lib/server/referral-verification"
import { isDiscordMembershipEnabled } from "@/lib/discord-membership"

/**
 * Callback dedicado do fluxo "Estou no Discord" — separado de
 * app/auth/callback/route.ts (login/cadastro) porque aqui o OAuth pede um
 * scope extra (`guilds`) usado só para conferir a participação no servidor, e
 * não deve se misturar com a lógica de criar perfil/sessão do login normal.
 * Mesma separação de app/auth/youtube/callback/route.ts.
 *
 * `session.provider_token` (access token do Discord) só é lido aqui, na
 * própria requisição — nunca persistido.
 *
 * Efeito colateral desejado: como o fluxo é `linkIdentity`/`signInWithOAuth`
 * com o provider Discord, ao final o Discord também fica VINCULADO à conta
 * (aparece em /conta > Contas vinculadas) — "confirmar que está no servidor"
 * e "conectar o Discord à conta" são a mesma ação, num clique só.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = sanitizeNextPath(searchParams.get("next"), "/aura")

  // O Discord devolve o erro na própria query quando a pessoa clica em
  // "Cancelar" na tela de consentimento — sem tratar, cairia no `missing
  // code` abaixo e viraria "erro" genérico.
  const oauthError = searchParams.get("error")
  if (oauthError) {
    return NextResponse.redirect(
      `${origin}${next}?discord=${oauthError === "access_denied" ? "canceled" : "error"}`
    )
  }

  if (!isDiscordMembershipEnabled()) {
    return NextResponse.redirect(`${origin}${next}?discord=error`)
  }

  const guildId = getDiscordGuildId()
  if (!guildId) {
    console.error("[auth/discord/callback] DISCORD_GUILD_ID não definida.")
    return NextResponse.redirect(`${origin}${next}?discord=error`)
  }

  if (!code) {
    return NextResponse.redirect(`${origin}${next}?discord=error`)
  }

  const supabase = await createSupabaseServerClient()
  const { data: sessionData, error: exchangeError } = await supabase.auth.exchangeCodeForSession(code)

  if (exchangeError || !sessionData.session || !sessionData.user) {
    return NextResponse.redirect(`${origin}${next}?discord=error`)
  }

  const providerToken = sessionData.session.provider_token
  if (!providerToken) {
    // O Discord não devolveu o access token (acontece quando a conta já tinha
    // consentido antes e o prompt não forçou re-consentimento) — pede pra
    // tentar de novo. O botão manda `prompt=consent` justamente pra evitar.
    return NextResponse.redirect(`${origin}${next}?discord=no_token`)
  }

  // O snowflake da conta Discord vem da identidade que o Supabase acabou de
  // gravar no exchange — é ele que impede duas contas do site de resgatarem
  // os 50 de Aura com a MESMA conta do Discord (unique na tabela).
  const discordIdentity = sessionData.user.identities?.find((identity) => identity.provider === "discord")
  const discordUserId = discordIdentity?.id ?? null

  if (!discordUserId) {
    console.error("[auth/discord/callback] sessão sem identidade Discord após o exchange.")
    return NextResponse.redirect(`${origin}${next}?discord=error`)
  }

  try {
    const isMember = await isMemberOfGuild({ accessToken: providerToken, guildId })

    if (!isMember) {
      return NextResponse.redirect(`${origin}${next}?discord=not_member`)
    }

    const result = await confirmDiscordMembership(sessionData.user.id, discordUserId)

    if (result === "account_in_use") {
      return NextResponse.redirect(`${origin}${next}?discord=account_in_use`)
    }
    if (result === "error") {
      return NextResponse.redirect(`${origin}${next}?discord=error`)
    }
    // Ser membro confirmado do servidor é o verificador mais forte do
    // Programa de Indicação: `user_discord_membership` já tem
    // `unique (discord_user_id)`, então a mesma conta do Discord nunca valida
    // duas indicações. Vale tanto para `granted` quanto para `already` — o
    // que importa é a pessoa ser membro, não ter ganhado a conquista agora
    // (quem entrou no servidor antes de ser indicado também merece validar).
    await tryValidateReferral(sessionData.user.id, "discord_member")

    // `granted` e `already` são ambos sucesso do ponto de vista da pessoa: ela
    // é membro e tem a conquista. Só o `granted` credita (e anima o saldo).
    return NextResponse.redirect(`${origin}${next}?discord=${result === "granted" ? "confirmed" : "already"}`)
  } catch (error) {
    console.error("[auth/discord/callback] falha ao verificar participação no servidor:", error)
    return NextResponse.redirect(`${origin}${next}?discord=error`)
  }
}
