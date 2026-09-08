import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  getEquippedMiniProfileBg,
  getUserAuraItemIds,
  listActiveAuraItems,
} from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/aura/mini-profile-bg — os Fundos de Mini Perfil que o usuário
 * possui, mais qual está equipado.
 *
 * Existe para o editor de perfil (`/perfil`), que é uma página client e por
 * isso não pode chamar o repositório direto (ver ARQUITETURA.md). Devolve só
 * a posse do próprio usuário — o catálogo completo com preço é assunto da
 * Central de Aura, não daqui.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const [items, ownedIds, equipped] = await Promise.all([
    listActiveAuraItems(),
    getUserAuraItemIds(user.id),
    getEquippedMiniProfileBg(user.id),
  ])

  const owned = items
    .filter((item) => item.kind === "mini_profile_bg" && ownedIds.has(item.id))
    .map((item) => ({ id: item.id, slug: item.slug, name: item.name }))

  return NextResponse.json({ owned, equippedItemId: equipped?.itemId ?? null })
}
