import { NextRequest, NextResponse } from "next/server"
import {
  InfinitePayConfigError,
  isInfinitePayReference,
  isValidInfinitePayWebhookToken,
} from "@/lib/server/integrations/infinitepay"
import { applyInfinitePayPayment } from "@/lib/server/repositories/infinitepay-orders-repository"
import { isUuid } from "@/lib/server/repositories/_shared"

export const runtime = "nodejs"

/**
 * Webhook da InfinitePay — cartão da Loja (`STORE_CARD_GATEWAY=infinitepay`).
 *
 * A URL vai em cada link criado (`webhook_url`), com o token de
 * `INFINITEPAY_WEBHOOK_TOKEN` na query: não há cadastro no painel nem
 * assinatura. O token só barra chamadas de terceiros; quem decide o pedido é
 * o `payment_check` na API, feito dentro de `applyInfinitePayPayment`. O
 * corpo só fornece a tripla (pedido, transação, fatura) a conferir.
 *
 * Contrato da InfinitePay: 200 = recebido; 400 = reenviar. Por isso falha
 * passageira (rede, banco) e pagamento que a consulta ainda não confirma
 * respondem 400, e o que nunca vai mudar responde 200.
 */
export async function POST(request: NextRequest) {
  let authorized: boolean
  try {
    authorized = isValidInfinitePayWebhookToken(request.nextUrl.searchParams.get("token"))
  } catch (err) {
    if (err instanceof InfinitePayConfigError) {
      console.error("[webhooks/infinitepay]", err.message)
      return NextResponse.json({ error: "Webhook não configurado" }, { status: 400 })
    }
    throw err
  }
  if (!authorized) return NextResponse.json({ error: "Não autorizado" }, { status: 401 })

  const body = (await request.json().catch(() => null)) as {
    order_nsu?: unknown
    transaction_nsu?: unknown
    invoice_slug?: unknown
    receipt_url?: unknown
  } | null

  const orderId = typeof body?.order_nsu === "string" ? body.order_nsu : null
  if (!orderId || !isUuid(orderId) || !isInfinitePayReference(body?.transaction_nsu) || !isInfinitePayReference(body?.invoice_slug)) {
    return NextResponse.json({ received: true, ignored: "referência inválida" })
  }

  try {
    const result = await applyInfinitePayPayment(
      {
        orderId,
        transactionNsu: body.transaction_nsu,
        slug: body.invoice_slug,
        receiptUrl: typeof body.receipt_url === "string" ? body.receipt_url : null,
      },
      "webhook-infinitepay"
    )
    // A notificação é de pagamento APROVADO: se a consulta ainda não confirma,
    // pede reentrega em vez de descartar um pagamento real.
    if (result === "unconfirmed") {
      return NextResponse.json({ error: "Pagamento ainda não confirmado" }, { status: 400 })
    }
    return NextResponse.json({ received: true, result })
  } catch (err) {
    console.error(`[webhooks/infinitepay] pedido ${orderId}:`, err)
    return NextResponse.json({ error: "Falha ao processar" }, { status: 400 })
  }
}
