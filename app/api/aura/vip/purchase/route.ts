import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { purchaseVipWithAura } from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** POST /api/aura/vip/purchase — compra 1 mês de VIP pagando com Aura (só se não tiver VIP ativo). */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const result = await purchaseVipWithAura(user.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  return NextResponse.json({ ok: true, expiresAt: result.expiresAt })
}
