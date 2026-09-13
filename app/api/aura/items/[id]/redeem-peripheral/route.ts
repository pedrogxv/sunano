import { NextRequest, NextResponse } from "next/server"

import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { redeemAuraPeripheral } from "@/lib/server/repositories/aura-store-repository"
import { shippingAddressSchema } from "@/lib/server/validation/shipping-address"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/aura/items/[id]/redeem-peripheral — resgata um periférico (produto
 * físico) pagando com Aura. O corpo TEM que trazer o endereço de entrega
 * completo: diferente da loja, aqui não há "informar depois" (não passa por
 * checkout). Contrato de erro distinto do redeem cosmético: `already_claimed`
 * (409) e `not_verified` (403). Devolve `orderId` do pseudo-pedido criado.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  // Segunda trava do modo somente-leitura da impersonation (a primeira é o
  // proxy). Esta rota gasta o saldo de Aura de outra pessoa e gera um pedido
  // de produto FÍSICO no endereço que vier no corpo — o exato oposto do
  // escopo de uma sessão de suporte, e o mesmo motivo pelo qual o checkout
  // da loja já tem a trava própria.
  if (isImpersonating(request)) {
    return NextResponse.json(
      {
        error: "impersonation_read_only",
        message: "Sessão de acesso é somente leitura; não é possível resgatar um item.",
      },
      { status: 403 }
    )
  }

  // Teto por CONTA (não por IP): o saldo de Aura é da conta, e o resgate
  // move produto físico. `onError: "closed"` porque uma falha do limiter não
  // pode virar caminho livre para uma rota que despacha mercadoria.
  const { allowed } = await checkRateLimit({
    action: "aura_redeem_peripheral",
    identifier: user.id,
    maxAttempts: 5,
    windowSeconds: 600,
    onError: "closed",
  })
  if (!allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas de resgate. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const body = await request.json().catch(() => null)
  const parsed = shippingAddressSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Endereço de entrega incompleto." },
      { status: 400 }
    )
  }

  const { id } = await params
  const result = await redeemAuraPeripheral(user.id, id, parsed.data)

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }

  return NextResponse.json({ ok: true, orderId: result.orderId })
}
