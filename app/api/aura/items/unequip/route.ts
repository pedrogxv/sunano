import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { setAvatarFrameOptOut } from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/aura/items/unequip — "não quero moldura nenhuma".
 *
 * Grava a ESCOLHA (`avatar_frame_opt_out`), e não só o slot vazio. Esvaziar o
 * slot sozinho não bastava: `resolveProfileFrame` cai no fallback de honraria
 * quando ele está `null`, então quem é Fundador (ou VIP, ou tem marco de
 * ofensiva) clicava em "Nenhuma", recebia `ok` e continuava com a moldura no
 * site inteiro — o botão parecia simplesmente não funcionar.
 *
 * `setAvatarFrameOptOut(true)` limpa o slot junto, então este endpoint
 * continua desequipando como antes; o que mudou é que agora a escolha PERSISTE
 * contra o fallback. Equipar qualquer moldura desliga o opt-out (ver
 * `equipAvatarFrame` e o trigger `trg_clear_frame_opt_out`).
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const result = await setAvatarFrameOptOut(user.id, true)

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
