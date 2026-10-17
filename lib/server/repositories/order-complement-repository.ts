import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { deployChargesInSandbox } from "@/lib/server/payments/gateway"
import { logAdminAction } from "@/lib/server/repositories/store-admin-audit-repository"
import { patchOrderMetadata } from "@/lib/server/repositories/order-metadata-repository"
import { postAdminSupportReply } from "@/lib/server/repositories/support-repository"
import { findUserIdByDisplaySlug } from "@/lib/server/repositories/users-repository"
import { SITE_OWNER_SLUG } from "@/lib/special-tag"
// Só tipo: o repositório de pedidos importa este (resumo do complemento na listagem).
import type { RepositoryResult } from "@/lib/server/repositories/orders-repository"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { ORDER_PAID_STATUSES } from "@/lib/order-status"
import {
  COMPLEMENT_MAX_CENTS,
  COMPLEMENT_MIN_CENTS,
  COMPLEMENT_NOTE_MAX,
  complementPendingCents,
  complementProductHref,
  type OrderComplementSummary,
} from "@/lib/store-payment-complement"

/**
 * Complemento de Pagamento (ver lib/store-payment-complement.ts): busca do
 * pedido pelo número, valor que o checkout cobra e o valor que o admin grava.
 *
 * Tudo que diz "quanto falta" passa por `getComplementSummaries`. O pendente é
 * derivado dos pedidos de complemento (pagos menos o estornado), então um
 * estorno devolve o valor ao pendente sem ninguém mexer no pedido original.
 */

const PAID_STATUSES = ORDER_PAID_STATUSES as string[]

export type PaymentComplementProduct = { id: string; slug: string; name: string; image: string | null }

/** O anúncio ativo de complemento, ou null (desativado ou ainda sem migration). */
export async function getPaymentComplementProduct(): Promise<PaymentComplementProduct | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_products")
    .select("id, slug, name, images")
    .eq("is_payment_complement", true)
    .eq("is_active", true)
    .maybeSingle()
  if (error) {
    console.error("[order-complement] getPaymentComplementProduct:", error)
    return null
  }
  return data ? { id: data.id, slug: data.slug, name: data.name, image: data.images?.[0] ?? null } : null
}

type ComplementRow = {
  id: string
  complement_due_cents: number | null
  complement_note: string | null
}

/**
 * Situação do complemento de cada pedido, em lote (uma consulta para a página
 * inteira de Meus Pedidos ou da fila do admin).
 */
export async function getComplementSummaries(rows: ComplementRow[]): Promise<Map<string, OrderComplementSummary>> {
  const result = new Map<string, OrderComplementSummary>()
  const ids = rows.map((row) => row.id)
  const payments = new Map<string, { paidCents: number; awaitingPaymentOrderId: string | null }>()

  if (ids.length > 0) {
    const { data, error } = await createSupabaseAdminClient()
      .from("store_orders")
      .select("id, complement_for_order_id, status, total_cents, refunded_cents, created_at")
      .in("complement_for_order_id", ids)
      .in("status", [...ORDER_PAID_STATUSES, "pending"])
      .order("created_at", { ascending: true })
    if (error) console.error("[order-complement] getComplementSummaries:", error)

    for (const payment of data ?? []) {
      const targetId = payment.complement_for_order_id as string
      const entry = payments.get(targetId) ?? { paidCents: 0, awaitingPaymentOrderId: null }
      if (payment.status === "pending") {
        entry.awaitingPaymentOrderId = payment.id
      } else {
        entry.paidCents += Math.max(0, payment.total_cents - (payment.refunded_cents ?? 0))
      }
      payments.set(targetId, entry)
    }
  }

  for (const row of rows) {
    const payment = payments.get(row.id) ?? { paidCents: 0, awaitingPaymentOrderId: null }
    result.set(row.id, {
      dueCents: row.complement_due_cents,
      paidCents: payment.paidCents,
      pendingCents: complementPendingCents(row.complement_due_cents, payment.paidCents),
      note: row.complement_note,
      awaitingPaymentOrderId: payment.awaitingPaymentOrderId,
    })
  }
  return result
}

async function getComplementSummary(row: ComplementRow): Promise<OrderComplementSummary> {
  return (await getComplementSummaries([row])).get(row.id)!
}

export type ComplementLookup = {
  orderId: string
  number: string
  createdAt: string
  items: { name: string; quantity: number }[]
  /** O que já foi pago no pedido original (sem os complementos). */
  orderPaidCents: number
  complement: OrderComplementSummary
}

type LookupResult = { ok: true; lookup: ComplementLookup } | { ok: false; error: string; status: number }

const NOT_FOUND = "Não encontramos esse pedido na sua conta. Confira o número em Meus Pedidos."

/**
 * Pedido do cliente pelo número que ele digitou (`parseOrderNumberInput` já
 * garantiu os 8 hex). O número são os 8 primeiros caracteres do uuid, então
 * vira uma faixa de ids: filtro por intervalo, nunca texto no `.or()`.
 *
 * Mesma resposta para "não existe" e "não é seu".
 */
export async function findOrderForComplement(userId: string, number: string): Promise<LookupResult> {
  const prefix = number.toLowerCase()
  if (!/^[0-9a-f]{8}$/.test(prefix)) return { ok: false, error: NOT_FOUND, status: 404 }

  const { data, error } = await createSupabaseAdminClient()
    .from("store_orders")
    .select(
      "id, status, total_cents, refunded_cents, items, created_at, complement_due_cents, complement_note, complement_for_order_id"
    )
    .eq("metadata->>user_id", userId)
    .eq("is_sandbox", deployChargesInSandbox())
    .gte("id", `${prefix}-0000-0000-0000-000000000000`)
    .lte("id", `${prefix}-ffff-ffff-ffff-ffffffffffff`)
    .order("created_at", { ascending: false })
    .limit(1)
  if (error) {
    console.error("[order-complement] findOrderForComplement:", error)
    return { ok: false, error: "Não foi possível buscar o pedido. Tente novamente.", status: 500 }
  }

  const order = data?.[0]
  if (!order) return { ok: false, error: NOT_FOUND, status: 404 }
  if (order.complement_for_order_id) {
    return {
      ok: false,
      error: `Esse número é de um pagamento de complemento. Use o número do pedido original (#${orderNumber(order.complement_for_order_id)}).`,
      status: 400,
    }
  }
  if (!PAID_STATUSES.includes(order.status)) {
    return {
      ok: false,
      error:
        order.status === "pending"
          ? "Esse pedido ainda está aguardando pagamento. Pague o pedido primeiro; o complemento vem depois do orçamento."
          : "Esse pedido foi cancelado, expirou ou foi reembolsado e não aceita complemento.",
      status: 400,
    }
  }

  const items = ((order.items ?? []) as { name?: string; quantity?: number }[]).map((item) => ({
    name: item.name ?? "Item",
    quantity: item.quantity ?? 1,
  }))

  return {
    ok: true,
    lookup: {
      orderId: order.id,
      number: orderNumber(order.id),
      createdAt: order.created_at,
      items,
      orderPaidCents: Math.max(0, order.total_cents - (order.refunded_cents ?? 0)),
      complement: await getComplementSummary(order),
    },
  }
}

export type ComplementCharge =
  | { ok: true; targetOrderId: string; targetNumber: string; amountCents: number }
  | { ok: false; error: string; status: number }

/**
 * O que o checkout cobra no complemento do pedido `targetOrderId`: o pendente,
 * recalculado aqui. O corpo do checkout só diz QUAL pedido; o valor nunca.
 *
 * `sandbox` é o ambiente do gateway que vai cobrar: complemento de pedido de
 * teste não se paga com dinheiro de verdade, e vice-versa.
 */
export async function resolveComplementCharge(
  userId: string,
  targetOrderId: string,
  sandbox: boolean
): Promise<ComplementCharge> {
  const { data: order, error } = await createSupabaseAdminClient()
    .from("store_orders")
    .select("id, status, is_sandbox, complement_due_cents, complement_note, complement_for_order_id")
    .eq("id", targetOrderId)
    .eq("metadata->>user_id", userId)
    .maybeSingle()
  if (error) {
    console.error("[order-complement] resolveComplementCharge:", error)
    return { ok: false, error: "Não foi possível conferir o pedido. Tente novamente.", status: 500 }
  }
  if (!order || order.is_sandbox !== sandbox || order.complement_for_order_id) {
    return { ok: false, error: NOT_FOUND, status: 404 }
  }
  if (!PAID_STATUSES.includes(order.status)) {
    return { ok: false, error: "Esse pedido não aceita complemento.", status: 400 }
  }

  const summary = await getComplementSummary(order)
  if (summary.awaitingPaymentOrderId) {
    return {
      ok: false,
      error: `Você já gerou o pagamento deste complemento (pedido #${orderNumber(summary.awaitingPaymentOrderId)}). Pague ou cancele em Meus Pedidos antes de gerar outro.`,
      status: 409,
    }
  }
  if (summary.pendingCents <= 0) {
    return { ok: false, error: "Esse pedido não tem valor a complementar no momento.", status: 400 }
  }
  if (summary.pendingCents < COMPLEMENT_MIN_CENTS) {
    return {
      ok: false,
      error: `O valor pendente é menor que ${formatBRL(COMPLEMENT_MIN_CENTS)}. Fale com a equipe na conversa do pedido.`,
      status: 400,
    }
  }

  return { ok: true, targetOrderId: order.id, targetNumber: orderNumber(order.id), amountCents: summary.pendingCents }
}

/**
 * O admin grava o TOTAL cobrado de complemento num pedido (acumulado: um
 * segundo orçamento soma ao primeiro). Null limpa a cobrança.
 *
 * Recusa:
 * - pedido que não está pago (não há o que complementar num pedido sem
 *   pagamento) ou que já é um complemento;
 * - valor abaixo do que já foi pago, que deixaria um crédito sem dono;
 * - mudança com um complemento aguardando pagamento: ele foi gerado com o
 *   valor antigo e, pago, cobraria o número errado.
 *
 * Com a cobrança nova, a equipe avisa na conversa do pedido (quando há uma),
 * com o passo a passo de pagar. Best-effort: o valor já está gravado.
 */
export async function setOrderComplementDue(
  orderId: string,
  params: { dueCents: number | null; note: string | null },
  adminId: string
): Promise<RepositoryResult & { summary?: OrderComplementSummary }> {
  const dueCents = params.dueCents
  const note = params.note?.trim().slice(0, COMPLEMENT_NOTE_MAX) || null
  if (dueCents !== null && (!Number.isInteger(dueCents) || dueCents <= 0 || dueCents > COMPLEMENT_MAX_CENTS)) {
    return { ok: false, error: "Valor do complemento inválido.", status: 400 }
  }

  const db = createSupabaseAdminClient()
  const { data: order } = await db
    .from("store_orders")
    .select("id, status, metadata, complement_due_cents, complement_note, complement_for_order_id")
    .eq("id", orderId)
    .maybeSingle()
  if (!order) return { ok: false, error: "Pedido não encontrado.", status: 404 }
  if (order.complement_for_order_id) {
    return { ok: false, error: "Este pedido já é um pagamento de complemento.", status: 400 }
  }
  if (!PAID_STATUSES.includes(order.status)) {
    return { ok: false, error: "Só dá para cobrar complemento de um pedido pago.", status: 400 }
  }

  const before = await getComplementSummary(order)
  if (before.awaitingPaymentOrderId && dueCents !== before.dueCents) {
    return {
      ok: false,
      error: `O cliente já gerou o pagamento do complemento (pedido #${orderNumber(before.awaitingPaymentOrderId)}). Espere ele pagar ou cancele esse pedido antes de mudar o valor.`,
      status: 409,
    }
  }
  if ((dueCents ?? 0) < before.paidCents) {
    return {
      ok: false,
      error: `O cliente já pagou ${formatBRL(before.paidCents)} de complemento. O total cobrado não pode ficar abaixo disso.`,
      status: 400,
    }
  }
  const pendingAfter = complementPendingCents(dueCents, before.paidCents)
  if (pendingAfter > 0 && pendingAfter < COMPLEMENT_MIN_CENTS) {
    return {
      ok: false,
      error: `O valor pendente ficaria em ${formatBRL(pendingAfter)}. O mínimo cobrável é ${formatBRL(COMPLEMENT_MIN_CENTS)}.`,
      status: 400,
    }
  }

  if (dueCents === before.dueCents && note === before.note) return { ok: true, summary: before }

  const { error } = await db
    .from("store_orders")
    .update({ complement_due_cents: dueCents, complement_note: note })
    .eq("id", orderId)
  if (error) {
    console.error("[order-complement] setOrderComplementDue:", error)
    return { ok: false, error: "Não foi possível salvar o complemento.", status: 500 }
  }

  await logAdminAction({
    adminId,
    action: "order.complement_due",
    entityType: "store_order",
    entityId: orderId,
    before: { dueCents: before.dueCents, note: before.note },
    after: { dueCents, note },
  })

  const summary: OrderComplementSummary = {
    ...before,
    dueCents,
    note,
    pendingCents: pendingAfter,
  }

  // Aviso na conversa do pedido só quando surge (ou cresce) um valor a pagar.
  const metadata = (order.metadata ?? {}) as Record<string, unknown>
  const ticketId = typeof metadata.service_ticket_id === "string" ? metadata.service_ticket_id : null
  if (ticketId && pendingAfter > 0 && pendingAfter !== before.pendingCents) {
    const product = await getPaymentComplementProduct()
    const number = orderNumber(orderId)
    const body = [
      `Orçamento do pedido #${number}: falta pagar ${formatBRL(pendingAfter)}.`,
      note,
      [
        "Como pagar:",
        `1. Copie o número do pedido: ${number}`,
        `2. Abra o anúncio "Complemento de Pagamento" na Loja${product ? ` (${complementProductHref(product.slug, orderId)})` : ""}`,
        "3. Cole o número, confira o valor e pague no PIX ou no cartão.",
      ].join("\n"),
      "O passo a passo também aparece no seu pedido, em Meus Pedidos.",
    ]
      .filter(Boolean)
      .join("\n\n")
    const posted = await postAdminSupportReply({
      ticketId,
      adminId,
      adminName: "Equipe Sunano",
      body,
    })
    if (!posted.ok) console.error("[order-complement] aviso no chamado:", posted.error)
  }

  return { ok: true, summary }
}

/**
 * Pagamento de complemento confirmado: avisa na conversa do pedido ORIGINAL.
 * Chamado de `openServiceOrderTicket`, que é por onde os quatro caminhos de
 * pagamento (dois webhooks da Asaas, Stripe e pagamento manual) já passam.
 * O complemento não abre chamado próprio: a conversa é a do pedido.
 *
 * Best-effort e idempotente por `metadata.complement_notified_at`.
 */
export async function notifyComplementPaid(complementOrderId: string): Promise<void> {
  try {
    const db = createSupabaseAdminClient()
    const { data: payment } = await db
      .from("store_orders")
      .select("id, status, total_cents, metadata, complement_for_order_id")
      .eq("id", complementOrderId)
      .maybeSingle()
    if (!payment?.complement_for_order_id || !PAID_STATUSES.includes(payment.status)) return
    const paymentMetadata = (payment.metadata ?? {}) as Record<string, unknown>
    if (paymentMetadata.complement_notified_at) return

    const { data: target } = await db
      .from("store_orders")
      .select("id, metadata, complement_due_cents, complement_note")
      .eq("id", payment.complement_for_order_id)
      .maybeSingle()
    if (!target) return

    await patchOrderMetadata(payment.id, { complement_notified_at: new Date().toISOString() })

    const ticketId = (target.metadata as Record<string, unknown> | null)?.service_ticket_id
    if (typeof ticketId !== "string") return

    const summary = await getComplementSummary(target)
    const body = [
      `Recebemos ${formatBRL(payment.total_cents)} de complemento do pedido #${orderNumber(target.id)} (pagamento #${orderNumber(payment.id)}).`,
      summary.pendingCents > 0
        ? `Ainda falta ${formatBRL(summary.pendingCents)}.`
        : "O orçamento está quitado. A equipe segue com o seu pedido por aqui.",
    ].join("\n\n")

    // A mensagem sai em nome da conta do site, igual à abertura do chamado.
    // Sem ela, o aviso fica só no pedido.
    const senderId = await findUserIdByDisplaySlug(SITE_OWNER_SLUG)
    if (!senderId) return
    const posted = await postAdminSupportReply({ ticketId, adminId: senderId, adminName: "Equipe Sunano", body })
    if (!posted.ok) console.error("[order-complement] aviso de pagamento:", posted.error)
  } catch (err) {
    console.error("[order-complement] notifyComplementPaid:", err)
  }
}

