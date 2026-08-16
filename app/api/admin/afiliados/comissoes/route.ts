import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { listAllCommissionEvents, type CommissionEventType } from "@/lib/server/repositories/affiliates-repository"

const VALID_TYPES: CommissionEventType[] = ["credit", "refund_debit", "adjustment"]

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "affiliates_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const typeParam = searchParams.get("type")
  const type = VALID_TYPES.includes(typeParam as CommissionEventType) ? (typeParam as CommissionEventType) : undefined
  const affiliateId = searchParams.get("affiliateId") ?? undefined
  const page = Number(searchParams.get("page")) || 1
  const pageSize = Number(searchParams.get("pageSize")) || 20

  const result = await listAllCommissionEvents({ affiliateId, type, page, pageSize })
  return NextResponse.json(result)
}
