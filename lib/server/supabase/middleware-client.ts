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
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
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

      const hasVerifiedFactor = (data.user!.factors ?? []).some((factor) => factor.status === "verified")
      const nextLevel = hasVerifiedFactor ? "aal2" : currentLevel

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
  if (data.user) {
    // Mesma query que já buscava lgpd_consent_at — ban geral entra de graça
    // no round-trip existente (ver account-ban-repository.ts para o resto do
    // enforcement: aqui só precisamos saber se expulsa a sessão ou não).
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("lgpd_consent_at, account_banned_at")
      .eq("id", data.user.id)
      .maybeSingle()

    isAccountBanned = Boolean(userProfile?.account_banned_at)
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
    needsLgpdConsent,
    isAccountBanned,
  }
}