import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getPeripheralReviewById } from "@/lib/server/repositories/peripheral-reviews-repository"

/**
 * Busca uma review pontual pelo id — usado pra abrir a lista já em destaque
 * numa review específica (link do perfil, "Copiar link"), sem depender da
 * paginação. Só devolve se a review for DESTE periférico: mesma resposta (404)
 * para "não existe" e "é de outro produto".
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string; reviewId: string }> }) {
  const { id, reviewId } = await context.params

  const viewer = await getRequestUser(request)
  const review = await getPeripheralReviewById(reviewId, viewer?.id, id)
  if (!review) {
    return NextResponse.json({ error: "Review não encontrada." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, review })
}
