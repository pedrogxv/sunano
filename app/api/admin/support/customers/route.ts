import { NextRequest, NextResponse } from "next/server"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { searchSupportCustomers } from "@/lib/server/repositories/support-repository"

export async function GET(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_read")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const url = new URL(request.url)
  const q = url.searchParams.get("q") ?? ""

  const customers = await searchSupportCustomers(q)
  return NextResponse.json({ ok: true, customers })
}
