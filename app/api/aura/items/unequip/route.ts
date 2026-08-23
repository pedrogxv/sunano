import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { equipAvatarFrame } from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** POST /api/aura/items/unequip — remove a moldura de avatar atualmente equipada. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const result = await equipAvatarFrame(user.id, null)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
