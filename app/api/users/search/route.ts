import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  getFollowedIdsAmong,
  searchUserProfiles,
} from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

/**
 * Busca de perfis pelo nome de exibição. Como `/api/users/directory`, devolve
 * também quais dos resultados o usuário logado já segue.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") ?? ""
  const limit = Math.min(Number(searchParams.get("limit")) || 10, 24)

  try {
    const profiles = await searchUserProfiles(query, limit)

    const user = await getRequestUser(request)
    const followedIds = user
      ? await getFollowedIdsAmong(user.id, profiles.map((p) => p.id))
      : []

    return NextResponse.json({
      ok: true,
      profiles,
      followedIds,
      currentUserId: user?.id ?? null,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao buscar perfis." }, { status: 500 })
  }
}
