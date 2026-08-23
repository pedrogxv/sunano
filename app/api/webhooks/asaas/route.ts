import { timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { getPayment } from "@/lib/server/integrations/asaas"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { markMarketFeePaid } from "@/lib/server/repositories/market-repository"
import { syncOrderRefundState, orderOwnerId } from "@/lib/server/repositories/orders-repository"
import { creditCommissionForOrder } from "@/lib/server/repositories/affiliates-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"

export const runtime = "nodejs"
export const maxDuration = 20

interface AsaasWebhookPayload {
  event: string
  payment?: { id: string }
}

// Eventos de PIX recebido — o Asaas dispara mais de um evento ao longo do
// ciclo de vida do pagamento; só liberamos o pedido nestes.
const PAID_EVENTS = new Set(["PAYMENT_RECEIVED", "PAYMENT_CONFIRMED"])

// Estorno feito ou desfeito fora do nosso admin (ex.: direto no painel
// Asaas) não passa por `refundOrder` — só chega até nós via webhook. Como
// não existe um evento "estorno cancelado" dedicado, tratamos qualquer
// evento que possa ter mudado o estado de estorno reconsultando a cobrança
// e reconciliando pelo valor real em `refunds[]` (ver `syncOrderRefundState`).
const REFUND_SYNC_EVENTS = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_UPDATED",
])

function safeTokenMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  // Diferente da MisticPay, o Asaas assina o webhook com um token fixo
  // configurado no painel (header `asaas-access-token`) — validamos antes
  // de processar qualquer coisa.
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expectedToken) {
    console.error("ASAAS_WEBHOOK_TOKEN não configurado — recusando webhook.")
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 })
  }

  const providedToken = request.headers.get("asaas-access-token") ?? ""
  if (!providedToken || !safeTokenMatch(providedToken, expectedToken)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  }

  let payload: AsaasWebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const paymentId = payload.payment?.id
  if (!paymentId) {
    return NextResponse.json({ error: "payment.id ausente" }, { status: 400 })
  }

  if (REFUND_SYNC_EVENTS.has(payload.event)) {
    try {
      const result = await syncOrderRefundState(paymentId)
      if (!result.ok && result.status !== 404) {
        console.error("[webhooks/asaas] syncOrderRefundState:", result.error)
      }
      return NextResponse.json({ received: true })
    } catch (err) {
      // Não deixa a Asaas achar que precisa reentregar pra sempre — loga e
      // segue; a reconciliação roda de novo no próximo evento relacionado.
      console.error("[webhooks/asaas] syncOrderRefundState error:", err)
      return NextResponse.json({ received: true })
    }
  }

  if (!PAID_EVENTS.has(payload.event)) {
    return NextResponse.json({ received: true, ignored: payload.event })
  }

  const db = createSupabaseAdminClient()

  try {
    // Mesma defesa em profundidade usada na MisticPay: reconsultamos o
    // pagamento na origem antes de confiar no evento, mesmo já tendo
    // validado o token do webhook.
    const verified = await getPayment(paymentId)

    if (verified.status !== "RECEIVED" && verified.status !== "CONFIRMED") {
      return NextResponse.json({ received: true, ignored: "not paid" })
    }

    // Idempotente: só transiciona se ainda não estava paga, protegendo
    // contra reentrega do mesmo webhook. Estoque NÃO é decrementado aqui —
    // já foi reservado atomicamente no checkout (ver
    // app/api/store/checkout/route.ts e 20260918000000_store_orders_stock_reservation.sql);
    // decrementar de novo neste ponto duplicaria o desconto.
    const { data: updatedOrders } = await db
      .from("store_orders")
      .update({
        status: "paid",
        asaas_receipt_url: verified.transactionReceiptUrl ?? verified.invoiceUrl ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("asaas_payment_id", paymentId)
      .neq("status", "paid")
      .select("id, affiliate_id, metadata")

    if (!updatedOrders || updatedOrders.length === 0) {
      // Não é um pedido da loja — pode ser a taxa de publicação de um
      // anúncio do Mercado, que usa o mesmo gateway/mesmo webhook.
      await markMarketFeePaid(paymentId)
      return NextResponse.json({ received: true })
    }

    // Comissão de afiliado, se houver — não pode derrubar o 200 devolvido à
    // Asaas (o pagamento já foi confirmado, é isso que importa aqui).
    for (const order of updatedOrders) {
      if (!order.affiliate_id) continue
      try {
        await creditCommissionForOrder(order.id)
      } catch (err) {
        console.error("[webhooks/asaas] creditCommissionForOrder:", err)
      }
    }

    for (const order of updatedOrders) {
      const ownerId = orderOwnerId(order.metadata as Record<string, unknown> | null)
      if (!ownerId) continue
      await notifyOrderStatusChange({ userId: ownerId, orderId: order.id, status: "paid" })
    }

    return NextResponse.json({ received: true })
  } catch (err) {
    console.error("Webhook handler error:", err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }
}
