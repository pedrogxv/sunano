import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  getEquippedAvatarFrameId,
  getUserAuraItemIds,
  listActiveAuraItems,
} from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** GET /api/aura/items — catálogo de itens da loja de Aura + posse/equipamento do usuário logado. */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const [items, ownedIds, equippedId] = await Promise.all([
    listActiveAuraItems(),
    getUserAuraItemIds(user.id),
    getEquippedAvatarFrameId(user.id),
  ])

  return NextResponse.json({
    items,
    ownedItemIds: [...ownedIds],
    equippedItemId: equippedId,
  })
}
