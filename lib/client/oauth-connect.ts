"use client"

import type { Provider } from "@supabase/supabase-js"

import { supabaseAuth } from "@/lib/client/supabase-auth"

/**
 * Conectar um provedor social À CONTA ATUAL — nunca logar com ele.
 *
 * POR QUE ESTE MÓDULO EXISTE
 * --------------------------
 * `signInWithOAuth` e `linkIdentity` parecem intercambiáveis do lado do
 * botão (os dois redirecionam pro Google/Discord e voltam no callback), mas
 * batem em endpoints DIFERENTES do GoTrue e fazem coisas opostas:
 *
 *   • `signInWithOAuth`  → `/authorize`
 *     É LOGIN. O GoTrue procura uma identidade daquele provedor com aquele
 *     `sub`. Se NÃO existir, ele **cria um usuário novo** e troca a sessão
 *     pra ele — mesmo que houvesse uma sessão logada no navegador. A sessão
 *     antiga é simplesmente substituída, sem erro e sem aviso.
 *
 *   • `linkIdentity`     → `/user/identities/authorize`
 *     É VINCULAÇÃO. Exige a sessão atual (manda o access token no header) e
 *     anexa a identidade AO USUÁRIO LOGADO. Nunca cria conta. Se a identidade
 *     já pertence a alguém, falha com `identity_already_exists`.
 *
 * Os botões de missão ("Confirmar inscrição" do YouTube, "Conectar Discord")
 * usavam `signInWithOAuth`. Resultado: quem se cadastrou por e-mail/senha e
 * clicava pra conectar o Google ganhava um PERFIL NOVO em vez de vincular —
 * o Aura, as conquistas e os pedidos ficavam na conta antiga, e a pessoa era
 * jogada numa conta zerada. Não era corrida nem caso de borda: acontecia
 * *sempre* que a identidade ainda não estivesse vinculada, que é exatamente
 * a situação de quem está tentando vincular.
 *
 * O CASO `identity_already_exists`
 * --------------------------------
 * O GoTrue recusa o link quando a identidade já existe — inclusive quando ela
 * já é do PRÓPRIO usuário logado. Esse é o caminho normal de quem já conectou
 * o Discord antes e só está re-confirmando a missão (os callbacks precisam de
 * um `provider_token` fresco a cada vez, já que ele nunca é persistido).
 *
 * Por isso o fallback: se a identidade já está entre as do usuário atual,
 * é seguro seguir por `signInWithOAuth` — o GoTrue vai encontrar a identidade
 * existente e devolver a sessão do MESMO usuário, sem criar nada. Se ela NÃO
 * está, a conta pertence a outra pessoa e o fluxo para aqui com
 * `account_in_use`: é justamente o caso em que `signInWithOAuth` trocaria a
 * sessão pela conta alheia.
 */

export type ConnectProviderResult =
  | { ok: true }
  /** A conta social pertence a OUTRO perfil do site. Nada foi alterado. */
  | { ok: false; reason: "account_in_use" }
  /** Não há sessão: conectar exige estar logado. */
  | { ok: false; reason: "not_signed_in" }
  | { ok: false; reason: "error"; message: string }

interface ConnectProviderOptions {
  provider: Extract<Provider, "google" | "discord">
  /** URL absoluta de retorno (o callback dedicado da missão). */
  redirectTo: string
  /** Scopes extras da missão (`guilds`, `youtube.readonly`). */
  scopes?: string
  queryParams?: Record<string, string>
}

/**
 * Em caso de sucesso o navegador é redirecionado e esta promise nunca resolve
 * de forma observável — todo retorno aqui é um caminho de falha ou o
 * redirecionamento já disparado.
 */
export async function connectProvider({
  provider,
  redirectTo,
  scopes,
  queryParams,
}: ConnectProviderOptions): Promise<ConnectProviderResult> {
  // Exigir sessão ANTES de qualquer redirect: sem isto, um clique feito com a
  // sessão expirada cairia no fallback e viraria cadastro novo de novo.
  const { data: userData, error: userError } = await supabaseAuth.auth.getUser()
  if (userError || !userData.user) {
    return { ok: false, reason: "not_signed_in" }
  }

  const { error } = await supabaseAuth.auth.linkIdentity({
    provider,
    options: { redirectTo, scopes, queryParams },
  })
  if (!error) return { ok: true }

  const alreadyExists =
    error.code === "identity_already_exists" ||
    /identity.*already.*(exist|linked)/i.test(error.message)

  if (!alreadyExists) {
    return { ok: false, reason: "error", message: error.message }
  }

  // Já vinculada — mas a QUEM? Só seguimos se for do próprio usuário.
  // `getUserIdentities` lê da sessão atual, então não há como confundir.
  const { data: identityData } = await supabaseAuth.auth.getUserIdentities()
  const isOwnIdentity = (identityData?.identities ?? []).some((i) => i.provider === provider)

  if (!isOwnIdentity) {
    return { ok: false, reason: "account_in_use" }
  }

  // Re-autorização do provedor para obter um `provider_token` novo. Seguro:
  // a identidade existe e é desta conta, então o GoTrue devolve a sessão do
  // mesmo usuário em vez de criar outra.
  const { error: signInError } = await supabaseAuth.auth.signInWithOAuth({
    provider,
    options: { redirectTo, scopes, queryParams },
  })
  if (signInError) {
    return { ok: false, reason: "error", message: signInError.message }
  }
  return { ok: true }
}
