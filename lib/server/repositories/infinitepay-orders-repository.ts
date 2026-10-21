import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  checkInfinitePayPayment,
  isInfinitePayReference,
  type InfinitePayPaymentCheck,
} from "@/lib/server/integrations/infinitepay"
import { isUuid } from "@/lib/server/repositories/_shared"
import { patchOrderMetadata } from "@/lib/server/repositories/order-metadata-repository"
import { orderOwnerId, reReserveStockForLatePayment } from "@/lib/server/repositories/orders-repository"
import { creditCommissionForOrder } from "@/lib/server/repositories/affiliates-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
import { sendOrderEmail } from "@/lib/server/repositories/order-emails-repository"
import { openServiceOrderTicket } from "@/lib/server/repositories/support-repository"
import { formatBRL } from "@/lib/format"
import type { OrderEventStatus } from "@/lib/server/integrations/discord-order-card"

/**
 * Pedidos da Loja cobrados no cartão pela InfinitePay (checkout hospedado).
 *
 * Duas portas chegam aqui com a MESMA tripla (pedido, transação, fatura): o
 * retorno do cliente a `/checkout/card` (query string) e o webhook. Nenhuma
 * das duas é confiável — a API da InfinitePay não assina o webhook e a query
 * é do navegador —, então `applyInfinitePayPayment` só libera depois de
 * `payment_check` confirmar na origem. Idempotente: o UPDATE é condicional a
 * `pending` e a transação ainda não gravada, e a coluna da transação é única
 * (a mesma venda não quita dois pedidos).
 *
 * Sem estorno por API: pagamento que não pode quitar o pedido (valor menor,
 * pedido cancelado, duplicidade) NÃO é devolvido sozinho como no Mercado
 * Pago. Pedido EXPIRADO quita normalmente (o link não expira junto). Fica registrado no pedido e vai para o Discord para o estorno manual
 * no app da InfinitePay.
 */

const PAID_STATUSES = ["paid", "awaiting_shipping_info", "shipped", "delivered"]
/** Status de onde um pagamento confirmado ainda quita o pedido. */
const LATE_PAYABLE_STATUSES = ["pending", "expired"]

export type InfinitePayCardOrderForOwner = {
  id: string
  status: string
  totalCents: number
  checkoutUrl: string | null
}

/**
 * Pedido de cartão da InfinitePay, só se for DO USUÁRIO. "Não existe" e "não
 * é seu" dão o mesmo `null` (a rota responde 404 nos dois).
 */
export async function getInfinitePayCardOrderForOwner(
  orderId: string,
  userId: string
): Promise<InfinitePayCardOrderForOwner | null> {
  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id, status, total_cents, payment_method, payment_gateway, infinitepay_checkout_url")
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)
    .maybeSingle()

  if (!order || order.payment_method !== "credit_card" || order.payment_gateway !== "infinitepay") return null
  return {
    id: order.id,
    status: order.status,
    totalCents: order.total_cents,
    checkoutUrl: order.infinitepay_checkout_url,
  }
}

export type ApplyInfinitePayResult =
  | "paid"
  | "already"
  /** A InfinitePay não confirma (ainda) o pagamento desta tripla. */
  | "unconfirmed"
  /** Pago, mas não pôde quitar o pedido (valor, cancelado, duplicado): estorno manual avisado. */
  | "unapplied"
  | "ignored"

export type InfinitePayPaymentRef = {
  orderId: string
  transactionNsu: string
  slug: string
  receiptUrl?: string | null
}

/** Comprovante só se for link https da InfinitePay (vem de fora e é exibido no admin). */
function safeReceiptUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && /(^|\.)infinitepay\.io$/i.test(url.hostname) ? url.toString() : null
  } catch {
    return null
  }
}

export async function applyInfinitePayPayment(
  ref: InfinitePayPaymentRef,
  actor: "checkout" | "webhook-infinitepay"
): Promise<ApplyInfinitePayResult> {
  if (!isUuid(ref.orderId) || !isInfinitePayReference(ref.transactionNsu) || !isInfinitePayReference(ref.slug)) {
    return "ignored"
  }

  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id, status, total_cents, payment_gateway, infinitepay_transaction_nsu")
    .eq("id", ref.orderId)
    .maybeSingle()

  if (!order || order.payment_gateway !== "infinitepay") return "ignored"
  if (order.infinitepay_transaction_nsu === ref.transactionNsu) return "already"

  const check = await checkInfinitePayPayment({
    orderId: order.id,
    transactionNsu: ref.transactionNsu,
    slug: ref.slug,
  })
  if (!check?.paid) return "unconfirmed"

  const discordActor = actor === "checkout" ? "checkout" : ("webhook-infinitepay" as const)
  const receiptUrl = safeReceiptUrl(ref.receiptUrl)

  // Pagamento que existe na InfinitePay mas não quita este pedido: guarda no
  // pedido (o admin vê) e avisa para estornar no app.
  const leaveUnapplied = async (reason: string, status: OrderEventStatus) => {
    await patchOrderMetadata(order.id, {
      infinitepay_unapplied: {
        transaction_nsu: ref.transactionNsu,
        slug: ref.slug,
        receipt_url: receiptUrl,
        amount_cents: check.amountCents,
        paid_amount_cents: check.paidAmountCents,
        capture_method: check.captureMethod,
        reason,
        detected_at: new Date().toISOString(),
      },
    })
    await notifyDiscordOrderEvent({
      orderId: order.id,
      status,
      actor: discordActor,
      eventKey: `infinitepay:unapplied:${ref.transactionNsu}`,
      note: `${reason} ESTORNE MANUALMENTE no app da InfinitePay (transação ${ref.transactionNsu}${receiptUrl ? `, comprovante ${receiptUrl}` : ""}).`,
    })
    return "unapplied" as const
  }

  if (check.amountCents < order.total_cents) {
    console.error(
      `[infinitepay-orders] valor divergente em ${ref.transactionNsu}: ${check.amountCents} vs total ${order.total_cents} do pedido ${order.id}.`
    )
    return leaveUnapplied(
      `InfinitePay recebeu ${formatBRL(check.amountCents)} para um pedido de ${formatBRL(order.total_cents)}: pedido NÃO liberado.`,
      "payment_mismatch"
    )
  }

  // Pedido EXPIRADO também quita: o link da InfinitePay não expira junto com
  // o pedido e não há estorno por API, então recusar o pagamento tardio
  // empurrava todo cliente que pagou depois de 1h para um estorno manual. O
  // estoque que o cron devolveu é retomado abaixo (`reReserveStockForLatePayment`),
  // igual ao Stripe. `cancelled` continua recusado: alguém decidiu cancelar.
  //
  // O UPDATE é condicional ao status LIDO: se o cron expirar o pedido entre a
  // leitura e o UPDATE, a segunda volta vê `expired` e sabe que o estoque saiu.
  let fromStatus: string = order.status
  let paidOrder: {
    id: string
    affiliate_id: string | null
    metadata: unknown
    status: string
    requires_shipping_address: boolean | null
  } | null = null
  for (let attempt = 0; attempt < 2 && !paidOrder && LATE_PAYABLE_STATUSES.includes(fromStatus); attempt++) {
    const { data: updated, error: updateError } = await db
      .from("store_orders")
      .update({
        status: "paid",
        infinitepay_transaction_nsu: ref.transactionNsu,
        infinitepay_invoice_slug: ref.slug,
        infinitepay_receipt_url: receiptUrl,
        ...(check.installments ? { installment_count: check.installments } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", fromStatus as typeof order.status)
      .is("infinitepay_transaction_nsu", null)
      // `status` volta já decidido pelo trigger de etapa de entrega:
      // pago sem endereço é `awaiting_shipping_info`, não `paid`.
      .select("id, affiliate_id, metadata, status, requires_shipping_address")

    // 23505: esta transação já quitou OUTRO pedido (índice único). Não é
    // pagamento deste — alguém reaproveitou a referência.
    if (updateError?.code === "23505") {
      return leaveUnapplied(`Transação InfinitePay ${ref.transactionNsu} já quitou outro pedido.`, "payment_mismatch")
    }
    if (updateError) throw new Error(`infinitepay: falha ao marcar pedido ${order.id} como pago: ${updateError.message}`)

    paidOrder = updated?.[0] ?? null
    if (!paidOrder) {
      const { data: current } = await db.from("store_orders").select("status").eq("id", order.id).maybeSingle()
      fromStatus = current?.status ?? "?"
    }
  }

  if (!paidOrder) {
    // Cancelado, ou já pago por outra transação.
    const alreadyPaid = PAID_STATUSES.includes(fromStatus)
    return leaveUnapplied(
      alreadyPaid
        ? `Pagamento em DUPLICIDADE na InfinitePay para um pedido já pago.`
        : `Cartão aprovado na InfinitePay para um pedido ${fromStatus}: pedido NÃO liberado.`,
      "payment_mismatch"
    )
  }

  // Pago depois de expirar: o cron já devolveu as unidades à prateleira.
  if (fromStatus === "expired") {
    try {
      const { restocked, oversoldItems } = await reReserveStockForLatePayment(paidOrder.id)
      if (!restocked) {
        await notifyDiscordOrderEvent({
          orderId: paidOrder.id,
          status: "oversold",
          actor: discordActor,
          note: `Pago na InfinitePay depois de expirar, sem estoque para: ${oversoldItems.join(", ")}`,
        })
      }
    } catch (err) {
      console.error("[infinitepay-orders] reReserveStockForLatePayment:", err)
    }
  }

  await recordPaymentDetails(paidOrder.id, check)

  if (paidOrder.affiliate_id) {
    try {
      await creditCommissionForOrder(paidOrder.id)
    } catch (err) {
      console.error("[infinitepay-orders] creditCommissionForOrder:", err)
    }
  }

  const ownerId = orderOwnerId(paidOrder.metadata as Record<string, unknown> | null)
  if (ownerId) {
    await notifyOrderStatusChange({
      userId: ownerId,
      orderId: paidOrder.id,
      status: paidOrder.status,
      requiresShipping: paidOrder.requires_shipping_address !== false,
    })
  }

  await openServiceOrderTicket(paidOrder.id)
  await sendOrderEmail(paidOrder.id, "confirmed")
  await notifyDiscordOrderEvent({
    orderId: paidOrder.id,
    status: paidOrder.status as OrderEventStatus,
    actor: discordActor,
    // A página da InfinitePay também aceita PIX: o pedido nasceu "cartão",
    // mas o admin precisa saber como o dinheiro entrou.
    ...(check.captureMethod && check.captureMethod !== "credit_card"
      ? { note: `Pago na InfinitePay por ${check.captureMethod.toUpperCase()}, não cartão.` }
      : {}),
  })

  return "paid"
}

/**
 * Como foi pago, no metadata (falha aqui não desfaz o pagamento: o pedido já
 * está pago e as colunas principais gravadas).
 */
async function recordPaymentDetails(orderId: string, check: InfinitePayPaymentCheck) {
  try {
    await patchOrderMetadata(orderId, {
      infinitepay: {
        capture_method: check.captureMethod,
        amount_cents: check.amountCents,
        paid_amount_cents: check.paidAmountCents,
        installments: check.installments,
      },
    })
  } catch (err) {
    console.error("[infinitepay-orders] metadata do pagamento:", err)
  }
}
