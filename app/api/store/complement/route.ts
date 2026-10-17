import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  findOrderForComplement,
  getPaymentComplementProduct,
} from "@/lib/server/repositories/order-complement-repository"
import { parseOrderNumberInput } from "@/lib/store-payment-complement"

export const runtime = "nodejs"

/**
 * Complemento de Pagamento: o pedido da conta logada pelo número digitado no
 * anúncio, com o valor pendente. Só leitura; quem cobra é o checkout, que
 * recalcula o pendente sozinho.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Entre na sua conta para buscar o pedido." }, { status: 401 })
  }

  // A busca só enxerga pedidos da própria conta; o teto é contra script.
  const { allowed } = await checkRateLimit({
    action: "store_complement_lookup",
    identifier: user.id,
    maxAttempts: 30,
    windowSeconds: 600,
    onError: "closed",
  })
  if (!allowed) {
    return NextResponse.json({ error: "Muitas buscas. Aguarde alguns minutos e tente de novo." }, { status: 429 })
  }

  const number = parseOrderNumberInput(request.nextUrl.searchParams.get("pedido"))
  if (!number) {
    return NextResponse.json(
      { error: "Número de pedido inválido. Ele tem 8 letras e números, como A1B2C3D4." },
      { status: 400 }
    )
  }

  const [result, product] = await Promise.all([findOrderForComplement(user.id, number), getPaymentComplementProduct()])
  if (!product) {
    return NextResponse.json({ error: "O pagamento de complemento está indisponível no momento." }, { status: 503 })
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  // O anúncio vai junto: o checkout monta a linha do complemento com ele.
  return NextResponse.json({ ...result.lookup, product })
}
