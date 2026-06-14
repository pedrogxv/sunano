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

  return {
    response,
    user: data.user,
    profile: (profile as AdminProfile | null) ?? null,
    aal,
  }
}