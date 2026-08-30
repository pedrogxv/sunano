import { NextRequest, NextResponse } from "next/server"
import { checkTransaction } from "@/lib/server/integrations/misticpay"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  orderOwnerId,
  reReserveStockForLatePayment,
} from "@/lib/server/repositories/orders-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"

export const runtime = "nodejs"
export const maxDuration = 20

interface MisticPayWebhookPayload {
  transactionId: number | string
  status: "PENDENTE" | "COMPLETO" | "FALHA"
  value?: number
  e2e?: string
}

export async function POST(request: NextRequest) {
  // Identificador fixo por rota (não IP/UA como no checkout): a origem
  // aqui é infraestrutura do gateway, não um "cliente" a diferenciar —
  // diferenciar por IP+UA só fragmentaria a contagem sem ganho de proteção.
  // Contém volume total de flood (que dispara `checkTransaction`, uma
  // chamada de rede externa, e updates no banco); a defesa real contra
  // pagamento forjado continua sendo a reconsulta à origem abaixo.
  // `windowSeconds` aqui é bem menor que a purga de 2h de `rate_limit_events`
  // em lib/server/repositories/lgpd-repository.ts — sem conflito.
  const rateLimit = await checkRateLimit({
    action: "misticpay_webhook",
    identifier: "misticpay_webhook",
    maxAttempts: 120,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 })
  }

  let payload: MisticPayWebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  const transactionId = String(payload.transactionId ?? "")
  if (!transactionId) {
    return NextResponse.json({ error: "transactionId ausente" }, { status: 400 })
  }

  const db = createSupabaseAdminClient()

  try {
    // A MisticPay não assina os webhooks (sem HMAC/verificação de origem),
    // então nunca confiamos no `status` do payload sozinho — qualquer
    // pessoa que descobrisse esta URL poderia forjar "COMPLETO" e liberar
    // pedidos sem pagamento. Reconsultamos a transação direto na API antes
    // de marcar como paga.
    const verified = await checkTransaction(transactionId)

    if (verified.status !== "COMPLETO") {
      return NextResponse.json({ received: true, ignored: "not completed" })
    }

    // Idempotente: só transiciona se ainda não estava paga, protegendo
    // contra reentrega do mesmo webhook. Estoque NÃO é decrementado aqui —
    // já foi reservado atomicamente no checkout (ver
    // app/api/store/checkout/route.ts e 20260918000000_store_orders_stock_reservation.sql);
    // decrementar de novo neste ponto duplicaria o desconto.
    // Status ANTES da transição: um pedido que já estava `expired` teve o
    // estoque devolvido pelo cron de expiração, e precisa reservá-lo de novo
    // agora que o pagamento entrou (senão a loja vende a mesma unidade duas
    // vezes). Lido antes do UPDATE porque depois dele a informação some.
    const { data: priorOrders } = await db
      .from("store_orders")
      .select("id, status")
      .eq("misticpay_transaction_id", transactionId)
    const wasExpired = new Set(
      (priorOrders ?? []).filter((o) => o.status === "expired").map((o) => o.id)
    )

    const { data: updatedOrders } = await db
      .from("store_orders")
      .update({
        status: "paid",
        misticpay_e2e: verified.e2e ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("misticpay_transaction_id", transactionId)
      .neq("status", "paid")
      .select("id, metadata")

    for (const order of updatedOrders ?? []) {
      if (!wasExpired.has(order.id)) continue
      try {
        await reReserveStockForLatePayment(order.id)
      } catch (err) {
        console.error("[webhooks/misticpay] reReserveStockForLatePayment:", err)
      }
    }

    for (const order of updatedOrders ?? []) {
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
