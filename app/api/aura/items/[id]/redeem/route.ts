import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { redeemAuraItem } from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** POST /api/aura/items/[id]/redeem — resgata um item da loja pagando com Aura. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const { id } = await params
  const result = await redeemAuraItem(user.id, id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
