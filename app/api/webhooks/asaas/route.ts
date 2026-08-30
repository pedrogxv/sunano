import { timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { getPayment } from "@/lib/server/integrations/asaas"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { markMarketFeePaid } from "@/lib/server/repositories/market-repository"
import {
  syncOrderRefundState,
  orderOwnerId,
  reReserveStockForLatePayment,
  expireOrderByPaymentId,
} from "@/lib/server/repositories/orders-repository"
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
  // Estorno NEGADO: o dinheiro não voltou. Passa pela mesma reconciliação
  // porque `syncOrderRefundState` só soma `refunds[].status === "DONE"` —
  // então ela desfaz sozinha um `refunded_cents` que tinha sido gravado
  // otimisticamente enquanto o estorno ainda estava em andamento.
  "PAYMENT_REFUND_DENIED",
  "PAYMENT_UPDATED",
])

// A cobrança deixou de ser pagável e o pedido deve liberar o estoque na hora.
//
// - PAYMENT_OVERDUE: passou do `dueDate` sem pagamento. Em produção o
//   `dueDate` do PIX é o dia da compra, então todo pedido não pago gera este
//   evento; no sandbox é o que o botão "Forçar vencimento" dispara.
// - PAYMENT_DELETED: cobrança removida no painel da Asaas — nunca mais será
//   paga, não faz sentido segurar o estoque até o cron perceber.
// - PAYMENT_BANK_SLIP_CANCELLED: registro do boleto cancelado por expiração
//   do prazo. Não emitimos boleto hoje, mas o efeito é o mesmo e o custo de
//   cobrir é uma linha.
//
// Sem isto o pedido só seria expirado pelo cron (até 15 min depois) — e, se o
// `pix_expires_at` gravado estiver errado, nunca.
const EXPIRE_EVENTS = new Set([
  "PAYMENT_OVERDUE",
  "PAYMENT_DELETED",
  "PAYMENT_BANK_SLIP_CANCELLED",
])

// Cobrança removida e depois restaurada no painel. Só faz sentido tratar
// porque tratamos PAYMENT_DELETED: sem o par, um clique errado no painel
// deixaria o pedido `expired` para sempre, sem caminho de volta.
const RESTORE_EVENTS = new Set(["PAYMENT_RESTORED"])

// Chargeback: o dinheiro de um pedido JÁ PAGO está sendo disputado. Não
// mexemos no status do pedido (quem decide estorno/entrega é o admin) — o
// objetivo aqui é que ninguém descubra a disputa só quando a Asaas debitar,
// então marcamos o pedido e registramos no log.
const CHARGEBACK_EVENTS = new Set([
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
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

  // Este webhook só trata eventos PAYMENT_* (os CHECKOUT_* têm rota própria,
  // app/api/webhooks/asaas-checkout/route.ts). O filtro por evento vem ANTES
  // de exigir `payment.id` de propósito: eventos de outro ciclo de vida
  // (CHECKOUT_CREATED, por exemplo) trafegam um objeto `checkout` e nenhum
  // `payment`, então cobrar `payment.id` deles devolvia 400 — a Asaas trata
  // 4xx como falha de entrega, penaliza o webhook e reenfileira um evento
  // que nunca vamos processar. Ignorar com 200 é a resposta correta.
  const isHandledEvent =
    REFUND_SYNC_EVENTS.has(payload.event) ||
    PAID_EVENTS.has(payload.event) ||
    EXPIRE_EVENTS.has(payload.event) ||
    RESTORE_EVENTS.has(payload.event) ||
    CHARGEBACK_EVENTS.has(payload.event)
  if (!isHandledEvent) {
    return NextResponse.json({ received: true, ignored: payload.event })
  }

  // Daqui pra baixo o evento é PAYMENT_*, que sempre traz `payment.id`.
  // Se não vier, aí sim é payload malformado de verdade.
  const paymentId = payload.payment?.id
  if (!paymentId) {
    console.error("[webhooks/asaas] evento de pagamento sem payment.id:", payload.event)
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

  if (EXPIRE_EVENTS.has(payload.event)) {
    try {
      // Mesma defesa em profundidade dos outros ramos: reconsulta a origem
      // antes de agir. Aqui ela também corrige um falso positivo real —
      // PAYMENT_OVERDUE é entregue com atraso e pode ser reentregue, então o
      // cliente pode já ter pago entre o vencimento e a chegada do evento.
      // Expirar por causa de um webhook atrasado devolveria ao estoque um
      // item que acabou de ser vendido.
      const verified = await getPayment(paymentId)

      const stillPayable =
        verified.status === "RECEIVED" ||
        verified.status === "CONFIRMED" ||
        verified.status === "RECEIVED_IN_CASH"
      if (stillPayable) {
        return NextResponse.json({ received: true, ignored: "already paid" })
      }

      // PAYMENT_DELETED só vale se a cobrança está mesmo removida na origem
      // (a Asaas devolve o objeto com `deleted: true`, não um 404).
      if (payload.event === "PAYMENT_DELETED" && verified.deleted === false) {
        return NextResponse.json({ received: true, ignored: "not deleted" })
      }

      const result = await expireOrderByPaymentId(paymentId)

      // Nenhum pedido `pending` casou: pode ser a taxa de anúncio do Mercado
      // (mesmo gateway, mesmo webhook) ou um pedido que já saiu de `pending`.
      // Nos dois casos não há nada a fazer — e não é erro.
      if (!result.expired) {
        return NextResponse.json({ received: true, ignored: "no pending order" })
      }

      console.warn(
        `[webhooks/asaas] pedido ${result.orderId} expirado por ${payload.event} (cobrança ${paymentId})`
      )
      return NextResponse.json({ received: true, orderId: result.orderId })
    } catch (err) {
      // 500 aqui seria pior que inação: a Asaas reentrega, e o cron de
      // expiração continua sendo a rede de segurança pra este pedido.
      console.error("[webhooks/asaas] expiração:", err)
      return NextResponse.json({ received: true })
    }
  }

  if (RESTORE_EVENTS.has(payload.event)) {
    try {
      const verified = await getPayment(paymentId)
      if (verified.deleted) {
        return NextResponse.json({ received: true, ignored: "still deleted" })
      }

      // Volta pra `pending` só o que ESTE fluxo expirou. O UPDATE condicional
      // vem ANTES de mexer no estoque, mesma ordem do cron de expiração: é
      // ele que resolve a corrida (o pedido pode ter sido pago ou cancelado
      // entre o SELECT e o UPDATE), e só as linhas realmente afetadas seguem
      // pro decremento. Fazer o inverso — reservar e depois tentar atualizar —
      // deixaria o estoque decrementado sem pedido correspondente se a
      // transição não acontecesse.
      const db = createSupabaseAdminClient()
      const { data: reopened } = await db
        .from("store_orders")
        .update({ status: "pending", updated_at: new Date().toISOString() })
        .eq("asaas_payment_id", paymentId)
        .eq("status", "expired")
        .select("id")

      for (const order of reopened ?? []) {
        // O estoque voltou ao inventário na expiração, então precisa ser
        // reservado de novo — e pode ter sido vendido nesse meio tempo,
        // exatamente o mesmo problema do pagamento atrasado. Reaproveitamos
        // `reReserveStockForLatePayment`, que sinaliza o pedido pra revisão
        // manual em vez de mentir sobre o inventário.
        const { restocked, oversoldItems } = await reReserveStockForLatePayment(order.id)
        if (restocked) continue

        // Sem estoque pra honrar o pedido: desfaz a reabertura em vez de
        // deixar um `pending` que a loja não consegue entregar. O pedido já
        // foi marcado pra revisão manual por `reReserveStockForLatePayment`.
        console.error(
          `[webhooks/asaas] pedido ${order.id} restaurado sem estoque para: ${oversoldItems.join(", ")}`
        )
        await db
          .from("store_orders")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("id", order.id)
          .eq("status", "pending")
      }

      return NextResponse.json({ received: true })
    } catch (err) {
      console.error("[webhooks/asaas] restauração:", err)
      return NextResponse.json({ received: true })
    }
  }

  if (CHARGEBACK_EVENTS.has(payload.event)) {
    try {
      // Status do pedido fica como está de propósito: chargeback é uma
      // disputa, não um estorno concluído — se a loja perder, a Asaas dispara
      // PAYMENT_REFUNDED e o fluxo de estorno existente cuida. O que não pode
      // é a disputa passar despercebida, então marcamos em `metadata` (mesma
      // coluna que o admin já carrega, sem migration) e notificamos o dono.
      const db = createSupabaseAdminClient()
      const { data: orders } = await db
        .from("store_orders")
        .select("id, metadata")
        .eq("asaas_payment_id", paymentId)

      for (const order of orders ?? []) {
        const metadata = (order.metadata ?? {}) as Record<string, unknown>
        await db
          .from("store_orders")
          .update({
            metadata: {
              ...metadata,
              chargeback: {
                event: payload.event,
                detected_at: new Date().toISOString(),
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", order.id)

        console.error(
          `[webhooks/asaas] CHARGEBACK ${payload.event} no pedido ${order.id} (cobrança ${paymentId}) — requer ação manual`
        )
      }

      return NextResponse.json({ received: true })
    } catch (err) {
      console.error("[webhooks/asaas] chargeback:", err)
      return NextResponse.json({ received: true })
    }
  }

  // Só resta PAID_EVENTS: o filtro lá em cima já descartou o resto, e os
  // blocos acima sempre retornam.
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
    // Status ANTES da transição: um pedido que já estava `expired` teve o
    // estoque devolvido pelo cron de expiração, e precisa reservá-lo de novo
    // agora que o pagamento entrou (senão a loja vende a mesma unidade duas
    // vezes). Lido antes do UPDATE porque depois dele a informação some.
    const { data: priorOrders } = await db
      .from("store_orders")
      .select("id, status")
      .eq("asaas_payment_id", paymentId)
    const wasExpired = new Set(
      (priorOrders ?? []).filter((o) => o.status === "expired").map((o) => o.id)
    )

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

    for (const order of updatedOrders ?? []) {
      if (!wasExpired.has(order.id)) continue
      try {
        await reReserveStockForLatePayment(order.id)
      } catch (err) {
        console.error("[webhooks/asaas] reReserveStockForLatePayment:", err)
      }
    }

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
