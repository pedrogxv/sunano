import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { isUuid } from "@/lib/server/repositories/_shared"
import { isInfinitePayReference } from "@/lib/server/integrations/infinitepay"
import {
  applyInfinitePayPayment,
  getInfinitePayCardOrderForOwner,
} from "@/lib/server/repositories/infinitepay-orders-repository"

export const runtime = "nodejs"

/**
 * Retorno do checkout da InfinitePay. Depois de pagar, a InfinitePay manda o
 * cliente para `/checkout/card?orderId=…` com `transaction_nsu`, `slug` e
 * `receipt_url` na query, e a tela repassa os três para cá.
 *
 * Existe para o pedido virar pago na hora, sem esperar o webhook. A query é
 * do navegador, então ela só diz O QUE conferir: `applyInfinitePayPayment`
 * consulta `payment_check` na InfinitePay antes de liberar, igual ao webhook.
 */

const bodySchema = z.object({
  transaction_nsu: z.string().refine(isInfinitePayReference),
  slug: z.string().refine(isInfinitePayReference),
  receipt_url: z.string().max(500).nullish(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ error: "Retorno inválido." }, { status: 400 })

  const order = await getInfinitePayCardOrderForOwner(id, user.id)
  if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })
  // `expired` também: o link não expira junto, e o pagamento tardio quita.
  if (order.status !== "pending" && order.status !== "expired") return NextResponse.json({ result: "already" })

  // Cada chamada vai à API da InfinitePay: teto por pedido para a sessão do
  // dono não virar um laço de consultas.
  const limit = await checkRateLimit({
    action: "store_infinitepay_return",
    identifier: order.id,
    maxAttempts: 10,
    windowSeconds: 10 * 60,
    onError: "closed",
  })
  if (!limit.allowed) return NextResponse.json({ error: "Muitas consultas. Aguarde a confirmação." }, { status: 429 })

  try {
    const result = await applyInfinitePayPayment(
      {
        orderId: order.id,
        transactionNsu: parsed.data.transaction_nsu,
        slug: parsed.data.slug,
        receiptUrl: parsed.data.receipt_url ?? null,
      },
      "checkout"
    )
    return NextResponse.json({ result })
  } catch (err) {
    // Falha passageira: a tela segue consultando o pedido e o webhook libera.
    console.error(`[infinitepay-return] pedido ${order.id}:`, err)
    return NextResponse.json({ result: "unconfirmed" })
  }
}
