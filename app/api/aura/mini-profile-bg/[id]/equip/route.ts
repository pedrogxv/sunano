import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { equipMiniProfileBg } from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/aura/mini-profile-bg/[id]/equip — equipa um Fundo de Mini Perfil
 * já possuído. Slot próprio, separado do de moldura de avatar
 * (/api/aura/items/[id]/equip): os dois podem estar equipados ao mesmo tempo.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const { id } = await params
  const result = await equipMiniProfileBg(user.id, id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
