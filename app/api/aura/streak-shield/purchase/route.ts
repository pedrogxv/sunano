import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  purchaseStreakShield,
  type StreakShieldVariant,
} from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const VARIANTS: StreakShieldVariant[] = ["1d", "3d"]

/**
 * POST /api/aura/streak-shield/purchase — compra a "Proteção de Ofensiva"
 * pagando com Aura. Body: `{ variant: "1d" | "3d" }`. O preço e o id do
 * item nunca vêm do client: o repositório resolve pelo slug e a RPC debita
 * atomicamente. A compra só ARMA o escudo (fica guardado sem prazo); não
 * empilha — se já houver um escudo guardado, responde 409.
 */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  let variant: unknown
  try {
    const body = (await request.json()) as { variant?: unknown }
    variant = body.variant
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 })
  }

  if (typeof variant !== "string" || !VARIANTS.includes(variant as StreakShieldVariant)) {
    return NextResponse.json({ error: "Variante inválida." }, { status: 400 })
  }

  const result = await purchaseStreakShield(user.id, variant as StreakShieldVariant)

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  return NextResponse.json({ ok: true, graceDays: result.graceDays })
}
