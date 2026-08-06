import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getFollowedIdsAmong, getFollowerProfiles } from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

/**
 * Seguidores de um perfil público — usado pelo modal "Seguidores" da vitrine
 * de perfil. Quando há sessão, devolve também quais desses perfis o
 * visitante já segue, para o botão Seguir renderizar o estado certo sem uma
 * chamada por linha (mesmo padrão de `/api/users/directory`).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId")
  const limit = Math.min(Number(searchParams.get("limit")) || 48, 48)

  if (!userId) {
    return NextResponse.json({ error: "Usuário não informado." }, { status: 400 })
  }

  try {
    const viewer = await getRequestUser(request)
    const profiles = await getFollowerProfiles(userId, limit)
    const followedIds = viewer
      ? await getFollowedIdsAmong(viewer.id, profiles.map((p) => p.id))
      : []

    return NextResponse.json({
      ok: true,
      profiles,
      followedIds,
      currentUserId: viewer?.id ?? null,
    })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar seguidores." }, { status: 500 })
  }
}
