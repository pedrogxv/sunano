import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getUserAuraGiven } from "@/lib/server/repositories/aura-repository"

export const dynamic = "force-dynamic"

/**
 * Retorna quais dos comentários informados (`?commentIds=a,b`) o usuário
 * autenticado já curtiu/descurtiu — usado para hidratar o estado inicial do
 * `AuraButton` na página de post. Post não tem reação (a aura de postar é
 * creditada na criação), então só comentário aparece aqui.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, comments: { liked: [], disliked: [] } })
  }

  const { searchParams } = new URL(request.url)
  const commentIds = (searchParams.get("commentIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean)

  const { comments } = await getUserAuraGiven(user.id, { commentIds })
  return NextResponse.json({
    ok: true,
    comments: { liked: [...comments.liked], disliked: [...comments.disliked] },
  })
}
