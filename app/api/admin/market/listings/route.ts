import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { listMarketListingsForModeration, type MarketListingStatus } from "@/lib/server/repositories/market-repository"

const VALID_STATUSES: MarketListingStatus[] = ["pending_review", "active", "rejected", "sold", "removed"]

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "market_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const url = new URL(request.url)
  const statusParam = url.searchParams.get("status") ?? "pending_review"
  const status = VALID_STATUSES.includes(statusParam as MarketListingStatus)
    ? (statusParam as MarketListingStatus)
    : "pending_review"
  const page = Number(url.searchParams.get("page")) || 1
  const pageSize = Number(url.searchParams.get("pageSize")) || 24

  const { listings, total, hasMore } = await listMarketListingsForModeration(status, page, pageSize)
  return NextResponse.json({ ok: true, listings, total, hasMore })
}
