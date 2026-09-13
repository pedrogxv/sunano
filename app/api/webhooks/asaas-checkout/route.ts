import { NextRequest, NextResponse } from "next/server"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { secretsMatch } from "@/lib/server/secret-compare"
import { creditCommissionForOrder } from "@/lib/server/repositories/affiliates-repository"
import {
  lineMovesPhysicalStock,
  orderOwnerId,
  reReserveStockForLatePayment,
} from "@/lib/server/repositories/orders-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
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

type OrderItemLine = {
  id?: string
  variant_id?: string | null
  quantity?: number
  /** Snapshot do tipo de venda gravado pelo checkout; pré-venda não move estoque físico. */
  sale_type?: string | null
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_CHECKOUT_TOKEN
  if (!expectedToken) {
    console.error("ASAAS_WEBHOOK_CHECKOUT_TOKEN não configurado — recusando webhook.")
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 })
  }

  const providedToken = request.headers.get("asaas-access-token") ?? ""
  if (!secretsMatch(providedToken, expectedToken)) {
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
      // GET /v3/checkouts/{id} não é exposto pela API v3 do Asaas (retorna
      // 404 mesmo para checkout real e pago), mas o PAYMENT gerado por ele é
      // consultável — e é essa consulta, que já fazíamos só para obter
      // paymentId/comprovante, que vale como defesa em profundidade: quando
      // o pagamento é encontrado, exigimos status e valor compatíveis antes
      // de liberar o pedido, em vez de confiar apenas no evento assinado.
      let paymentId: string | null = null
      let receiptUrl: string | null = null
      let paidCents: number | null = null
      let isInstallment = false
      let paymentFound = false
      let paymentConfirmed = false
      const customerId = payload.checkout?.customer
      try {
        if (customerId) {
          const [payment] = await getPaymentsByCheckoutSession(checkoutId, customerId)
          if (payment) {
            paymentFound = true
            paymentId = payment.id
            receiptUrl = payment.transactionReceiptUrl ?? payment.invoiceUrl ?? null
            paidCents = typeof payment.value === "number" ? Math.round(payment.value * 100) : null
            isInstallment = Boolean(payment.installment)
            paymentConfirmed =
              payment.status === "RECEIVED" ||
              payment.status === "CONFIRMED" ||
              payment.status === "RECEIVED_IN_CASH"
          }
        } else {
          console.error("[webhooks/asaas-checkout] checkout.customer ausente no payload:", checkoutId)
        }
      } catch (err) {
        console.error("[webhooks/asaas-checkout] getPaymentsByCheckoutSession:", err)
      }

      // Achamos a cobrança e ela não está paga na origem: evento adiantado ou
      // forjado. Não libera. Quando a consulta falha (rede, cliente com
      // muitos pagamentos), seguimos confiando no evento assinado — recusar
      // aqui travaria venda legítima por indisponibilidade da Asaas.
      if (paymentFound && !paymentConfirmed) {
        console.error(
          `[webhooks/asaas-checkout] CHECKOUT_PAID com pagamento não confirmado na origem (checkout ${checkoutId}).`
        )
        return NextResponse.json({ received: true, ignored: "payment_not_confirmed" })
      }

      // Estado ANTES da transição: o pedido pode ter sido cancelado pelo
      // cliente ou expirado pelo cron, e nos dois casos o estoque já voltou
      // para a prateleira. Como o link do checkout continua pagável na Asaas,
      // o pagamento pode chegar depois disso.
      const { data: priorOrders } = await db
        .from("store_orders")
        .select("id, status, total_cents")
        .eq("asaas_checkout_id", checkoutId)

      // Valor conferido contra o total do pedido, exceto em parcelamento, em
      // que o `value` da Asaas é o da PARCELA e não o total.
      const underpaid = (priorOrders ?? []).filter(
        (order) => paidCents !== null && !isInstallment && paidCents < order.total_cents
      )
      for (const order of underpaid) {
        console.error(
          `[webhooks/asaas-checkout] valor divergente no checkout ${checkoutId}: pago ${paidCents} vs total ${order.total_cents} do pedido ${order.id} — pedido NÃO liberado.`
        )
        await notifyDiscordOrderEvent({
          orderId: order.id,
          status: "payment_mismatch",
          actor: "webhook-asaas",
          note: `Asaas confirmou R$ ${((paidCents ?? 0) / 100).toFixed(2)} para um pedido de R$ ${(order.total_cents / 100).toFixed(2)} (checkout ${checkoutId}).`,
        })
      }

      const underpaidIds = new Set(underpaid.map((order) => order.id))
      const payableIds = (priorOrders ?? [])
        .filter((order) => !underpaidIds.has(order.id))
        .map((order) => order.id)
      const stockWasReturned = new Set(
        (priorOrders ?? [])
          .filter((order) => order.status === "expired" || order.status === "cancelled")
          .map((order) => order.id)
      )

      // Idempotente e sem regressão de status: só avança do que ainda espera
      // pagamento. Estoque NÃO é decrementado aqui — já foi reservado
      // atomicamente no checkout (ver app/api/store/checkout/route.ts).
      const updatedOrders =
        payableIds.length === 0
          ? []
          : ((
              await db
                .from("store_orders")
                .update({
                  status: "paid",
                  updated_at: new Date().toISOString(),
                  ...(paymentId && { asaas_payment_id: paymentId }),
                  ...(receiptUrl && { asaas_receipt_url: receiptUrl }),
                })
                .eq("asaas_checkout_id", checkoutId)
                .in("id", payableIds)
                .in("status", ["pending", "expired", "cancelled"])
                .select("id, affiliate_id, metadata")
            ).data ?? [])

      // Pedido que já tinha devolvido o estoque precisa reservá-lo de novo,
      // senão a loja vende a mesma unidade duas vezes. Mesmo tratamento do
      // webhook de PIX: quando não há estoque, o pedido é marcado para
      // revisão manual em vez de mentir sobre o inventário.
      for (const order of updatedOrders) {
        if (!stockWasReturned.has(order.id)) continue
        try {
          const { restocked, oversoldItems } = await reReserveStockForLatePayment(order.id)
          if (restocked) continue
          await notifyDiscordOrderEvent({
            orderId: order.id,
            status: "oversold",
            actor: "webhook-asaas",
            note: `Sem estoque para: ${oversoldItems.join(", ")}`,
          })
        } catch (err) {
          console.error("[webhooks/asaas-checkout] reReserveStockForLatePayment:", err)
        }
      }

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

      // Fora do laço acima: pedido de convidado não tem dono para notificar
      // no site, mas a venda tem que aparecer no canal do mesmo jeito.
      for (const order of updatedOrders ?? []) {
        await notifyDiscordOrderEvent({ orderId: order.id, status: "paid", actor: "webhook-asaas" })
      }

      return NextResponse.json({ received: true })
    }

    if (payload.event === "CHECKOUT_EXPIRED" || payload.event === "CHECKOUT_CANCELED") {
      // Diferente do PIX (que só expira via cron), aqui a Asaas avisa
      // ativamente que o checkout não vai mais ser pago — reverter a
      // reserva de estoque na hora é mais correto que esperar
      // expireStalePendingOrders rodar.
      //
      // Defesa em profundidade antes de mexer no inventário: este ramo
      // DEVOLVE estoque, então um evento reentregue (ou atrasado, chegando
      // depois de o cliente ter pago) recolocaria na prateleira uma unidade
      // que um pedido pago está segurando. `GET /v3/checkouts/{id}` não
      // existe na API v3, mas o payment gerado pelo checkout é consultável —
      // é a mesma chamada que o ramo CHECKOUT_PAID já usa.
      //
      // Só abortamos com evidência POSITIVA de pagamento: falha de rede ou
      // ausência de customer no payload não podem travar a devolução do
      // estoque, senão uma indisponibilidade da Asaas prenderia inventário.
      const customerId = payload.checkout?.customer
      if (customerId) {
        try {
          const payments = await getPaymentsByCheckoutSession(checkoutId, customerId)
          const paid = payments.find(
            (p) => p.status === "RECEIVED" || p.status === "CONFIRMED" || p.status === "RECEIVED_IN_CASH"
          )
          if (paid) {
            console.warn(
              `[webhooks/asaas-checkout] ${payload.event} ignorado: checkout ${checkoutId} tem pagamento ${paid.id} (${paid.status}).`
            )
            return NextResponse.json({ received: true, ignored: "already paid" })
          }
        } catch (err) {
          console.error("[webhooks/asaas-checkout] verificação de pagamento antes de expirar:", err)
        }
      }

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
        await notifyDiscordOrderEvent({ orderId: order.id, status: nextStatus, actor: "webhook-asaas" })
      }

      for (const order of updatedOrders ?? []) {
        // Pré-venda não teve estoque descontado no checkout (o teto é
        // `preorder_limit`, conferido por `reserve_preorder`) — devolver
        // aqui criaria unidades que nunca existiram.
        const items = ((order.items ?? []) as OrderItemLine[]).filter(lineMovesPhysicalStock)
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
