import "server-only"

import { randomUUID } from "crypto"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  createMercadoPagoCardOrder,
  getMercadoPagoOrder,
  MercadoPagoError,
  refundMercadoPagoOrder,
  type MercadoPagoOrderSnapshot,
} from "@/lib/server/integrations/mercadopago"
import { isUuid } from "@/lib/server/repositories/_shared"
import { patchOrderMetadata } from "@/lib/server/repositories/order-metadata-repository"
import { orderOwnerId } from "@/lib/server/repositories/orders-repository"
import { creditCommissionForOrder, syncCommissionForChargeback } from "@/lib/server/repositories/affiliates-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
import { sendOrderEmail } from "@/lib/server/repositories/order-emails-repository"
import { openServiceOrderTicket } from "@/lib/server/repositories/support-repository"
import { computeItemCardPriceCents } from "@/lib/store-pricing"
import { orderNumber } from "@/lib/order-number"
import type { OrderEventStatus } from "@/lib/server/integrations/discord-order-card"

/**
 * Pedidos da Loja cobrados no cartão pelo Mercado Pago (Orders API): criar a
 * order com o token do Brick e aplicar o resultado no pedido. Chamado pela
 * rota do cartão (`/api/store/orders/[id]/card-payment`, resposta síncrona) e
 * pelo webhook (`/api/webhooks/mercadopago`, rede de segurança) — os dois
 * passam pela MESMA `applyMercadoPagoOrder`, idempotente.
 *
 * "Order" aqui é a do Mercado Pago (`ORD…`), guardada na coluna
 * `store_orders.mercadopago_payment_id` (o nome vem da integração anterior,
 * pela Payments API; a coluna é texto e guarda o id que se consulta e estorna).
 *
 * Regra de ouro (igual Asaas e Stripe): nada é liberado nem devolvido pelo
 * corpo do evento. O webhook só traz o id; a order é sempre lida na origem.
 */

type OrderLine = {
  id?: string
  name?: string
  quantity?: number
  price_cents?: number
  single_price?: boolean
}

export type MercadoPagoCardOrderForOwner = {
  id: string
  status: string
  totalCents: number
  customerEmail: string | null
  customerName: string | null
  items: OrderLine[]
  cardSurchargePercent: number
}

/**
 * Pedido de cartão do Mercado Pago, só se for DO USUÁRIO. Mesma resposta
 * (null) para "não existe", "não é seu", "não é cartão" e "não é Mercado
 * Pago": a rota devolve 404 nos quatro.
 */
export async function getMercadoPagoCardOrderForOwner(
  orderId: string,
  userId: string
): Promise<MercadoPagoCardOrderForOwner | null> {
  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id, status, total_cents, payment_method, payment_gateway, customer_email, customer_name, items, card_surcharge_percent")
    .eq("id", orderId)
    .eq("metadata->>user_id", userId)
    .maybeSingle()

  if (!order || order.payment_method !== "credit_card" || order.payment_gateway !== "mercadopago") return null
  return {
    id: order.id,
    status: order.status,
    totalCents: order.total_cents,
    customerEmail: order.customer_email,
    customerName: order.customer_name,
    items: (order.items as OrderLine[] | null) ?? [],
    cardSurchargePercent: order.card_surcharge_percent ?? 0,
  }
}

export type MercadoPagoCardAttempt = {
  token: string
  paymentMethodId: string
  installments: number
  identification: { type: string; number: string } | null
}

export type MercadoPagoCardAttemptResult =
  | { outcome: "approved" }
  | { outcome: "declined"; statusDetail: string | null }
  /** Em análise no Mercado Pago: o webhook decide (`processed` libera, `failed` não). */
  | { outcome: "processing" }
  /** Aprovado, mas o pedido não podia mais receber (expirou no meio): devolvido. */
  | { outcome: "closed" }

/**
 * Cria o pagamento do pedido com o token do Brick e aplica o resultado na
 * hora. O valor é o do PEDIDO, nunca o que o navegador mandou.
 */
export async function payMercadoPagoCardOrder(
  order: MercadoPagoCardOrderForOwner,
  attempt: MercadoPagoCardAttempt
): Promise<MercadoPagoCardAttemptResult> {
  const nameParts = (order.customerName ?? "").trim().split(/\s+/).filter(Boolean)
  const email = order.customerEmail
  if (!email) throw new Error(`pedido ${order.id} sem e-mail do comprador`)

  const items = order.items.map((item, index) => ({
    id: item.id ?? String(index),
    title: item.name ?? "Item",
    quantity: item.quantity ?? 1,
    unitPriceCents: computeItemCardPriceCents(item.price_cents ?? 0, order.cardSurchargePercent, item.single_price === true),
  }))

  const mpOrder = await createMercadoPagoCardOrder({
    orderId: order.id,
    amountCents: order.totalCents,
    token: attempt.token,
    installments: attempt.installments,
    paymentMethodId: attempt.paymentMethodId,
    payer: {
      email,
      firstName: nameParts[0] ?? null,
      lastName: nameParts.length > 1 ? nameParts.slice(1).join(" ") : null,
      identification: attempt.identification,
    },
    description: `Pedido #${orderNumber(order.id)} - Sunano`,
    items,
    // Uma chave por tentativa: o token do Brick é de uso único, e repetir a
    // MESMA chave devolveria a recusa anterior em vez de tentar o cartão novo.
    // (A URL do webhook não vai na requisição: na Orders API ela fica só no painel.)
    idempotencyKey: `store-card-${order.id}-${randomUUID()}`,
  })
  if ("declined" in mpOrder) return { outcome: "declined", statusDetail: mpOrder.statusDetail }

  const applied = await applyMercadoPagoOrder(mpOrder, "checkout")
  if (mpOrder.status === "processed") return applied === "paid" || applied === "already" ? { outcome: "approved" } : { outcome: "closed" }
  // Sem `binary_mode` na Orders API: a order pode ficar em análise. O pedido
  // segue pendente segurando o estoque, e o webhook aplica o desfecho (uma
  // aprovação depois de o pedido expirar é devolvida em `applyMercadoPagoOrder`).
  if (mpOrder.status === "processing" || mpOrder.status === "action_required") return { outcome: "processing" }
  return { outcome: "declined", statusDetail: mpOrder.paymentStatusDetail ?? mpOrder.statusDetail }
}

/** O que `applyMercadoPagoOrder` fez — a rota do cartão decide a resposta por isto. */
export type ApplyMercadoPagoResult =
  | "paid"
  | "already"
  /** Aprovado para um pedido que não podia mais receber, ou valor divergente: devolvido. */
  | "returned"
  | "ignored"

/** Status em que o pedido já foi pago. */
const PAID_STATUSES = ["paid", "awaiting_shipping_info", "shipped", "delivered"]

/**
 * Aplica uma order do Mercado Pago no pedido dela (`external_reference`).
 * Idempotente: o UPDATE é condicional a `pending` e a `mercadopago_payment_id`
 * vazio, então a resposta síncrona e o webhook da mesma order só produzem
 * efeito uma vez.
 *
 * Order de TESTE nunca chega aqui em produção: `createMercadoPagoCardOrder` e
 * `getMercadoPagoOrder` conferem antes que a conta da credencial casa com
 * `MERCADOPAGO_ENV` (`assertAccountMatchesEnvironment`).
 */
export async function applyMercadoPagoOrder(
  mp: MercadoPagoOrderSnapshot,
  actor: "checkout" | "webhook-mercadopago"
): Promise<ApplyMercadoPagoResult> {
  const orderId = mp.externalReference
  if (!orderId || !isUuid(orderId)) return "ignored"

  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id, status, total_cents, refunded_cents, payment_gateway, mercadopago_payment_id")
    .eq("id", orderId)
    .maybeSingle()

  if (!order || order.payment_gateway !== "mercadopago") {
    console.warn(`[mercadopago-orders] order ${mp.id} aponta para ${orderId}, que não é pedido do Mercado Pago.`)
    return "ignored"
  }

  const webhookActor = "webhook-mercadopago" as const

  // Contestação: `charged_back` com o andamento no detalhe — `in_process`
  // (em disputa), `settled` (perdida, valor descontado) ou `reimbursed`
  // (ganha, valor devolvido à loja).
  if (mp.status === "charged_back") {
    if (order.mercadopago_payment_id !== mp.id) return "ignored"
    await patchOrderMetadata(order.id, {
      chargeback: {
        event: `mercadopago:charged_back:${mp.statusDetail ?? "?"}`,
        dispute_status: mp.statusDetail ?? mp.status,
        reason: mp.paymentStatusDetail ?? undefined,
        amount_cents: mp.amountCents,
        detected_at: new Date().toISOString(),
      },
    })
    if (mp.statusDetail === "settled") {
      try {
        await syncCommissionForChargeback(order.id)
      } catch (err) {
        console.error("[mercadopago-orders] syncCommissionForChargeback:", err)
      }
    }
    await notifyDiscordOrderEvent({
      orderId: order.id,
      status: "chargeback",
      actor: webhookActor,
      eventKey: `mp:charged_back:${mp.statusDetail ?? "?"}:${mp.id}`,
      note: `Mercado Pago: order ${mp.id} em CONTESTAÇÃO (${mp.statusDetail ?? "sem detalhe"}). Acompanhe no painel do Mercado Pago.`,
    })
    return "ignored"
  }

  if (mp.status === "refunded" || mp.statusDetail === "partially_refunded") {
    // Estorno feito pelo admin já gravou `refunded_cents`. Feito direto no
    // painel do Mercado Pago, o pedido segue "pago" aqui: avisa para conciliar.
    if (order.mercadopago_payment_id === mp.id && order.refunded_cents < mp.refundedCents) {
      await notifyDiscordOrderEvent({
        orderId: order.id,
        status: "payment_mismatch",
        actor: webhookActor,
        eventKey: `mp:refunded:${mp.id}`,
        note: `Mercado Pago estornou R$ ${(mp.refundedCents / 100).toFixed(2)} da order ${mp.id} por fora do admin. Registre o estorno no pedido.`,
      })
    }
    return "ignored"
  }

  if (mp.status !== "processed") return "ignored"
  if (order.mercadopago_payment_id === mp.id) return "already"

  const returnPayment = async (note: string, status: OrderEventStatus) => {
    try {
      await refundMercadoPagoOrder(mp.id, { idempotencyKey: `store-return-${mp.id}` })
    } catch (err) {
      console.error(`[mercadopago-orders] devolução de ${mp.id} falhou:`, err)
      note += " A DEVOLUÇÃO AUTOMÁTICA FALHOU: estorne no painel do Mercado Pago."
    }
    await notifyDiscordOrderEvent({ orderId: order.id, status, actor: webhookActor, eventKey: `mp:return:${mp.id}`, note })
    return "returned" as const
  }

  if ((mp.currency && mp.currency !== "BRL") || mp.amountCents < order.total_cents) {
    console.error(
      `[mercadopago-orders] valor divergente em ${mp.id}: ${mp.amountCents} ${mp.currency} vs total ${order.total_cents} do pedido ${order.id}.`
    )
    return returnPayment(
      `Mercado Pago aprovou R$ ${(mp.amountCents / 100).toFixed(2)} (${mp.currency ?? "BRL"}) para um pedido de R$ ${(order.total_cents / 100).toFixed(2)} — pagamento devolvido, pedido NÃO liberado.`,
      "payment_mismatch"
    )
  }

  const { data: updated } = await db
    .from("store_orders")
    .update({
      status: "paid",
      mercadopago_payment_id: mp.id,
      ...(mp.installments ? { installment_count: mp.installments } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", order.id)
    .eq("status", "pending")
    .is("mercadopago_payment_id", null)
    // `status` volta já decidido pelo trigger de etapa de entrega:
    // pago sem endereço é `awaiting_shipping_info`, não `paid`.
    .select("id, affiliate_id, metadata, status, requires_shipping_address")

  const paidOrder = updated?.[0]
  if (!paidOrder) {
    // O pedido saiu de pendente no meio (expirou, foi cancelado) ou já foi
    // pago por OUTRO pagamento. Diferente do PIX, o cartão não fica pendurado:
    // devolver é mais seguro que re-reservar um estoque que já voltou à
    // prateleira (e talvez já foi vendido).
    const { data: current } = await db.from("store_orders").select("status").eq("id", order.id).maybeSingle()
    const alreadyPaid = PAID_STATUSES.includes(current?.status ?? "")
    return returnPayment(
      alreadyPaid
        ? `Pagamento em DUPLICIDADE no Mercado Pago (${mp.id}) para um pedido já pago — devolvido automaticamente.`
        : `Cartão aprovado (${mp.id}) depois de o pedido sair de pendente (${current?.status ?? "?"}) — devolvido automaticamente.`,
      "payment_mismatch"
    )
  }

  if (paidOrder.affiliate_id) {
    try {
      await creditCommissionForOrder(paidOrder.id)
    } catch (err) {
      console.error("[mercadopago-orders] creditCommissionForOrder:", err)
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
    actor: actor === "checkout" ? "checkout" : webhookActor,
  })

  return "paid"
}

/** Webhook: lê a order na origem e aplica. */
export async function syncMercadoPagoOrder(orderId: string): Promise<void> {
  let mpOrder: MercadoPagoOrderSnapshot
  try {
    mpOrder = await getMercadoPagoOrder(orderId)
  } catch (err) {
    // 404: order de outra conta/ambiente (ex.: "Simular" do painel, que manda
    // um id fictício). Nada a fazer, e reentregar não muda.
    if (err instanceof MercadoPagoError && err.status === 404) return
    throw err
  }
  await applyMercadoPagoOrder(mpOrder, "webhook-mercadopago")
}
