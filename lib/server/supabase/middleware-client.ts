import { createServerClient } from "@supabase/ssr"
import type { NextRequest } from "next/server"
import { NextResponse } from "next/server"

import type { Database } from "@/lib/database.types"
import type { AdminProfile } from "@/lib/admin-permissions"
import type { AssuranceLevel } from "@/lib/auth-mfa"

type UpdateSessionOptions = {
  /**
   * Quando `false`, pula a consulta a `admin_profiles` (usada só nas rotas de
   * admin/manutenção). Evita uma query extra por requisição de usuário comum.
   */
  needProfile?: boolean
}

export async function updateSession(
  request: NextRequest,
  { needProfile = true }: UpdateSessionOptions = {}
) {
  const response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        // O segundo argumento (`headers`) NÃO é opcional na prática, apesar de
        // o tipo permitir ignorá-lo. Quando um refresh de token acontece, a
        // lib pede junto `Cache-Control: private, no-cache, no-store,
        // must-revalidate, max-age=0`, `Expires: 0` e `Pragma: no-cache` — e
        // esta resposta carrega `Set-Cookie` com a sessão de UM usuário.
        //
        // Sem repassar esses headers, a resposta fica cacheável: uma CDN ou
        // proxy reverso na frente (é o caso aqui — Vercel, com ISR pesado nas
        // páginas indexáveis) pode guardar o `Set-Cookie` e ENTREGAR A SESSÃO
        // DE UM USUÁRIO PARA OUTRO. A doc do Supabase trata esse cache
        // cruzado como o risco prático mais grave da auth por cookie, acima
        // do roubo de token por XSS — ver o comentário de `SetAllCookies` em
        // node_modules/@supabase/ssr/dist/main/types.d.ts.
        //
        // O refresh é o único momento em que `setAll` roda, então o custo de
        // cache é limitado a essas respostas: nada do que é servido
        // estaticamente hoje passa a ser no-store por causa disto.
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
          Object.entries(headers ?? {}).forEach(([key, value]) => {
            response.headers.set(key, value)
          })
        },
      },
    }
  )

  const { data } = await supabase.auth.getUser()

  // Nível de garantia da sessão (1 fator vs. 2FA concluído). Antes chamava
  // `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`, mas essa função
  // internamente refaz um `getUser()` contra a rede — round-trip duplicado
  // em toda requisição admin. O JWT já foi validado pela chamada acima, e
  // `getSession()` só lê do cookie (sem rede) — decodifica localmente o
  // claim `aal` e usa `data.user.factors`, que já veio populado.
  let aal: AssuranceLevel = { current: null, next: null }
  // Existe um fator TOTP verificado NA CONTA — independente do nível da
  // sessão atual. `aal` responde "esta sessão já fez o segundo fator?";
  // isto responde "esta conta tem segundo fator cadastrado?". São perguntas
  // diferentes: quem nunca cadastrou tem `next === "aal1"` e portanto
  // `isMfaStepUpRequired` é falso — ou seja, o gate de 2FA existente deixa
  // passar direto. É exatamente esse caso que a exigência de MFA para WEB
  // MASTER precisa enxergar (ver proxy.ts).
  let hasVerifiedMfaFactor = false
  const profilePromise =
    data.user && needProfile
      ? supabase
          .from("admin_profiles")
          .select("id, email, display_name, avatar_url, role, permissions")
          .eq("id", data.user.id)
          .maybeSingle()
      : Promise.resolve({ data: null })

  const [{ data: profile }] = await Promise.all([
    profilePromise,
    (async () => {
      if (!data.user) return

      // Calculado ANTES de qualquer early-return abaixo. Os `return` dali
      // tratam "não deu para descobrir o nível da sessão", que é diferente de
      // "a conta não tem fator" — e o gate de MFA obrigatório do WEB MASTER
      // lê este valor. Se ele ficasse preso depois de um early-return, uma
      // falha ao decodificar o JWT apareceria como "sem fator cadastrado" e
      // trancaria um webmaster que JÁ tem 2FA numa tela pedindo para ativá-lo.
      hasVerifiedMfaFactor = (data.user.factors ?? []).some(
        (factor) => factor.status === "verified"
      )

      const { data: sessionData } = await supabase.auth.getSession()
      const accessToken = sessionData.session?.access_token
      if (!accessToken) return

      let currentLevel: AssuranceLevel["current"] = null
      try {
        const payloadSegment = accessToken.split(".")[1]
        const payload = JSON.parse(Buffer.from(payloadSegment, "base64").toString("utf-8"))
        currentLevel = payload.aal ?? null
      } catch {
        return
      }

      const nextLevel = hasVerifiedMfaFactor ? "aal2" : currentLevel

      aal = { current: currentLevel, next: nextLevel }
    })(),
  ])

  // Consentimento LGPD: só se aplica a contas puramente públicas. A ideia
  // original era usar a ausência de `user_profiles` como sinal de "é só
  // admin" — mas as login actions (app/admin/actions.ts, app/login/actions.ts)
  // fazem upsert desse registro para QUALQUER login (admin também usa
  // fórum/perfil), então hoje todo mundo tem a linha e esse sinal sozinho não
  // basta. Sem a checagem de admin_profiles abaixo, um admin cujo
  // `lgpd_consent_at` nunca foi preenchido ficava trancado fora do próprio
  // painel ao navegar para o site público ("Ver Site" virava beco sem saída).
  // Usa o mesmo client autenticado da sessão (RLS: "auth.uid() = id" cobre a
  // leitura do próprio registro), sem precisar do client de service-role.
  let needsLgpdConsent = false
  let isAccountBanned = false
  let hasStoreAccess = false
  if (data.user) {
    // Mesma query que já buscava lgpd_consent_at — ban geral entra de graça
    // no round-trip existente (ver account-ban-repository.ts para o resto do
    // enforcement: aqui só precisamos saber se expulsa a sessão ou não).
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("lgpd_consent_at, account_banned_at, store_access")
      .eq("id", data.user.id)
      .maybeSingle()

    isAccountBanned = Boolean(userProfile?.account_banned_at)
    // Liberação individual da Loja/Afiliados: entra de carona nesta query, que
    // já roda para toda requisição autenticada — o proxy precisa do valor para
    // decidir a manutenção da Loja e não pode importar o helper `server-only`.
    hasStoreAccess = Boolean(userProfile?.store_access)
    if (isAccountBanned) {
      // Encerra a sessão já neste response — o cookie sai invalidado junto
      // com o redirect que proxy.ts monta a partir daqui.
      await supabase.auth.signOut()
    }

    const pendingConsent = userProfile !== null && !userProfile.lgpd_consent_at

    if (pendingConsent) {
      const isAdminAccount = needProfile
        ? profile !== null
        : Boolean(
            (
              await supabase
                .from("admin_profiles")
                .select("id")
                .eq("id", data.user.id)
                .maybeSingle()
            ).data
          )
      needsLgpdConsent = !isAdminAccount
    }
  }

  return {
    response,
    user: data.user,
    profile: (profile as AdminProfile | null) ?? null,
    aal,
    hasVerifiedMfaFactor,
    needsLgpdConsent,
    isAccountBanned,
    hasStoreAccess,
  }
}