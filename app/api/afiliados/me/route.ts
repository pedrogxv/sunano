import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getAffiliateByUserId, getAffiliateSummary } from "@/lib/server/repositories/affiliates-repository"

export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ affiliate: null })

  const affiliate = await getAffiliateByUserId(user.id)
  if (!affiliate) return NextResponse.json({ affiliate: null })

  const summary = affiliate.status === "approved" ? await getAffiliateSummary(affiliate.id) : null

  return NextResponse.json({ affiliate, summary })
}
