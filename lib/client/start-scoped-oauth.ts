import { IMPERSONATION_READ_ONLY_MESSAGE, isImpersonationActive } from "@/lib/client/impersonation"
import { supabaseAuth } from "@/lib/client/supabase-auth"

/**
 * OAuth com escopo extra usado pelas conquistas "No Discord" e "Inscrito"
 * (YouTube). Diferente do login, aqui a pessoa JÁ está logada e o objetivo é
 * ler um dado da conta social dela, nunca trocar de conta.
 *
 * Por isso a escolha do método importa:
 *
 * - Provedor ainda não vinculado: `linkIdentity`. O GoTrue grava a identidade
 *   na conta logada. Se essa conta social já pertence a outro perfil, ele
 *   recusa com `identity_already_exists` em vez de criar ou trocar de conta.
 * - Provedor já vinculado: `signInWithOAuth`. `linkIdentity` recusaria
 *   ("already linked") sem devolver o token. Aqui a identidade já é desta
 *   conta, então o GoTrue volta para ela, e o callback ainda confere isso (a
 *   pessoa pode autorizar outra conta na tela do provedor).
 *
 * Usar só `signInWithOAuth`, como era antes, criava uma conta nova sempre que
 * o Discord escolhido não tinha conta no site, e a sessão do navegador passava
 * para ela. A guarda do lado do servidor fica em
 * lib/server/scoped-oauth-exchange.ts.
 */
export type ScopedOAuthRequest = {
  provider: "discord" | "google"
  callbackPath: string
  scopes: string
  queryParams: Record<string, string>
}

// `prompt: "consent"` força o provedor a sempre devolver o access token, mesmo
// que a conta já tenha autorizado o app antes só com os scopes do login. Sem
// isso o callback recebe `provider_token` nulo.
export const DISCORD_MEMBERSHIP_OAUTH: ScopedOAuthRequest = {
  provider: "discord",
  callbackPath: "/auth/discord/callback",
  scopes: "identify guilds",
  queryParams: { prompt: "consent" },
}

export const YOUTUBE_SUBSCRIPTION_OAUTH: ScopedOAuthRequest = {
  provider: "google",
  callbackPath: "/auth/youtube/callback",
  scopes: "https://www.googleapis.com/auth/youtube.readonly",
  queryParams: { access_type: "offline", prompt: "consent" },
}

/**
 * Redireciona para o provedor. Devolve `null` quando o redirect começou, ou a
 * mensagem de erro para mostrar quando não começou.
 *
 * `returnTo` é a página que recebe o `?discord=`/`?youtube=` de volta. Só
 * /aura e /conquistas mostram esse resultado, então quem chama de outro lugar
 * (popover da TopBar) passa "/aura".
 */
export async function startScopedOAuth(request: ScopedOAuthRequest, returnTo: string): Promise<string | null> {
  // Sessão de acesso (impersonation) é somente leitura. `linkIdentity` fala
  // direto com o Supabase, sem passar pelo proxy, então o bloqueio tem que ser
  // aqui; o callback recusa de novo no servidor.
  if (isImpersonationActive()) {
    return IMPERSONATION_READ_ONLY_MESSAGE
  }

  const { data, error: identitiesError } = await supabaseAuth.auth.getUserIdentities()
  if (identitiesError || !data) {
    return "Sua sessão expirou. Entre de novo e tente outra vez."
  }

  const alreadyLinked = data.identities.some((identity) => identity.provider === request.provider)
  const options = {
    redirectTo: `${window.location.origin}${request.callbackPath}?next=${encodeURIComponent(returnTo)}`,
    scopes: request.scopes,
    queryParams: request.queryParams,
  }

  const { error } = alreadyLinked
    ? await supabaseAuth.auth.signInWithOAuth({ provider: request.provider, options })
    : await supabaseAuth.auth.linkIdentity({ provider: request.provider, options })

  if (error) {
    console.error(
      `[startScopedOAuth:${request.provider}] ${alreadyLinked ? "signInWithOAuth" : "linkIdentity"} falhou:`,
      error.message
    )
    return "Não foi possível abrir a autorização. Tente novamente."
  }

  return null
}
