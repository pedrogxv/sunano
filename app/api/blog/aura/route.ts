import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getUserAuraGiven } from "@/lib/server/repositories/aura-repository"

export const dynamic = "force-dynamic"

/**
 * Retorna quais dos comentários de notícia informados (`?commentIds=a,b`) o
 * usuário autenticado já curtiu/descurtiu — usado para hidratar o estado
 * inicial do `AuraButton` na página de notícia. Espelha `/api/forum/aura`.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, comments: { liked: [], disliked: [] } })
  }

  const { searchParams } = new URL(request.url)
  const commentIds = (searchParams.get("commentIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean)

  const { blogComments } = await getUserAuraGiven(user.id, { blogCommentIds: commentIds })
  return NextResponse.json({
    ok: true,
    comments: { liked: [...blogComments.liked], disliked: [...blogComments.disliked] },
  })
}
