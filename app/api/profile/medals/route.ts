import { NextResponse } from "next/server"

import { getMedalLimit } from "@/lib/account-tier"
import {
  getAccountTier,
  getUserMedals,
} from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"

export const dynamic = "force-dynamic"

/**
 * GET /api/profile/medals — todas as medalhas conquistadas pelo usuário.
 *
 * Diferente de `/api/profile/showcase`, que já devolve a lista cortada pelo
 * limite do tier: aqui o dono precisa ver o conjunto completo para escolher
 * quais destacar.
 */
export async function GET() {
  try {
    const supabase = await createSupabaseServerClient()
    const { data: authData } = await supabase.auth.getUser()

    if (!authData.user) {
      return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
    }

    const [medals, tier] = await Promise.all([
      getUserMedals(authData.user.id),
      getAccountTier(authData.user.id),
    ])

    return NextResponse.json({
      ok: true,
      medals,
      tier,
      limit: getMedalLimit(tier),
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar medalhas." }, { status: 500 })
  }
}
