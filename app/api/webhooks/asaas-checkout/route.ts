import { timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { creditCommissionForOrder } from "@/lib/server/repositories/affiliates-repository"
import { orderOwnerId } from "@/lib/server/repositories/orders-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { getPaymentsByCheckoutSession } from "@/lib/server/integrations/asaas"

export const runtime = "nodejs"
export const maxDuration = 20

// Evento próprio do Asaas Checkout (`/v3/checkouts`) — payload trafega um
// objeto `checkout`, não `payment`, e é um webhook DISTINTO do de PIX
// (app/api/webhooks/asaas/route.ts), cadastrado separadamente no painel
// Asaas com os eventos CHECKOUT_*.
interface AsaasCheckoutWebhookPayload {
  event: string
  checkout?: { id: string; customer?: string }
}

type OrderItemLine = { id?: string; variant_id?: string | null; quantity?: number }

function safeTokenMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_CHECKOUT_TOKEN
  if (!expectedToken) {
    console.error("ASAAS_WEBHOOK_CHECKOUT_TOKEN não configurado — recusando webhook.")
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 })
  }

  const providedToken = request.headers.get("asaas-access-token") ?? ""
  if (!providedToken || !safeTokenMatch(providedToken, expectedToken)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  }

  let payload: AsaasCheckoutWebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const checkoutId = payload.checkout?.id
  if (!checkoutId) {
    return NextResponse.json({ error: "checkout.id ausente" }, { status: 400 })
  }

  const db = createSupabaseAdminClient()

  try {
    if (payload.event === "CHECKOUT_PAID") {
      // Sem defesa em profundidade aqui (diferente do webhook de PIX, que
      // reconsulta getPayment antes de liberar): GET /v3/checkouts/{id} não
      // é exposto pela API v3 do Asaas — retorna 404 mesmo para checkouts
      // reais e pagos. Por isso confiamos direto no evento assinado — o
      // token em `asaas-access-token`, validado acima, já impede forjar a
      // chamada.

      // GET /v3/payments?checkoutSession= (diferente de GET /v3/checkouts/{id},
      // esse endpoint existe) devolve o payment real gerado pelo checkout —
      // é como obtemos paymentId/comprovante para gravar em store_orders,
      // já que o payload do webhook não traz isso.
      let paymentId: string | null = null
      let receiptUrl: string | null = null
      const customerId = payload.checkout?.customer
      try {
        if (customerId) {
          const [payment] = await getPaymentsByCheckoutSession(checkoutId, customerId)
          if (payment) {
            paymentId = payment.id
            receiptUrl = payment.transactionReceiptUrl ?? payment.invoiceUrl ?? null
          }
        } else {
          console.error("[webhooks/asaas-checkout] checkout.customer ausente no payload:", checkoutId)
        }
      } catch (err) {
        console.error("[webhooks/asaas-checkout] getPaymentsByCheckoutSession:", err)
      }

      // Idempotente: só transiciona se ainda não estava pago, protegendo
      // contra reentrega do mesmo webhook. Estoque NÃO é decrementado aqui —
      // já foi reservado atomicamente no checkout (ver
      // app/api/store/checkout/route.ts).
      const { data: updatedOrders } = await db
        .from("store_orders")
        .update({
          status: "paid",
          updated_at: new Date().toISOString(),
          ...(paymentId && { asaas_payment_id: paymentId }),
          ...(receiptUrl && { asaas_receipt_url: receiptUrl }),
        })
        .eq("asaas_checkout_id", checkoutId)
        .neq("status", "paid")
        .select("id, affiliate_id, metadata")

      for (const order of updatedOrders ?? []) {
        if (!order.affiliate_id) continue
        try {
          await creditCommissionForOrder(order.id)
        } catch (err) {
          console.error("[webhooks/asaas-checkout] creditCommissionForOrder:", err)
        }
      }

      for (const order of updatedOrders ?? []) {
        const ownerId = orderOwnerId(order.metadata as Record<string, unknown> | null)
        if (!ownerId) continue
        await notifyOrderStatusChange({ userId: ownerId, orderId: order.id, status: "paid" })
      }

      return NextResponse.json({ received: true })
    }

    if (payload.event === "CHECKOUT_EXPIRED" || payload.event === "CHECKOUT_CANCELED") {
      // Diferente do PIX (que só expira via cron), aqui a Asaas avisa
      // ativamente que o checkout não vai mais ser pago — reverter a
      // reserva de estoque na hora é mais correto que esperar
      // expireStalePendingOrders rodar.
      const nextStatus = payload.event === "CHECKOUT_EXPIRED" ? "expired" : "cancelled"
      const { data: updatedOrders } = await db
        .from("store_orders")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("asaas_checkout_id", checkoutId)
        .eq("status", "pending")
        .select("id, items, metadata")

      for (const order of updatedOrders ?? []) {
        const ownerId = orderOwnerId(order.metadata as Record<string, unknown> | null)
        if (ownerId) {
          await notifyOrderStatusChange({ userId: ownerId, orderId: order.id, status: nextStatus })
        }
      }

      for (const order of updatedOrders ?? []) {
        const items = (order.items ?? []) as OrderItemLine[]
        await Promise.all(
          items.map(async (item) => {
            if (!item.id || !item.quantity) return
            try {
              if (item.variant_id) {
                await db.rpc("increment_variant_stock", { p_variant_id: item.variant_id, p_quantity: item.quantity })
              } else {
                await db.rpc("increment_store_stock", { p_product_id: item.id, p_quantity: item.quantity })
              }
            } catch (err) {
              console.error("[webhooks/asaas-checkout] falha ao reverter reserva de estoque:", item, err)
            }
          })
        )
      }

      return NextResponse.json({ received: true })
    }

    return NextResponse.json({ received: true, ignored: payload.event })
  } catch (err) {
    console.error("Webhook handler error:", err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }
}
