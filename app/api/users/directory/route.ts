import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  coerceDirectoryPeriod,
  coerceDirectorySort,
  type PublicProfileSummary,
} from "@/lib/user-directory"
import {
  getFollowingProfiles,
  getMostActiveProfiles,
  getMostActiveProfilesByPeriod,
  getMostFollowedProfiles,
  getMostVisitedProfiles,
  getTopAuraProfiles,
  getTopAuraProfilesByPeriod,
  getTopStreakProfiles,
} from "@/lib/server/repositories/users-repository"

/**
 * Listas do diretório de pessoas: `?sort=aura` (padrão), `visited`, `followed`,
 * `following`, `active` ou `streak`. `&period=today|week|month` recorta `aura` e
 * `active` pelo que a pessoa ganhou/produziu na janela (as outras abas ignoram
 * o parâmetro — não têm histórico temporal).
 *
 * Todos os rankings são públicos e idênticos para qualquer visitante: os dados
 * saem de `unstable_cache` (5 min) no repositório, e a resposta ganha
 * `s-maxage`/`stale-while-revalidate` para o CDN da Vercel servir a maioria das
 * trocas de aba sem invocar a função. O estado "eu sigo este perfil" NÃO vem
 * mais daqui — é um fetch à parte (`/api/users/follows/among`), justamente para
 * não furar esse cache compartilhado.
 *
 * A exceção é `sort=following` (a lista do próprio visitante): essa precisa da
 * sessão e responde sem cache.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sort = coerceDirectorySort(searchParams.get("sort"))
  const period = coerceDirectoryPeriod(searchParams.get("period"))
  const limit = Math.min(Number(searchParams.get("limit")) || 12, 100)

  try {
    if (sort === "following") {
      const user = await getRequestUser(request)
      if (!user) {
        return NextResponse.json(
          { ok: true, sort, period, profiles: [], requiresAuth: true },
          { headers: { "Cache-Control": "private, no-store" } }
        )
      }
      const profiles = await getFollowingProfiles(user.id, limit)
      return NextResponse.json(
        { ok: true, sort, period, profiles },
        { headers: { "Cache-Control": "private, no-store" } }
      )
    }

    let profiles: PublicProfileSummary[]
    if (sort === "followed") {
      profiles = await getMostFollowedProfiles(limit)
    } else if (sort === "visited") {
      profiles = await getMostVisitedProfiles(limit)
    } else if (sort === "active") {
      profiles =
        period === "all"
          ? await getMostActiveProfiles(limit)
          : await getMostActiveProfilesByPeriod(period, limit)
    } else if (sort === "streak") {
      profiles = await getTopStreakProfiles(limit)
    } else {
      profiles =
        period === "all"
          ? await getTopAuraProfiles(limit)
          : await getTopAuraProfilesByPeriod(period, limit)
    }

    return NextResponse.json(
      { ok: true, sort, period, profiles },
      {
        headers: {
          // O CDN serve por 5 min e revalida em background por mais 25 —
          // alinha com o `revalidate: 300` do `unstable_cache` no repositório.
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=1500",
        },
      }
    )
  } catch {
    return NextResponse.json(
      { error: "Erro ao carregar perfis." },
      { status: 500 }
    )
  }
}
