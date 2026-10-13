import { NextRequest, NextResponse } from "next/server"
import {
  constructStripeEvent,
  getStripeDispute,
  getStripePayment,
  isStripeSandbox,
  type Stripe,
} from "@/lib/server/integrations/stripe"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  expirePendingOrderByGatewayRef,
  syncStripeOrderRefundState,
} from "@/lib/server/repositories/orders-repository"
import {
  handleStripeCardAuthorized,
  handleStripeEarlyFraudWarning,
  markStripeOrdersPaid,
} from "@/lib/server/repositories/stripe-orders-repository"
import { syncCommissionForChargeback } from "@/lib/server/repositories/affiliates-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"

export const runtime = "nodejs"
export const maxDuration = 20

/**
 * Webhook do Stripe — gateway ALTERNATIVO da Loja (`PAYMENT_GATEWAY=stripe`).
 *
 * Cadastrar no painel do Stripe (Desenvolvedores → Webhooks) apontando para
 * `/api/webhooks/stripe` com os eventos de `STRIPE_WEBHOOK_EVENTS`
 * (`lib/server/integrations/stripe.ts`); o "Signing secret" vai em `STRIPE_WEBHOOK_SECRET`.
 *
 * Mesma régua dos webhooks da Asaas:
 *   • a assinatura é conferida antes de qualquer coisa;
 *   • nada é liberado, capturado nem devolvido pelo corpo do evento — o
 *     pagamento é relido na origem (`getStripePayment`);
 *   • transições são condicionais (`status in (...)`), então reentrega e
 *     eventos fora de ordem não duplicam efeito.
 *
 * Ciclo do cartão (captura manual): `amount_capturable_updated` (autorizado
 * → captura, revisão ou recusa) → `succeeded` (capturado → pedido pago).
 * PIX: `succeeded` direto.
 */

/** Cartão autorizado e ainda não capturado. */
const AUTHORIZED_EVENT = "payment_intent.amount_capturable_updated"
/** Pago: PIX recebido ou cartão capturado. */
const PAID_EVENT = "payment_intent.succeeded"
/** PaymentIntent morto (cancelado pelo cron, pelo admin, ou autorização vencida). */
const CANCELED_EVENT = "payment_intent.canceled"
/**
 * Tentativa falhou. No PIX é como o Stripe avisa que o QR venceu; no CARTÃO é
 * só uma recusa, e a pessoa pode tentar outro cartão no mesmo pedido — por
 * isso o ramo olha o tipo antes de expirar qualquer coisa.
 */
const FAILED_EVENT = "payment_intent.payment_failed"

/** Estorno feito (ou mudado) — inclusive direto no painel do Stripe. */
const REFUND_EVENTS = new Set(["charge.refunded", "charge.refund.updated", "refund.updated", "refund.failed"])

/** Aviso precoce de fraude do emissor: estorna antes de virar disputa. */
const EARLY_FRAUD_WARNING_EVENT = "radar.early_fraud_warning.created"

/** Revisão do Radar aberta/fechada: só avisa — a captura já consulta `inRadarReview`. */
const REVIEW_EVENTS = new Set(["review.opened", "review.closed"])

/**
 * Disputa (chargeback). Abertura tira a comissão do afiliado; `funds_reinstated`
 * (a loja ganhou e o dinheiro voltou) devolve. Mesmo desenho do webhook Asaas.
 */
const DISPUTE_OPENED_EVENT = "charge.dispute.created"
const DISPUTE_REVERSED_EVENT = "charge.dispute.funds_reinstated"
const DISPUTE_EVENTS = new Set([
  DISPUTE_OPENED_EVENT,
  DISPUTE_REVERSED_EVENT,
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn",
])

function intentIdOf(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get("stripe-signature")
  if (!signature) {
    return NextResponse.json({ error: "Assinatura ausente" }, { status: 400 })
  }

  // A assinatura é sobre o corpo CRU: ler como JSON antes invalidaria a conferência.
  const rawBody = await request.text()

  let event: Stripe.Event
  try {
    event = constructStripeEvent(rawBody, signature)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    if (message.includes("não configurad")) {
      console.error("[webhooks/stripe]", message)
      return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 })
    }
    return NextResponse.json({ error: "Assinatura inválida" }, { status: 400 })
  }

  // Defesa em profundidade: evento de teste num deploy de produção (ou o
  // contrário) nunca mexe em pedido. A releitura na origem já falharia (o id
  // não existe no outro modo), mas aqui a recusa é explícita e sem retry.
  if (event.livemode !== !isStripeSandbox()) {
    console.error(`[webhooks/stripe] evento ${event.id} de outro modo (livemode=${event.livemode}) — ignorado.`)
    return NextResponse.json({ received: true, ignored: "mode mismatch" })
  }

  try {
    if (event.type === AUTHORIZED_EVENT) {
      await handleStripeCardAuthorized((event.data.object as Stripe.PaymentIntent).id)
      return NextResponse.json({ received: true })
    }

    if (event.type === PAID_EVENT) {
      await markStripeOrdersPaid((event.data.object as Stripe.PaymentIntent).id)
      return NextResponse.json({ received: true })
    }

    if (event.type === CANCELED_EVENT || event.type === FAILED_EVENT) {
      const intentId = (event.data.object as Stripe.PaymentIntent).id
      const verified = await getStripePayment(intentId)
      // Só expira com o PaymentIntent de fato morto: cancelado, ou PIX
      // vencido (volta a `requires_payment_method`). Cartão recusado também
      // volta a `requires_payment_method`, mas o pedido segue pagável.
      const pixExpired = verified.methodType === "pix" && verified.status === "requires_payment_method"
      if (verified.status !== "canceled" && !pixExpired) {
        return NextResponse.json({ received: true, ignored: verified.status })
      }
      const result = await expirePendingOrderByGatewayRef("stripe_payment_intent_id", intentId, "webhook-stripe")
      return NextResponse.json({ received: true, orderId: result.orderId })
    }

    if (REFUND_EVENTS.has(event.type)) {
      const object = event.data.object as Stripe.Charge | Stripe.Refund
      const intentId = intentIdOf(object.payment_intent)
      if (intentId) {
        const result = await syncStripeOrderRefundState(intentId)
        if (!result.ok && result.status !== 404 && result.status !== 400) {
          console.error("[webhooks/stripe] syncStripeOrderRefundState:", result.error)
        }
      }
      return NextResponse.json({ received: true })
    }

    if (event.type === EARLY_FRAUD_WARNING_EVENT) {
      const warning = event.data.object as Stripe.Radar.EarlyFraudWarning
      const intentId = intentIdOf(warning.payment_intent)
      if (intentId) await handleStripeEarlyFraudWarning(intentId, warning.actionable)
      return NextResponse.json({ received: true })
    }

    if (REVIEW_EVENTS.has(event.type)) {
      await handleReview(event.type, event.data.object as Stripe.Review)
      return NextResponse.json({ received: true })
    }

    if (DISPUTE_EVENTS.has(event.type)) {
      await handleDispute(event.type, event.data.object as Stripe.Dispute)
      return NextResponse.json({ received: true })
    }

    return NextResponse.json({ received: true, ignored: event.type })
  } catch (err) {
    // 500 faz o Stripe reentregar (com backoff, por até 3 dias). Todo ramo é
    // idempotente, então a reentrega é segura — e no pagamento é o que
    // garante que um erro passageiro não deixa um pedido pago como pendente.
    console.error(`[webhooks/stripe] ${event.type}:`, err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }
}

/**
 * Revisão do Radar. A decisão de captura já considera a revisão aberta
 * (`inRadarReview` em `decideCardCapture`); aqui só avisa no Discord para o
 * admin olhar o pedido — aprovar/recusar continua sendo no nosso admin.
 */
async function handleReview(eventType: string, review: Stripe.Review) {
  const intentId = intentIdOf(review.payment_intent)
  if (!intentId) return
  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id")
    .eq("stripe_payment_intent_id", intentId)
    .maybeSingle()
  if (!order) return
  await notifyDiscordOrderEvent({
    orderId: order.id,
    status: "payment_review",
    actor: "webhook-stripe",
    eventKey: `${eventType}:${review.id}`,
    note:
      eventType === "review.opened"
        ? `Radar abriu revisão (${review.reason}). Decida no admin do pedido.`
        : `Radar fechou a revisão (${review.closed_reason ?? review.reason}).`,
  })
}

/**
 * Disputa aberta não muda o status do pedido (quem decide é o admin); marca
 * no metadata, ajusta a comissão e avisa no Discord com o PRAZO de resposta —
 * sem resposta até `due_by` a loja perde por padrão. Disputa PERDIDA: o
 * Stripe já debitou o valor do saldo (sem gerar estorno), então o pedido é
 * reconciliado como estornado nesse valor.
 */
async function handleDispute(eventType: string, eventDispute: Stripe.Dispute) {
  const dispute = await getStripeDispute(eventDispute.id)
  const intentId = intentIdOf(dispute.payment_intent)
  if (!intentId) return

  const db = createSupabaseAdminClient()
  const { data: orders } = await db
    .from("store_orders")
    .select("id, metadata")
    .eq("stripe_payment_intent_id", intentId)

  const dueBy = dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000) : null

  for (const order of orders ?? []) {
    const metadata = (order.metadata ?? {}) as Record<string, unknown>
    await db
      .from("store_orders")
      .update({
        metadata: {
          ...metadata,
          chargeback: {
            event: eventType,
            dispute_id: dispute.id,
            dispute_status: dispute.status,
            reason: dispute.reason,
            amount_cents: dispute.amount,
            evidence_due_by: dueBy?.toISOString() ?? null,
            lost: dispute.status === "lost",
            detected_at: new Date().toISOString(),
          },
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)

    console.error(`[webhooks/stripe] DISPUTA ${eventType} no pedido ${order.id} (${intentId}) — requer ação manual`)

    // Perdida: o valor saiu do saldo para o cliente — reconcilia como
    // estorno (reverte Aura, medalhas e comissão; ver syncStripeOrderRefundState).
    if (dispute.status === "lost") {
      const result = await syncStripeOrderRefundState(intentId)
      if (!result.ok && result.status !== 404 && result.status !== 400) {
        throw new Error(`syncStripeOrderRefundState (disputa perdida): ${result.error}`)
      }
    }

    if (eventType === DISPUTE_OPENED_EVENT || eventType === DISPUTE_REVERSED_EVENT) {
      try {
        await syncCommissionForChargeback(order.id, { reversed: eventType === DISPUTE_REVERSED_EVENT })
      } catch (err) {
        console.error("[webhooks/stripe] syncCommissionForChargeback:", err)
      }
    }

    const due = dueBy ? ` · responder até ${dueBy.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}` : ""
    await notifyDiscordOrderEvent({
      orderId: order.id,
      status: "chargeback",
      actor: "webhook-stripe",
      eventKey: `${eventType}:${dispute.status}`,
      note: `Disputa Stripe ${dispute.status} (${dispute.reason}) · R$ ${(dispute.amount / 100).toFixed(2)}${due} · ${intentId}`,
    })
  }
}
