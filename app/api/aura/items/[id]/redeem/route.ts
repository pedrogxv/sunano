import { NextRequest, NextResponse } from "next/server"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { redeemAuraItem } from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** POST /api/aura/items/[id]/redeem — resgata um item da loja pagando com Aura. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Segunda trava do modo somente-leitura da impersonation (a primeira é o
  // proxy). Esta rota gasta o saldo de Aura de outra pessoa para resgatar um item.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura; não é possível resgatar um item.",
      },
      { status: 403 }
    )
  }

  // Teto por CONTA: o saldo de Aura é da conta, não do IP. `onError: "closed"`
  // porque uma falha do limiter não pode abrir uma rota que gasta saldo.
  const { allowed } = await checkRateLimit({
    action: "aura_redeem_item",
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

  const { id } = await params
  const result = await redeemAuraItem(user.id, id)

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
