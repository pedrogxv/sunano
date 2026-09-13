import { NextRequest, NextResponse } from "next/server"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { purchaseVipWithAura } from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** POST /api/aura/vip/purchase — compra 1 mês de VIP pagando com Aura (só se não tiver VIP ativo). */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Segunda trava do modo somente-leitura da impersonation (a primeira é o
  // proxy). Esta rota gasta o saldo de Aura de outra pessoa para comprar VIP.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura; não é possível comprar VIP.",
      },
      { status: 403 }
    )
  }

  // Teto por CONTA: o saldo de Aura é da conta, não do IP. `onError: "closed"`
  // porque uma falha do limiter não pode abrir uma rota que gasta saldo.
  const { allowed } = await checkRateLimit({
    action: "aura_vip_purchase",
    identifier: user.id,
    maxAttempts: 5,
    windowSeconds: 600,
    onError: "closed",
  })
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const result = await purchaseVipWithAura(user.id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  return NextResponse.json({ ok: true, expiresAt: result.expiresAt })
}
