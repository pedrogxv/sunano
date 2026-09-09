import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
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
