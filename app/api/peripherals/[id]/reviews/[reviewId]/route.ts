import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getPeripheralReviewById } from "@/lib/server/repositories/peripheral-reviews-repository"

/** Busca uma review pontual pelo id — usado pra abrir a página do periférico já em destaque numa review específica, sem depender da paginação (ordenada por Aura do autor). */
export async function GET(request: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await context.params

  const viewer = await getRequestUser(request)
  const review = await getPeripheralReviewById(reviewId, viewer?.id)
  if (!review) {
    return NextResponse.json({ error: "Review não encontrada." }, { status: 404 })
  }

  return NextResponse.json({ ok: true, review })
}
