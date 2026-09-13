import { NextRequest, NextResponse } from "next/server"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
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

  // Segunda trava do modo somente-leitura da impersonation (a primeira é o
  // proxy). Esta rota gasta o saldo de Aura de outra pessoa para comprar a proteção.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura; não é possível comprar a proteção.",
      },
      { status: 403 }
    )
  }

  // Teto por CONTA: o saldo de Aura é da conta, não do IP. `onError: "closed"`
  // porque uma falha do limiter não pode abrir uma rota que gasta saldo.
  const { allowed } = await checkRateLimit({
    action: "aura_streak_shield_purchase",
    identifier: user.id,
    maxAttempts: 10,
    windowSeconds: 600,
    onError: "closed",
  })
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
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
