import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { listSavedPostIdsForUser } from "@/lib/server/repositories/forum-saved-posts-repository"

export const dynamic = "force-dynamic"

/**
 * Ids de todos os posts que o usuário atual salvou — carregado uma vez por
 * sessão pelo `SavedPostsProvider` para hidratar todo botão "salvar" da
 * página de uma vez, sem cada `PostCard` perguntar individualmente.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, ids: [] })
  }

  const ids = await listSavedPostIdsForUser(user.id)
  return NextResponse.json({ ok: true, ids })
}
