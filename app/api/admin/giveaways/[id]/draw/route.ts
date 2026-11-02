import { NextRequest, NextResponse } from "next/server"

import { dbErrorResponse } from "@/lib/db-errors"
import { requireWebMaster } from "@/lib/server/auth/admin-auth"
import { drawGiveaway } from "@/lib/server/repositories/giveaways-repository"
import { broadcastSystemNotification } from "@/lib/server/repositories/notifications-repository"

import { UUID_RE } from "../../schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Sorteia o ganhador. A escolha acontece no banco (`draw_giveaway`, gerador
 * forte do Postgres, linha travada) e é definitiva: chamar de novo devolve 409,
 * nunca um segundo ganhador.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireWebMaster()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Sorteio inválido." }, { status: 400 })

  try {
    const result = await drawGiveaway(id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

    // Aviso no sino de quem ganhou. Best-effort: o sorteio já está gravado, e
    // uma falha aqui não pode virar "erro ao sortear" na tela do painel.
    await broadcastSystemNotification({
      title: "Você ganhou um sorteio! 🎉",
      body: `Seu nome saiu em "${result.title.slice(0, 60)}". A equipe vai falar com você para a entrega`,
      link: "/",
      userId: result.winnerUserId,
    }).catch((error) => console.error("[api/admin/giveaways/draw] aviso ao ganhador falhou:", error))

    return NextResponse.json({ ok: true, winnerName: result.winnerName })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao sortear.")
    return NextResponse.json(body, { status })
  }
}
