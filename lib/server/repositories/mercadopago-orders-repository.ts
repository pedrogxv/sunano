import "server-only"

import { randomUUID } from "crypto"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  cancelMercadoPagoOrder,
  createMercadoPagoCardOrder,
  getMercadoPagoOrder,
  isMercadoPagoAlreadyFinalError,
  MercadoPagoError,
  refundMercadoPagoOrder,
  type MercadoPagoOrderSnapshot,
} from "@/lib/server/integrations/mercadopago"
import { isUuid } from "@/lib/server/repositories/_shared"
import { patchOrderMetadata } from "@/lib/server/repositories/order-metadata-repository"
import { orderOwnerId, reReserveStockForLatePayment } from "@/lib/server/repositories/orders-repository"
import { creditCommissionForOrder, syncCommissionForChargeback } from "@/lib/server/repositories/affiliates-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
import { sendOrderEmail } from "@/lib/server/repositories/order-emails-repository"
import { openServiceOrderTicket } from "@/lib/server/repositories/support-repository"
import { computeItemCardPriceCents } from "@/lib/store-pricing"
import { orderNumber } from "@/lib/order-number"
import type { OrderEventStatus } from "@/lib/server/integrations/discord-order-card"

/**
 * Pedidos da Loja cobrados pelo Mercado Pago (Orders API), no cartão e no PIX.
 * Cartão: criar a order com o token do Brick e aplicar o resultado no pedido.
 * PIX: a order nasce no checkout e é aplicada quando paga (webhook ou a
 * conferência do polling em `/api/store/orders/[id]`). Chamado pela
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
  deviceId: string | null
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
    deviceId: attempt.deviceId,
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
    .select("id, status, total_cents, refunded_cents, payment_gateway, payment_method, mercadopago_payment_id")
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

  // PIX: a order é gravada no pedido JÁ NA CRIAÇÃO (é ela que o QR paga), então
  // coluna preenchida não quer dizer "pago" — quem diz é o status. No cartão a
  // coluna só é gravada na aprovação, e preenchida com a mesma order = já aplicado.
  const isPix = order.payment_method === "pix"
  if (order.mercadopago_payment_id === mp.id && (!isPix || PAID_STATUSES.includes(order.status))) return "already"

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

  // PIX de OUTRA order para este pedido (não deveria existir: o checkout cria
  // uma só). Devolve em vez de quitar com um pagamento que o pedido não conhece.
  if (isPix && order.mercadopago_payment_id && order.mercadopago_payment_id !== mp.id) {
    return returnPayment(
      `PIX pago na order ${mp.id}, mas o pedido está amarrado à order ${order.mercadopago_payment_id} — devolvido automaticamente.`,
      "payment_mismatch"
    )
  }

  // PIX pago depois de o pedido expirar também quita (igual Stripe e
  // InfinitePay): o cron cancela a order no Mercado Pago, mas o pagamento pode
  // ter entrado no mesmo instante. O estoque que o cron devolveu é retomado
  // abaixo. Cartão segue só de `pending` (ver o comentário do devolvido).
  // O UPDATE é condicional ao status LIDO: se o cron expirar o pedido entre a
  // leitura e o UPDATE, a segunda volta vê `expired`.
  const payableFrom = isPix ? ["pending", "expired"] : ["pending"]
  let fromStatus: string = order.status
  let boundOrderId: string | null = order.mercadopago_payment_id
  let paidOrder: {
    id: string
    affiliate_id: string | null
    metadata: unknown
    status: string
    requires_shipping_address: boolean | null
  } | null = null
  for (
    let attempt = 0;
    attempt < 2 && !paidOrder && payableFrom.includes(fromStatus) && (!boundOrderId || boundOrderId === mp.id);
    attempt++
  ) {
    let update = db
      .from("store_orders")
      .update({
        status: "paid",
        mercadopago_payment_id: mp.id,
        ...(mp.installments ? { installment_count: mp.installments } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("status", fromStatus as typeof order.status)
    // A order é a que o pedido conhece — ou nenhuma ainda (PIX aprovado antes
    // de o checkout gravar o QR, o que acontece no sandbox).
    update = boundOrderId
      ? update.eq("mercadopago_payment_id", mp.id)
      : update.is("mercadopago_payment_id", null)
    // `status` volta já decidido pelo trigger de etapa de entrega:
    // pago sem endereço é `awaiting_shipping_info`, não `paid`.
    const { data: updated } = await update.select("id, affiliate_id, metadata, status, requires_shipping_address")

    paidOrder = updated?.[0] ?? null
    if (!paidOrder) {
      const { data: current } = await db
        .from("store_orders")
        .select("status, mercadopago_payment_id")
        .eq("id", order.id)
        .maybeSingle()
      fromStatus = current?.status ?? "?"
      boundOrderId = current?.mercadopago_payment_id ?? null
    }
  }

  if (!paidOrder) {
    // O pedido saiu de pendente no meio (cancelado; no cartão, também
    // expirado) ou já foi pago por OUTRO pagamento. O cartão não fica
    // pendurado: devolver é mais seguro que re-reservar um estoque que já
    // voltou à prateleira (e talvez já foi vendido). O PIX expirado não chega
    // aqui: é quitado acima.
    const alreadyPaid = PAID_STATUSES.includes(fromStatus)
    return returnPayment(
      alreadyPaid
        ? `Pagamento em DUPLICIDADE no Mercado Pago (${mp.id}) para um pedido já pago — devolvido automaticamente.`
        : `${isPix ? "PIX pago" : "Cartão aprovado"} (${mp.id}) depois de o pedido sair de pendente (${fromStatus}) — devolvido automaticamente.`,
      "payment_mismatch"
    )
  }

  // PIX pago depois de expirar: o cron já devolveu as unidades à prateleira.
  if (fromStatus === "expired") {
    try {
      const { restocked, oversoldItems } = await reReserveStockForLatePayment(paidOrder.id)
      if (!restocked) {
        await notifyDiscordOrderEvent({
          orderId: paidOrder.id,
          status: "oversold",
          actor: webhookActor,
          note: `PIX pago no Mercado Pago depois de expirar, sem estoque para: ${oversoldItems.join(", ")}`,
        })
      }
    } catch (err) {
      console.error("[mercadopago-orders] reReserveStockForLatePayment:", err)
    }
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

/** Cancelamentos simultâneos no Mercado Pago: cabe nos 30 s do cron sem rajada. */
const CANCEL_BATCH_SIZE = 8

/**
 * Fecha no Mercado Pago o PIX de pedidos que acabaram de sair de `pending`
 * (expirados pelo cron, cancelados pelo cliente/admin, pagos por fora), para
 * o QR parar de aceitar pagamento. Nunca lança: order já finalizada é corrida
 * esperada, e um PIX que entrar mesmo assim é quitado ou devolvido por
 * `applyMercadoPagoOrder`.
 *
 * Recebe ids de PEDIDO (o retorno de `release_pending_store_orders` não traz
 * a coluna do Mercado Pago) e lê as orders em lote.
 */
export async function cancelMercadoPagoPixForOrders(storeOrderIds: string[]): Promise<void> {
  const ids = storeOrderIds.filter(isUuid)
  if (ids.length === 0) return
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_orders")
    .select("mercadopago_payment_id")
    .in("id", ids)
    .eq("payment_gateway", "mercadopago")
    .eq("payment_method", "pix")
    .not("mercadopago_payment_id", "is", null)
  if (error) {
    console.error("[mercadopago-orders] cancelMercadoPagoPixForOrders — leitura:", error)
    return
  }
  const mpOrderIds = (data ?? []).map((row) => row.mercadopago_payment_id).filter((id): id is string => Boolean(id))
  for (let start = 0; start < mpOrderIds.length; start += CANCEL_BATCH_SIZE) {
    const batch = mpOrderIds.slice(start, start + CANCEL_BATCH_SIZE)
    const results = await Promise.allSettled(batch.map((id) => cancelMercadoPagoOrder(id)))
    results.forEach((result, index) => {
      if (result.status === "fulfilled" || isMercadoPagoAlreadyFinalError(result.reason)) return
      console.error(`[mercadopago-orders] cancelar ${batch[index]} no Mercado Pago:`, result.reason)
    })
  }
}
