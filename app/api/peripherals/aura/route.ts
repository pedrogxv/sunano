import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getUserPeripheralCommentAuraGiven } from "@/lib/server/repositories/aura-repository"

export const dynamic = "force-dynamic"

/**
 * Retorna quais dos comentários de periférico informados (`?commentIds=a,b`)
 * o usuário autenticado já curtiu/descurtiu — usado para hidratar o estado
 * inicial do `AuraButton` na página do periférico.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, comments: { liked: [], disliked: [] } })
  }

  const { searchParams } = new URL(request.url)
  const commentIds = (searchParams.get("commentIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean)

  const reactions = await getUserPeripheralCommentAuraGiven(user.id, commentIds)
  return NextResponse.json({
    ok: true,
    comments: { liked: [...reactions.liked], disliked: [...reactions.disliked] },
  })
}
