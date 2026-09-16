import { NextRequest, NextResponse } from "next/server"

import { sanitizeNextPath } from "@/lib/auth-mfa"
import { isDiscordMembershipEnabled, type DiscordMembershipStatus } from "@/lib/discord-membership"
import { getDiscordGuildId, isMemberOfGuild } from "@/lib/server/integrations/discord"
import { confirmDiscordMembership } from "@/lib/server/repositories/discord-membership-repository"
import { tryValidateReferral } from "@/lib/server/referral-verification"
import { exchangeScopedOAuthCode } from "@/lib/server/scoped-oauth-exchange"

/**
 * Callback dedicado do fluxo "Conectar Discord" (conquista "No Discord"),
 * separado de app/auth/callback/route.ts (login/cadastro) porque aqui o OAuth
 * pede um scope extra (`guilds`) usado só para conferir a participação no
 * servidor, e não deve se misturar com a lógica de criar perfil/sessão do
 * login normal. Mesma separação de app/auth/youtube/callback/route.ts.
 *
 * Este fluxo nunca troca a conta logada. O botão vincula o Discord à conta
 * atual (`linkIdentity`) ou reautentica com o Discord já vinculado (ver
 * lib/client/start-scoped-oauth.ts), e `exchangeScopedOAuthCode` confere que o
 * OAuth voltou com a mesma conta antes de creditar qualquer coisa.
 *
 * `provider_token` (access token do Discord) só é lido aqui, na própria
 * requisição, e nunca persistido.
 *
 * Efeito colateral desejado: como o fluxo é `linkIdentity` (ver
 * lib/client/start-scoped-oauth.ts), ao final o Discord também fica VINCULADO à
 * conta (aparece em /conta > Contas vinculadas) — "confirmar que está no
 * servidor" e "conectar o Discord à conta" são a mesma ação, num clique só.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = sanitizeNextPath(searchParams.get("next"), "/aura")

  const redirectWith = (status: DiscordMembershipStatus) =>
    NextResponse.redirect(`${origin}${next}?discord=${status}`)

  // Erro devolvido na própria query, pelo Discord ou pelo GoTrue.
  // `identity_already_exists`: o `linkIdentity` recusou porque esse Discord
  // já é identidade de outro perfil. O resto era engolido sem log, e a
  // pessoa só via "tente novamente".
  //
  // `access_denied` sozinho não quer dizer "cancelou": o GoTrue usa o mesmo
  // `error` para conta banida, cadastro desligado e e-mail não verificado no
  // Discord, sempre com `error_code`. Só o cancelamento na tela do Discord
  // chega sem `error_code`.
  const oauthError = searchParams.get("error")
  const oauthErrorCode = searchParams.get("error_code")
  if (oauthError || oauthErrorCode) {
    if (oauthErrorCode === "identity_already_exists" || oauthError === "identity_already_exists") {
      return redirectWith("account_in_use")
    }
    if (oauthErrorCode === "provider_email_needs_verification") {
      return redirectWith("email_not_verified")
    }
    if (oauthError === "access_denied" && !oauthErrorCode) {
      return redirectWith("canceled")
    }
    console.error(
      "[auth/discord/callback] provedor retornou erro",
      oauthError,
      oauthErrorCode,
      searchParams.get("error_description")
    )
    return redirectWith("error")
  }

  if (!isDiscordMembershipEnabled()) {
    return redirectWith("error")
  }

  const guildId = getDiscordGuildId()
  if (!guildId) {
    console.error("[auth/discord/callback] DISCORD_GUILD_ID não definida.")
    return redirectWith("error")
  }

  if (!code) {
    return redirectWith("error")
  }

  const exchange = await exchangeScopedOAuthCode({
    code,
    provider: "discord",
    requestHeaders: request.headers,
  })
  if (!exchange.ok) {
    return redirectWith(exchange.reason)
  }

  if (!exchange.providerToken) {
    // O Discord não devolveu o access token (conta que já tinha consentido
    // antes sem o prompt forçar re-consentimento). O botão manda
    // `prompt=consent` justamente pra evitar.
    return redirectWith("no_token")
  }

  // O snowflake da conta Discord é o que impede duas contas do site de
  // resgatarem os 50 de Aura com a MESMA conta do Discord (unique na tabela).
  if (!exchange.providerAccountId) {
    console.error("[auth/discord/callback] conta sem identidade Discord após o exchange.")
    return redirectWith("error")
  }

  try {
    const isMember = await isMemberOfGuild({ accessToken: exchange.providerToken, guildId })

    if (!isMember) {
      return redirectWith("not_member")
    }

    const result = await confirmDiscordMembership(exchange.userId, exchange.providerAccountId)

    if (result === "account_in_use") {
      return redirectWith("account_in_use")
    }
    if (result === "error") {
      return redirectWith("error")
    }
    // Ser membro confirmado do servidor é o verificador mais forte do
    // Programa de Indicação: `user_discord_membership` já tem
    // `unique (discord_user_id)`, então a mesma conta do Discord nunca valida
    // duas indicações. Vale tanto para `granted` quanto para `already`: o
    // que importa é a pessoa ser membro, não ter ganhado a conquista agora
    // (quem entrou no servidor antes de ser indicado também merece validar).
    await tryValidateReferral(exchange.userId, "discord_member")

    // `granted` e `already` são ambos sucesso do ponto de vista da pessoa: ela
    // é membro e tem a conquista. Só o `granted` credita (e anima o saldo).
    return redirectWith(result === "granted" ? "confirmed" : "already")
  } catch (error) {
    console.error("[auth/discord/callback] falha ao verificar participação no servidor:", error)
    return redirectWith("error")
  }
}
