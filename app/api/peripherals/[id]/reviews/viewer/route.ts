import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getPeripheralReviewViewerState } from "@/lib/server/repositories/peripheral-reviews-repository"

/** Ids por chamada: a página manda os da primeira página do HTML (no máximo algumas dezenas). */
const MAX_IDS = 60

/**
 * Estado do visitante logado na página de reviews (`?ids=a,b,c`): os votos
 * dele nas reviews do HTML, a review dele neste periférico e se já aceitou o
 * termo de integridade.
 *
 * Existe porque a página é ISR: o HTML é o mesmo para todo mundo e não pode
 * levar nada da sessão. Anônimo recebe `authenticated: false` com 200 (não
 * 401): não estar logado é o caso comum desta tela, não um erro.
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params

  try {
    const viewer = await getRequestUser(request)
    if (!viewer) {
      return NextResponse.json(
        { ok: true, authenticated: false },
        { headers: { "Cache-Control": "private, no-store" } }
      )
    }

    // A validação de formato (uuid) mora no repositório, que é quem monta o filtro.
    const ids = (request.nextUrl.searchParams.get("ids") ?? "").split(",").slice(0, MAX_IDS)
    const state = await getPeripheralReviewViewerState(id, viewer.id, ids)

    return NextResponse.json(
      { ok: true, authenticated: true, viewerId: viewer.id, ...state },
      { headers: { "Cache-Control": "private, no-store" } }
    )
  } catch {
    return NextResponse.json({ error: "Erro ao carregar seus dados." }, { status: 500 })
  }
}
