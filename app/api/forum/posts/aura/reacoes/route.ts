import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { listUserPostAuraReactions } from "@/lib/server/repositories/aura-repository"

export const dynamic = "force-dynamic"

/** Teto de ids por chamada — uma página da listagem é 20; a folga cobre o
 *  scroll infinito acumulando páginas antes do provider consolidar. */
const MAX_IDS = 200

const bodySchema = z.object({
  postIds: z.array(z.string().uuid()).max(MAX_IDS),
})

/**
 * Quais dos posts informados o usuário atual já deu aura — hidrata todos os
 * botões de aura da página de uma vez, no lugar de um `GET .../[slug]/aura`
 * por card (ver `AuraReactionsProvider`).
 *
 * É POST por causa do tamanho da lista de ids, não por escrever nada: a
 * rota é somente leitura e não altera estado.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, postIds: [] })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
  }

  const postIds = await listUserPostAuraReactions(user.id, parsed.data.postIds)
  return NextResponse.json({ ok: true, postIds })
}
