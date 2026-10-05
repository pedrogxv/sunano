import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { creditCommissionForOrder } from "@/lib/server/repositories/affiliates-repository"
import {
  orderOwnerId,
  reReserveStockForLatePayment,
  type ManualPaymentMethod,
  type OrderManualPayment,
  type OrderStatus,
} from "@/lib/server/repositories/orders-repository"
import { notifyOrderStatusChange } from "@/lib/server/repositories/notifications-repository"
import { notifyDiscordOrderEvent } from "@/lib/server/repositories/discord-orders-repository"
import { sendOrderEmail } from "@/lib/server/repositories/order-emails-repository"
import { openServiceOrderTicket } from "@/lib/server/repositories/support-repository"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
import type { OrderEventStatus } from "@/lib/server/integrations/discord-order-card"
import { formatBRL } from "@/lib/format"

/**
 * Só pedido que JÁ devolveu o estoque e cujo link do site não cobra mais.
 *
 * `pending` fica de fora de propósito: o checkout da Asaas desse pedido ainda
 * está pagável, e se o cliente pagar por lá depois do pagamento por fora, o
 * webhook não acha mais pedido para liberar (já está pago) e a segunda
 * cobrança passa em silêncio. O admin cancela antes, e aí cai aqui.
 */
const MANUAL_PAYABLE_STATUSES: OrderStatus[] = ["expired", "cancelled"]

const METHOD_LABEL: Record<ManualPaymentMethod, string> = {
  pix: "PIX",
  credit_card: "cartão",
}

export type RegisterManualPaymentResult =
  | { ok: true; status: OrderStatus; totalCents: number; manualPayment: OrderManualPayment }
  | { ok: false; error: string; status: number }

/**
 * Libera um pedido pago FORA do checkout do site (link avulso da Asaas, PIX
 * direto) — o caso do cartão recusado na página da Asaas e pago depois por
 * um link de cobrança gerado no painel. Nenhum webhook avisa o site desse
 * pagamento, então é o admin que registra.
 *
 * Faz o mesmo que o `CHECKOUT_PAID` de um pedido pago depois de expirar
 * (app/api/webhooks/asaas-checkout/route.ts): reserva o estoque de novo,
 * credita afiliado, notifica o dono, abre o chamado de serviço, manda o
 * e-mail de confirmado e avisa no Discord. Mudou a sequência lá? Mude aqui.
 *
 * `total_cents` passa a ser o valor recebido: o pedido de cartão nasce com o
 * preço do cartão, e pago no PIX por fora vale o preço do PIX. É esse número
 * que relatórios, comissão e a Aura da entrega leem.
 */
export async function registerManualPayment(
  id: string,
  params: { method: ManualPaymentMethod; amountCents: number; reference?: string },
  adminId: string
): Promise<RegisterManualPaymentResult> {
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_orders")
    .select("id, status, total_cents, pix_price_cents, payment_method, metadata")
    .eq("id", id)
    .maybeSingle()

  if (!existing) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }
  if (existing.payment_method === "aura") {
    return { ok: false, error: "Pedido de Aura não tem pagamento em dinheiro.", status: 400 }
  }
  if (existing.status === "pending") {
    return {
      ok: false,
      error:
        "O link de pagamento do site deste pedido ainda está ativo. Cancele o pedido antes de registrar um pagamento por fora, senão o cliente pode pagar duas vezes.",
      status: 400,
    }
  }
  if (!MANUAL_PAYABLE_STATUSES.includes(existing.status as OrderStatus)) {
    return { ok: false, error: "Este pedido já foi pago ou encerrado.", status: 400 }
  }

  // Pedido criado no PIX não tem `pix_price_cents` (o total já é o do PIX).
  const pixCents = existing.pix_price_cents ?? existing.total_cents
  const expectedCents = params.method === "pix" ? pixCents : existing.total_cents
  if (params.amountCents < expectedCents) {
    return {
      ok: false,
      error: `O valor recebido é menor que o do pedido no ${METHOD_LABEL[params.method]} (${formatBRL(expectedCents)}).`,
      status: 400,
    }
  }

  const manualPayment: OrderManualPayment = {
    method: params.method,
    amount_cents: params.amountCents,
    reference: params.reference?.trim() || null,
    registered_by: adminId,
    registered_at: new Date().toISOString(),
  }
  const metadata = (existing.metadata ?? {}) as Record<string, unknown>

  // Condicional no status: dois cliques (ou um webhook atrasado) não liberam
  // o pedido duas vezes. O trigger de etapa de entrega decide o status final
  // (pago sem endereço vira `awaiting_shipping_info`).
  const { data: updated, error } = await db
    .from("store_orders")
    .update({
      status: "paid",
      payment_method: params.method,
      total_cents: params.amountCents,
      updated_at: new Date().toISOString(),
      metadata: { ...metadata, manual_payment: manualPayment },
    })
    .eq("id", id)
    .in("status", MANUAL_PAYABLE_STATUSES)
    .select("id, affiliate_id, metadata, status, requires_shipping_address")
    .maybeSingle()

  if (error) {
    console.error("[order-manual-payment] update:", error)
    return { ok: false, error: "Não foi possível registrar o pagamento.", status: 500 }
  }
  if (!updated) {
    return { ok: false, error: "O pedido mudou de status. Recarregue a página e confira.", status: 409 }
  }

  // Expirado/cancelado já devolveu o estoque: sem reservar de novo, a loja
  // venderia a mesma unidade duas vezes.
  try {
    const { restocked, oversoldItems } = await reReserveStockForLatePayment(id)
    if (!restocked) {
      await notifyDiscordOrderEvent({
        orderId: id,
        status: "oversold",
        actor: "admin",
        note: `Sem estoque para: ${oversoldItems.join(", ")}`,
      })
    }
  } catch (err) {
    console.error("[order-manual-payment] reReserveStockForLatePayment:", err)
  }

  if (updated.affiliate_id) {
    try {
      await creditCommissionForOrder(id)
    } catch (err) {
      console.error("[order-manual-payment] creditCommissionForOrder:", err)
    }
  }

  const status = updated.status as OrderStatus
  const ownerId = orderOwnerId(updated.metadata as Record<string, unknown> | null)
  if (ownerId) {
    await notifyOrderStatusChange({
      userId: ownerId,
      orderId: id,
      status,
      requiresShipping: updated.requires_shipping_address !== false,
    })
  }

  await openServiceOrderTicket(id)
  await sendOrderEmail(id, "confirmed")

  await notifyDiscordOrderEvent({
    orderId: id,
    status: status as OrderEventStatus,
    actor: "admin",
    note: `Pagamento registrado à mão: ${formatBRL(params.amountCents)} no ${METHOD_LABEL[params.method]}${
      manualPayment.reference ? ` (ref. ${manualPayment.reference})` : ""
    }.`,
  })

  await logAdminAction({
    adminId,
    action: "order.manual_payment",
    entityType: "store_order",
    entityId: id,
    before: { status: existing.status, total_cents: existing.total_cents, payment_method: existing.payment_method },
    after: { status, total_cents: params.amountCents, payment_method: params.method, manual_payment: manualPayment },
  })

  return { ok: true, status, totalCents: params.amountCents, manualPayment }
}
