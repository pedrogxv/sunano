import { NextRequest, NextResponse } from "next/server"

import { GIVEAWAY_JOIN_MESSAGES } from "@/lib/giveaways"
import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { getFeatureFlagContext, isFeatureEnabled } from "@/lib/server/feature-flags"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { joinGiveaway } from "@/lib/server/repositories/giveaways-repository"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const STATUS_BY_CODE = { already: 200, full: 409, closed: 409, not_found: 404 } as const

/** Entra no sorteio. Uma vez por pessoa; a vaga é conferida com a linha travada (`join_giveaway`). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Entre na sua conta para participar.", code: "unauthenticated" }, { status: 401 })
  }
  if (isImpersonating(request)) {
    return NextResponse.json({ error: "Sessão de acesso é somente leitura." }, { status: 403 })
  }

  // A flag vale aqui também: esconder a seção no cliente não impede um POST direto.
  if (!(await isFeatureEnabled("giveaways", await getFeatureFlagContext(user.id)))) {
    return NextResponse.json({ error: "Não encontrado.", code: "not_found" }, { status: 404 })
  }

  const { id } = await params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Sorteio inválido.", code: "not_found" }, { status: 400 })
  }

  const rateLimit = await checkRateLimit({
    action: "giveaway_join",
    identifier: `user:${user.id}`,
    maxAttempts: 20,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Calma aí, tente de novo em instantes.", code: "rate_limited" }, { status: 429 })
  }

  try {
    const { code, entriesCount } = await joinGiveaway(id, user.id)
    if (code === "joined") return NextResponse.json({ ok: true, code, entriesCount })
    return NextResponse.json(
      { ok: code === "already", code, entriesCount, error: GIVEAWAY_JOIN_MESSAGES[code] },
      { status: STATUS_BY_CODE[code] }
    )
  } catch (error) {
    console.error("[api/giveaways/join] POST:", error)
    return NextResponse.json({ error: "Não foi possível participar. Tente de novo." }, { status: 500 })
  }
}
