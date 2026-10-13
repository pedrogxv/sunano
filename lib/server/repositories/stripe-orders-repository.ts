import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  cancelStripePayment,
  captureStripePayment,
  getStripePayment,
  isStripeAlreadyFinalError,
  refundStripePayment,
  type StripePaymentSnapshot,
} from "@/lib/server/integrations/stripe"
import { decideCardCapture } from "@/lib/server/payments/card-capture-policy"
import {
  expirePendingOrderByGatewayRef,
  orderOwnerId,
  reReserveStockForLatePayment,
  refundOrder,
} from "@/lib/server/repositories/orders-repository"
import { creditCommissionForOrder } from "@/lib/server/repositories/affiliates-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
import { sendOrderEmail } from "@/lib/server/repositories/order-emails-repository"
import { openServiceOrderTicket } from "@/lib/server/repositories/support-repository"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
import type { OrderEventStatus } from "@/lib/server/integrations/discord-order-card"

/**
 * Pedidos da Loja cobrados pelo Stripe: o que cada evento do gateway faz no
 * pedido. Chamado pelo webhook (`/api/webhooks/stripe`) e pela aprovação de
 * revisão no admin — os dois caminhos que capturam um cartão passam pela
 * MESMA função, para a regra de captura não divergir.
 *
 * Regra de ouro (igual aos webhooks da Asaas): nada é liberado, capturado ou
 * devolvido pelo corpo do evento. Sempre `getStripePayment` na origem antes.
 */

type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

/** Status em que o pedido já foi pago (o cartão foi capturado). */
const PAID_STATUSES = ["paid", "awaiting_shipping_info", "shipped", "delivered"]
/** Pago e ainda NÃO despachado: dá para estornar antes de o produto sair. */
const NOT_SHIPPED_PAID_STATUSES = ["paid", "awaiting_shipping_info"]

/**
 * Validade que damos a um pedido em revisão. A autorização de cartão vive ~7
 * dias no Stripe; 6 dias deixa margem para o admin decidir antes de ela
 * cair sozinha (aí chega `payment_intent.canceled` e o pedido expira).
 */
const REVIEW_HOLD_MS = 6 * 24 * 60 * 60 * 1000

type CardReviewMetadata = {
  reason: string
  risk_level: string | null
  three_d_secure: string | null
  held_at: string
  approved_by?: string
  approved_at?: string
}

function metadataOf(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {}
}

/** Pedido pendente segurado para revisão manual do cartão (o admin decide). */
export function orderCardReview(metadata: unknown): CardReviewMetadata | null {
  const review = metadataOf(metadata).card_review
  if (!review || typeof review !== "object") return null
  const value = review as CardReviewMetadata
  return value.approved_at ? null : value
}

/** Solta a autorização / cancela a cobrança; "já finalizado" não é erro. */
async function releaseStripePayment(paymentIntentId: string): Promise<void> {
  try {
    await cancelStripePayment(paymentIntentId)
  } catch (err) {
    if (!isStripeAlreadyFinalError(err)) throw err
  }
}

// ---------------------------------------------------------------------------
// Pagamento confirmado (PIX pago, cartão capturado)
// ---------------------------------------------------------------------------

/**
 * Libera os pedidos ligados a uma cobrança do Stripe, depois de conferir na
 * origem status, moeda e VALOR. Espelha o ramo de pagamento dos webhooks da
 * Asaas, efeito por efeito. Idempotente: o UPDATE é condicional ao status,
 * então reentrega e chamada dupla (captura + `payment_intent.succeeded`)
 * só produzem efeito uma vez.
 */
export async function markStripeOrdersPaid(
  paymentIntentId: string,
  verifiedSnapshot?: StripePaymentSnapshot
): Promise<void> {
  const db = createSupabaseAdminClient()
  const verified = verifiedSnapshot ?? (await getStripePayment(paymentIntentId))

  if (verified.status !== "succeeded" || verified.currency !== "brl") {
    console.warn(
      `[stripe-orders] pagamento ${paymentIntentId} não confirmado na origem (${verified.status}/${verified.currency}).`
    )
    return
  }

  const { data: priorOrders } = await db
    .from("store_orders")
    .select("id, status, total_cents, metadata")
    .eq("stripe_payment_intent_id", paymentIntentId)

  // Pedido já pago POR FORA (registro manual no admin): esta cobrança é
  // pagamento em duplicidade — o cron/cancelamento devia ter matado o PIX e
  // falhou. Sem isto o dinheiro entrava em silêncio, sem pedido nem alerta.
  // Devolve inteiro (o pedido já está quitado) e avisa.
  const duplicates = (priorOrders ?? []).filter(
    (order) => metadataOf(order.metadata).manual_payment && verified.refundedCents < verified.amountReceivedCents
  )
  for (const order of duplicates) {
    try {
      await refundStripePayment(paymentIntentId, {
        reason: "Pagamento em duplicidade: pedido já quitado por fora.",
        stripeReason: "duplicate",
        idempotencyKey: `store-duplicate-${paymentIntentId}`,
      })
    } catch (err) {
      console.error(`[stripe-orders] estorno de duplicidade ${paymentIntentId} falhou:`, err)
    }
    await notifyDiscordOrderEvent({
      orderId: order.id,
      status: "payment_mismatch",
      actor: "webhook-stripe",
      eventKey: `duplicate:${paymentIntentId}`,
      note: `Pagamento em DUPLICIDADE no Stripe (${paymentIntentId}, R$ ${(verified.amountReceivedCents / 100).toFixed(2)}) para um pedido já pago por fora — estorno automático solicitado. Confira no painel.`,
    })
  }
  if (duplicates.length > 0) return

  const paidCents = verified.amountReceivedCents
  const underpaid = (priorOrders ?? []).filter((order) => paidCents < order.total_cents)
  for (const order of underpaid) {
    console.error(
      `[stripe-orders] valor divergente em ${paymentIntentId}: pago ${paidCents} vs total ${order.total_cents} do pedido ${order.id} — pedido NÃO liberado.`
    )
    await notifyDiscordOrderEvent({
      orderId: order.id,
      status: "payment_mismatch",
      actor: "webhook-stripe",
      note: `Stripe confirmou R$ ${(paidCents / 100).toFixed(2)} para um pedido de R$ ${(order.total_cents / 100).toFixed(2)} (${paymentIntentId}).`,
    })
  }

  const underpaidIds = new Set(underpaid.map((order) => order.id))
  const payableIds = (priorOrders ?? []).filter((order) => !underpaidIds.has(order.id)).map((order) => order.id)
  // Expirado/cancelado já devolveu o estoque: o pagamento tardio precisa
  // reservá-lo de novo (ou o pedido vai para revisão manual). No cartão isso
  // quase não acontece — autorização tardia é solta, não capturada (ver
  // `handleStripeCardAuthorized`) —, mas o PIX não tem captura manual.
  const stockWasReturned = new Set(
    (priorOrders ?? []).filter((o) => o.status === "expired" || o.status === "cancelled").map((o) => o.id)
  )

  const updatedOrders =
    payableIds.length === 0
      ? []
      : ((
          await db
            .from("store_orders")
            .update({
              status: "paid",
              ...(verified.installmentCount ? { installment_count: verified.installmentCount } : {}),
              updated_at: new Date().toISOString(),
            })
            .eq("stripe_payment_intent_id", paymentIntentId)
            .in("id", payableIds)
            .in("status", ["pending", "expired", "cancelled"])
            // `status` volta já decidido pelo trigger de etapa de entrega:
            // pago sem endereço é `awaiting_shipping_info`, não `paid`.
            .select("id, affiliate_id, metadata, status, requires_shipping_address")
        ).data ?? [])

  // Comprovante do Stripe: vai no metadata para as telas de pedido e o
  // e-mail o mostrarem sem coluna nova (ver `orderStripeReceiptUrl`).
  if (verified.receiptUrl) {
    for (const order of updatedOrders) {
      await db
        .from("store_orders")
        .update({ metadata: { ...metadataOf(order.metadata), stripe_receipt_url: verified.receiptUrl } })
        .eq("id", order.id)
    }
  }

  for (const order of updatedOrders) {
    if (!stockWasReturned.has(order.id)) continue
    try {
      const { restocked, oversoldItems } = await reReserveStockForLatePayment(order.id)
      if (restocked) continue
      await notifyDiscordOrderEvent({
        orderId: order.id,
        status: "oversold",
        actor: "webhook-stripe",
        note: `Sem estoque para: ${oversoldItems.join(", ")}`,
      })
    } catch (err) {
      console.error("[stripe-orders] reReserveStockForLatePayment:", err)
    }
  }

  for (const order of updatedOrders) {
    if (!order.affiliate_id) continue
    try {
      await creditCommissionForOrder(order.id)
    } catch (err) {
      console.error("[stripe-orders] creditCommissionForOrder:", err)
    }
  }

  for (const order of updatedOrders) {
    const ownerId = orderOwnerId(order.metadata as Record<string, unknown> | null)
    if (!ownerId) continue
    await notifyOrderStatusChange({
      userId: ownerId,
      orderId: order.id,
      status: order.status,
      requiresShipping: order.requires_shipping_address !== false,
    })
  }

  for (const order of updatedOrders) {
    await openServiceOrderTicket(order.id)
  }

  for (const order of updatedOrders) {
    await sendOrderEmail(order.id, "confirmed")
  }

  for (const order of updatedOrders) {
    await notifyDiscordOrderEvent({
      orderId: order.id,
      status: order.status as OrderEventStatus,
      actor: "webhook-stripe",
    })
  }
}

// ---------------------------------------------------------------------------
// Cartão autorizado (captura manual)
// ---------------------------------------------------------------------------

/**
 * `payment_intent.amount_capturable_updated`: o cartão foi autorizado e o
 * dinheiro está SEGURADO, não cobrado. Aqui se decide o destino:
 *
 *   1. sem pedido / valor ou moeda divergente → solta a autorização;
 *   2. pedido não está mais pendente (expirou, foi cancelado) → solta. Pagar
 *      um pedido morto obrigaria a re-reservar estoque que talvez já foi
 *      vendido; com captura manual dá para simplesmente não cobrar;
 *   3. `decideCardCapture`: rejeita, segura para revisão ou captura.
 */
export async function handleStripeCardAuthorized(paymentIntentId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const verified = await getStripePayment(paymentIntentId)
  if (verified.status !== "requires_capture") return

  const { data: order } = await db
    .from("store_orders")
    .select("id, status, total_cents, metadata")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()

  if (!order) {
    // Pedido não chegou a ser gravado (o checkout já tenta cancelar a
    // cobrança nesse caso). Autorização sem pedido nunca é capturada.
    console.error(`[stripe-orders] autorização ${paymentIntentId} sem pedido — soltando.`)
    await releaseStripePayment(paymentIntentId)
    return
  }

  if (verified.currency !== "brl" || verified.amountCapturableCents < order.total_cents) {
    await releaseStripePayment(paymentIntentId)
    await notifyDiscordOrderEvent({
      orderId: order.id,
      status: "payment_mismatch",
      actor: "webhook-stripe",
      note: `Autorização de ${(verified.amountCapturableCents / 100).toFixed(2)} ${verified.currency.toUpperCase()} para um pedido de R$ ${(order.total_cents / 100).toFixed(2)} — autorização solta.`,
    })
    await expirePendingOrderByGatewayRef("stripe_payment_intent_id", paymentIntentId, "webhook-stripe")
    return
  }

  if (order.status !== "pending") {
    console.warn(`[stripe-orders] autorização tardia ${paymentIntentId} (pedido ${order.id} está ${order.status}) — soltando.`)
    await releaseStripePayment(paymentIntentId)
    return
  }

  // Já está em revisão (reentrega do evento): quem decide agora é o admin.
  if (orderCardReview(order.metadata)) return

  const decision = decideCardCapture({
    amountCents: order.total_cents,
    riskLevel: verified.riskLevel,
    threeDSecureResult: verified.threeDSecureResult,
    inRadarReview: verified.inRadarReview,
  })

  if (decision.action === "reject") {
    await releaseStripePayment(paymentIntentId)
    await expirePendingOrderByGatewayRef("stripe_payment_intent_id", paymentIntentId, "webhook-stripe")
    await notifyDiscordOrderEvent({
      orderId: order.id,
      status: "fraud_warning",
      actor: "webhook-stripe",
      eventKey: `rejected:${paymentIntentId}`,
      note: `Cartão recusado pela loja antes da captura: ${decision.reason}`,
    })
    return
  }

  if (decision.action === "review") {
    const review: CardReviewMetadata = {
      reason: decision.reason,
      risk_level: verified.riskLevel,
      three_d_secure: verified.threeDSecureResult,
      held_at: new Date().toISOString(),
    }
    const { data: held } = await db
      .from("store_orders")
      .update({
        metadata: { ...metadataOf(order.metadata), card_review: review },
        // Fora do alcance do cron de expiração enquanto o admin decide.
        pix_expires_at: new Date(Date.now() + REVIEW_HOLD_MS).toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle()

    if (!held) {
      // O pedido saiu de pendente entre a leitura e o UPDATE (cron/cancelamento).
      await releaseStripePayment(paymentIntentId)
      return
    }

    await notifyDiscordOrderEvent({
      orderId: order.id,
      status: "payment_review",
      actor: "webhook-stripe",
      eventKey: `review:${paymentIntentId}`,
      note: `${decision.reason} Risco: ${verified.riskLevel ?? "?"} · 3DS: ${verified.threeDSecureResult ?? "não houve"}.`,
    })
    return
  }

  await captureAndRelease(paymentIntentId)
}

/** Captura e libera o pedido na hora, sem esperar o `payment_intent.succeeded`. */
async function captureAndRelease(paymentIntentId: string): Promise<void> {
  await captureStripePayment(paymentIntentId)
  // O `payment_intent.succeeded` também chama isto; o UPDATE condicional
  // garante efeito único. Liberar aqui encurta a espera da tela do cliente.
  await markStripeOrdersPaid(paymentIntentId)
}

/**
 * Admin aprovou um cartão segurado para revisão: captura e libera o pedido.
 * Recusar é o "Cancelar pedido" de sempre (`cancelOrder`), que cancela o
 * PaymentIntent e com isso solta a autorização.
 */
export async function approveStripeCardReview(orderId: string, adminId: string): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id, status, total_cents, metadata, stripe_payment_intent_id")
    .eq("id", orderId)
    .maybeSingle()

  if (!order || !order.stripe_payment_intent_id) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }
  const review = orderCardReview(order.metadata)
  if (order.status !== "pending" || !review) {
    return { ok: false, error: "Este pedido não está aguardando revisão de pagamento.", status: 400 }
  }

  const verified = await getStripePayment(order.stripe_payment_intent_id)
  if (verified.status !== "requires_capture") {
    return {
      ok: false,
      error: `A autorização não está mais disponível no Stripe (status: ${verified.status}).`,
      status: 409,
    }
  }
  if (verified.currency !== "brl" || verified.amountCapturableCents < order.total_cents) {
    return { ok: false, error: "O valor autorizado não cobre o pedido.", status: 409 }
  }

  await db
    .from("store_orders")
    .update({
      metadata: {
        ...metadataOf(order.metadata),
        card_review: { ...review, approved_by: adminId, approved_at: new Date().toISOString() },
      },
    })
    .eq("id", order.id)

  try {
    await captureAndRelease(order.stripe_payment_intent_id)
  } catch (err) {
    console.error("[stripe-orders] approveStripeCardReview — captura:", err)
    return { ok: false, error: "O Stripe recusou a captura. Confira o pagamento no painel do Stripe.", status: 502 }
  }

  await logAdminAction({
    adminId,
    action: "order.card_review_approve",
    entityType: "store_order",
    entityId: order.id,
    before: { status: order.status, card_review: review },
    after: { captured: true },
  })

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Fraude
// ---------------------------------------------------------------------------

/**
 * `radar.early_fraud_warning.created`: o emissor avisou que a compra pode ser
 * fraude — quase sempre vira disputa semanas depois. Estornar ANTES evita a
 * disputa (e a taxa dela) e conta a favor da conta no programa de
 * monitoramento das bandeiras.
 *
 *   • pendente (só autorizado)   → solta a autorização e expira o pedido;
 *   • pago e NÃO enviado         → estorno integral automático (`fraudulent`);
 *   • já enviado                 → não estorna sozinho (o produto saiu):
 *                                   marca e avisa para tentar segurar a entrega.
 */
export async function handleStripeEarlyFraudWarning(paymentIntentId: string, actionable: boolean): Promise<void> {
  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id, status, total_cents, refunded_cents, metadata")
    .eq("stripe_payment_intent_id", paymentIntentId)
    .maybeSingle()
  if (!order) return

  const metadata = metadataOf(order.metadata)
  await db
    .from("store_orders")
    .update({
      metadata: { ...metadata, fraud_warning: { actionable, detected_at: new Date().toISOString() } },
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)

  let outcome: string
  if (order.status === "pending") {
    await releaseStripePayment(paymentIntentId)
    await expirePendingOrderByGatewayRef("stripe_payment_intent_id", paymentIntentId, "webhook-stripe")
    outcome = "Autorização solta e pedido expirado; nada foi cobrado."
  } else if (actionable && NOT_SHIPPED_PAID_STATUSES.includes(order.status) && order.refunded_cents < order.total_cents) {
    const refund = await refundOrder(
      order.id,
      { reason: "Estorno automático: aviso de fraude do emissor (early fraud warning).", fraudulent: true },
      null
    )
    outcome = refund.ok ? "Pedido ainda não enviado: estornado automaticamente." : `Estorno automático FALHOU: ${refund.error}`
  } else if (PAID_STATUSES.includes(order.status)) {
    outcome = "Pedido já enviado ou aviso não acionável: nada foi estornado. Ação manual."
  } else {
    outcome = `Pedido em status ${order.status}: nada a fazer.`
  }

  await notifyDiscordOrderEvent({
    orderId: order.id,
    status: "fraud_warning",
    actor: "webhook-stripe",
    eventKey: `efw:${paymentIntentId}`,
    note: outcome,
  })
}

// ---------------------------------------------------------------------------
// Tela de cartão (`/checkout/card`)
// ---------------------------------------------------------------------------

export type StripeCardOrderForOwner = {
  id: string
  status: string
  totalCents: number
  paymentIntentId: string
  inReview: boolean
}

/**
 * Pedido de cartão do Stripe, só se for DO USUÁRIO. Mesma resposta (null)
 * para "não existe", "não é seu", "não é cartão" e "não é Stripe": a rota
 * devolve 404 nos quatro, sem confirmar a existência de pedido alheio.
 */
export async function getStripeCardOrderForOwner(
  orderId: string,
  userId: string
): Promise<StripeCardOrderForOwner | null> {
  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id, status, total_cents, payment_method, stripe_payment_intent_id, metadata")
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)
    .maybeSingle()

  if (!order || order.payment_method !== "credit_card" || !order.stripe_payment_intent_id) return null
  return {
    id: order.id,
    status: order.status,
    totalCents: order.total_cents,
    paymentIntentId: order.stripe_payment_intent_id,
    inReview: orderCardReview(order.metadata) !== null,
  }
}
