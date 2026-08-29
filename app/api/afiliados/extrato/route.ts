import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getAffiliateByUserId, listAffiliateCommissionEvents } from "@/lib/server/repositories/affiliates-repository"
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
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 })

  const affiliate = await getAffiliateByUserId(user.id)
  if (!affiliate || affiliate.status !== "approved") {
    return NextResponse.json({ error: "Você não é um afiliado aprovado." }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const page = Number(searchParams.get("page")) || 1
  const pageSize = Number(searchParams.get("pageSize")) || 20

  const result = await listAffiliateCommissionEvents(affiliate.id, page, pageSize)
  return NextResponse.json(result)
}
