import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { searchOrderCustomers } from "@/lib/server/repositories/orders-repository"

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get("q") ?? ""

  const customers = await searchOrderCustomers(q)
  return NextResponse.json({ ok: true, customers })
}
