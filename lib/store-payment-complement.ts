/**
 * Complemento de Pagamento.
 *
 * Serviço como o Xianyu Express e a consulta Expert Buy é vendido pelo valor
 * da CONSULTA (R$ 6): o preço do produto que o cliente quer só existe depois
 * do orçamento. O admin grava no pedido quanto falta (`complement_due_cents`),
 * e o cliente paga pelo anúncio "Complemento de Pagamento" digitando o número
 * do pedido. Vale para qualquer pedido do site, não só serviço.
 *
 * O valor NUNCA vem do cliente: o checkout recalcula o pendente do pedido no
 * servidor, igual faz com o preço de qualquer produto. O pagamento vira um
 * pedido próprio (`complement_for_order_id` aponta o original), então passa
 * pelos mesmos webhooks, estorno e painel de qualquer compra; o pendente é
 * derivado desses pedidos, não um contador que alguém precisa lembrar de
 * atualizar.
 *
 * Módulo puro: página do anúncio, checkout, Meus Pedidos e admin leem daqui.
 */

import { orderNumber } from "@/lib/order-number"

/**
 * Menor complemento cobrável. A Asaas recusa cobrança abaixo de R$ 5, e um
 * pendente menor do que isso não teria como ser pago pelo anúncio.
 */
export const COMPLEMENT_MIN_CENTS = 500

/** Teto de segurança contra um zero a mais digitado no painel. */
export const COMPLEMENT_MAX_CENTS = 5_000_000

export const COMPLEMENT_NOTE_MAX = 300

/** Parâmetro da página do anúncio que já abre com o número preenchido. */
export const COMPLEMENT_ORDER_QUERY_PARAM = "pedido"

/** Parâmetro do checkout que troca o carrinho pelo complemento de um pedido. */
export const COMPLEMENT_CHECKOUT_PARAM = "complemento"

/**
 * O que um pedido deve de complemento. `dueCents` é o TOTAL cobrado pelo
 * admin (acumulado); `paidCents` soma os complementos pagos, já descontado o
 * que foi estornado. Null em `dueCents` = nada cobrado.
 */
export type OrderComplementSummary = {
  dueCents: number | null
  paidCents: number
  pendingCents: number
  note: string | null
  /** Complemento já gerado e aguardando pagamento (PIX aberto, cartão em andamento). */
  awaitingPaymentOrderId: string | null
}

export function complementPendingCents(dueCents: number | null, paidCents: number): number {
  return Math.max(0, (dueCents ?? 0) - paidCents)
}

/**
 * Número do pedido digitado pelo cliente → os 8 caracteres de `orderNumber`.
 * Aceita "#", espaço, hífen e minúscula, que é como ele aparece copiado de
 * Meus Pedidos ou do e-mail. Null quando não tem o formato: a busca nunca
 * monta filtro com texto livre.
 */
export function parseOrderNumberInput(raw: string | null | undefined): string | null {
  const cleaned = (raw ?? "").replace(/[#\s-]/g, "").toUpperCase()
  return /^[0-9A-F]{8}$/.test(cleaned) ? cleaned : null
}

/** O pedido cujo número é este? Comparação pelo mesmo `orderNumber` da tela. */
export function matchesOrderNumber(orderId: string, number: string): boolean {
  return orderNumber(orderId) === number
}

/** Link do anúncio já com o número do pedido preenchido. */
export function complementProductHref(slug: string, orderId: string): string {
  return `/loja/${slug}?${COMPLEMENT_ORDER_QUERY_PARAM}=${orderNumber(orderId)}`
}

/** Snapshot gravado no item do pedido de complemento. */
export type ComplementItemRef = { order_id: string; order_number: string }

export function readComplementItemRef(raw: unknown): ComplementItemRef | null {
  if (!raw || typeof raw !== "object") return null
  const { order_id: orderId, order_number: number } = raw as Record<string, unknown>
  return typeof orderId === "string" && typeof number === "string" ? { order_id: orderId, order_number: number } : null
}
