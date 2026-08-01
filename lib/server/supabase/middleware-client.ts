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

  // Nível de garantia da sessão (1 fator vs. 2FA concluído). É computado a
  // partir do JWT já validado por `getUser` + dos fatores embutidos na sessão,
  // sem chamada de rede adicional.
  let aal: AssuranceLevel = { current: null, next: null }
  if (data.user) {
    const { data: aalData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    aal = { current: aalData?.currentLevel ?? null, next: aalData?.nextLevel ?? null }
  }

  const { data: profile } =
    data.user && needProfile
      ? await supabase
          .from("admin_profiles")
          .select("id, email, display_name, avatar_url, role, permissions")
          .eq("id", data.user.id)
          .maybeSingle()
      : { data: null }

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
  if (data.user) {
    const { data: userProfile } = await supabase
      .from("user_profiles")
      .select("lgpd_consent_at")
      .eq("id", data.user.id)
      .maybeSingle()
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
  }
}