import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  getReferralStats,
  listMyReferrals,
} from "@/lib/server/repositories/referrals-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export const dynamic = "force-dynamic"

/** GET /api/indicacoes/me — resumo + lista para o painel. */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Sessão expirada. Entre novamente." }, { status: 401 })
  }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle()

  const [stats, referrals] = await Promise.all([
    getReferralStats(user.id, profile?.display_name ?? null),
    listMyReferrals(user.id),
  ])

  return NextResponse.json({ stats, referrals })
}
