import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import {
  getFollowedIdsAmong,
  searchUserProfiles,
} from "@/lib/server/repositories/users-repository"

export const dynamic = "force-dynamic"

/**
 * Busca de perfis pelo nome de exibição. Pública (usada em /pessoas por
 * visitantes anônimos), por isso não exige login — só limita a taxa para
 * não virar um scraping/DoS barato do diretório inteiro. Como
 * `/api/users/directory`, devolve também quais dos resultados o usuário
 * logado já segue.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const query = searchParams.get("q") ?? ""
  const limit = Math.min(Number(searchParams.get("limit")) || 10, 24)

  const rateLimit = await checkRateLimit({
    action: "users_search",
    identifier: getClientIdentifier(request),
    maxAttempts: 30,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitas buscas seguidas. Aguarde um instante." }, { status: 429 })
  }

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
