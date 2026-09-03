import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getFollowedIdsAmong } from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

/**
 * GET /api/users/follows/among?ids=a,b,c — dentre os ids informados, quais o
 * visitante logado já segue. Extraído de `/api/users/directory` para que a
 * resposta do ranking (a parte pesada) fique 100% pública e cacheável no CDN:
 * só este pedacinho varia por usuário, e ele lê uma única linha indexada de
 * `user_follows`.
 *
 * Sem sessão devolve `{ followedIds: [] }` — o cliente já trata isso como
 * "ninguém seguido" e não mostra o estado ativo em nenhum botão.
 */
export async function GET(request: NextRequest) {
  const ids = (request.nextUrl.searchParams.get("ids") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200)

  if (ids.length === 0) {
    return NextResponse.json({
      ok: true,
      followedIds: [],
      authenticated: false,
    })
  }

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({
      ok: true,
      followedIds: [],
      authenticated: false,
    })
  }

  const followedIds = await getFollowedIdsAmong(user.id, ids)
  return NextResponse.json({ ok: true, followedIds, authenticated: true })
}
