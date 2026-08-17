import { NextRequest, NextResponse } from "next/server"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { getPriceHistory } from "@/lib/server/repositories/store-repository"

export async function GET(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "store_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await context.params
  const history = await getPriceHistory(id)

  return NextResponse.json({ history })
}
