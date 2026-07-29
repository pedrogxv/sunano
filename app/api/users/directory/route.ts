import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { coerceDirectorySort, type PublicProfileSummary } from "@/lib/user-directory"
import {
  getFollowedIdsAmong,
  getFollowingProfiles,
  getMostFollowedProfiles,
  getMostVisitedProfiles,
} from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

/**
 * Listas do diretório de pessoas: `?sort=visited` (padrão), `followed` ou
 * `following`. Quando há sessão, devolve também quais desses perfis o usuário
 * já segue — assim a grade renderiza o botão certo sem uma chamada por card.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sort = coerceDirectorySort(searchParams.get("sort"))
  const limit = Math.min(Number(searchParams.get("limit")) || 12, 48)

  try {
    const user = await getRequestUser(request)

    let profiles: PublicProfileSummary[]
    if (sort === "following") {
      // "Seguindo" é a lista do próprio visitante — sem sessão não existe.
      if (!user) {
        return NextResponse.json({
          ok: true,
          sort,
          profiles: [],
          followedIds: [],
          currentUserId: null,
          requiresAuth: true,
        })
      }
      profiles = await getFollowingProfiles(user.id, limit)
    } else if (sort === "followed") {
      profiles = await getMostFollowedProfiles(limit)
    } else {
      profiles = await getMostVisitedProfiles(limit)
    }

    const followedIds = user
      ? await getFollowedIdsAmong(user.id, profiles.map((p) => p.id))
      : []

    return NextResponse.json({
      ok: true,
      sort,
      profiles,
      followedIds,
      currentUserId: user?.id ?? null,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar perfis." }, { status: 500 })
  }
}
