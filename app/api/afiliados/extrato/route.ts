import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getAffiliateByUserId, listAffiliateCommissionEvents } from "@/lib/server/repositories/affiliates-repository"

export async function GET(request: NextRequest) {
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
