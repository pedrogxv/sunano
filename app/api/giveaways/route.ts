import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getFeatureFlagContext, isFeatureEnabled } from "@/lib/server/feature-flags"
import { getMyGiveawayEntries, listPublicGiveaways } from "@/lib/server/repositories/giveaways-repository"

export const dynamic = "force-dynamic"

// Muda por pessoa (a flag e as participações dela): nunca em cache compartilhado.
const PRIVATE = { "Cache-Control": "private, no-store" }

/**
 * Sorteios da Home + em quais a pessoa já entrou. Atrás da flag `giveaways`:
 * com a flag desligada para quem pede, responde 404 — a mesma resposta de uma
 * rota que não existe, sem confirmar que a feature está em construção.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  const context = await getFeatureFlagContext(user?.id ?? null)
  if (!(await isFeatureEnabled("giveaways", context))) {
    return NextResponse.json({ error: "Não encontrado." }, { status: 404, headers: PRIVATE })
  }

  try {
    const giveaways = await listPublicGiveaways()
    const joinedIds = user ? await getMyGiveawayEntries(user.id, giveaways.map((g) => g.id)) : []
    return NextResponse.json({ giveaways, joinedIds, signedIn: Boolean(user) }, { headers: PRIVATE })
  } catch (error) {
    console.error("[api/giveaways] GET:", error)
    return NextResponse.json({ error: "Não foi possível carregar os sorteios." }, { status: 500, headers: PRIVATE })
  }
}
