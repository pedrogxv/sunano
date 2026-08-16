import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { listAllPayoutRequests, type PayoutStatus } from "@/lib/server/repositories/affiliates-repository"

const VALID_STATUSES: PayoutStatus[] = ["requested", "paid", "rejected", "cancelled"]

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "affiliates_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const statusParam = searchParams.get("status")
  const status = VALID_STATUSES.includes(statusParam as PayoutStatus) ? (statusParam as PayoutStatus) : undefined
  const page = Number(searchParams.get("page")) || 1
  const pageSize = Number(searchParams.get("pageSize")) || 20

  const result = await listAllPayoutRequests(status, page, pageSize)
  return NextResponse.json(result)
}
