import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getAffiliateByUserId, getAffiliateSummary } from "@/lib/server/repositories/affiliates-repository"
import {
  AFFILIATES_MAINTENANCE_MESSAGE,
  isAffiliatesBlockedByMaintenance,
} from "@/lib/server/auth/affiliate-access"

export async function GET(request: NextRequest) {
  // Segunda checagem da mesma regra que o proxy já aplica (proxy.ts) — fechado
  // por padrão, caso o matcher/lógica do proxy mude e esta rota deixe de passar
  // por lá. WEB MASTER ignora a manutenção, igual na Loja.
  if (await isAffiliatesBlockedByMaintenance()) {
    return NextResponse.json({ error: AFFILIATES_MAINTENANCE_MESSAGE }, { status: 503 })
  }

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ affiliate: null })

  const affiliate = await getAffiliateByUserId(user.id)
  if (!affiliate) return NextResponse.json({ affiliate: null })

  const summary = affiliate.status === "approved" ? await getAffiliateSummary(affiliate.id) : null

  return NextResponse.json({ affiliate, summary })
}
