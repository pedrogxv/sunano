/**
 * Aviso da loja ao cliente sobre um pedido (migration 20270109000000): um
 * dado de entrega errado ou faltando, que só o cliente pode corrigir, ou um
 * problema que ele precisa saber. Módulo puro, importável dos dois lados: o
 * admin escolhe o motivo, o servidor grava e avisa (e-mail + notificação), e
 * "Meus Pedidos" mostra o aviso no card do pedido.
 *
 * Os motivos de ENTREGA (`fixesShipping`) se resolvem sozinhos quando o
 * cliente salva os dados de entrega de novo. `other` não tem o que o cliente
 * corrigir pelo site: quem fecha é o admin.
 */

import { SHIPPING_EDITABLE_STATUSES, type OrderStatusValue } from "@/lib/order-status"

/** Espelha o check `store_orders_customer_notice_reason_check`. */
export const ORDER_NOTICE_REASONS = ["cpf", "recipient", "birth_date", "address", "phone", "other"] as const

export type OrderNoticeReason = (typeof ORDER_NOTICE_REASONS)[number]

export const ORDER_NOTICE_REASON: Record<
  OrderNoticeReason,
  {
    /** Opção na lista do admin e badge da fila. */
    label: string
    /** Frase do problema para o cliente (card, e-mail e notificação). */
    problem: string
    /** O cliente corrige pelo formulário de entrega de "Meus Pedidos". */
    fixesShipping: boolean
  }
> = {
  cpf: { label: "CPF inválido", problem: "O CPF de quem recebe está incorreto.", fixesShipping: true },
  recipient: {
    label: "Nome de quem recebe",
    problem: "O nome de quem recebe está incorreto ou não confere com o CPF.",
    fixesShipping: true,
  },
  birth_date: {
    label: "Data de nascimento",
    problem: "A data de nascimento de quem recebe está incorreta.",
    fixesShipping: true,
  },
  address: {
    label: "Endereço incorreto",
    problem: "O endereço de entrega está incompleto ou incorreto.",
    fixesShipping: true,
  },
  phone: { label: "Celular inválido", problem: "O celular de quem recebe está incorreto.", fixesShipping: true },
  other: { label: "Outro assunto", problem: "A loja tem um aviso importante sobre o seu pedido.", fixesShipping: false },
}

/** Espelha o check `store_orders_customer_notice_message_check`. */
export const ORDER_NOTICE_MESSAGE_MAX = 1000

export function isOrderNoticeReason(value: unknown): value is OrderNoticeReason {
  return typeof value === "string" && (ORDER_NOTICE_REASONS as readonly string[]).includes(value)
}

/**
 * O cliente consegue corrigir os dados de entrega deste pedido pelo site.
 * Fora disso um motivo de entrega não tem botão que funcione: o pedido já
 * saiu (ou nem tem entrega) e o caminho é a conversa do pedido.
 */
export function canFixShippingOnSite(status: OrderStatusValue, requiresShipping: boolean): boolean {
  return requiresShipping && SHIPPING_EDITABLE_STATUSES.includes(status)
}

/** Aviso aberto, como o cliente vê. */
export type OrderCustomerNotice = {
  reason: OrderNoticeReason
  /** Texto livre da equipe. Null = só o motivo. */
  message: string | null
  sent_at: string
}

/** Aviso do pedido, como o admin vê: inclui o resolvido (histórico do último). */
export type AdminOrderCustomerNotice = OrderCustomerNotice & {
  resolved_at: string | null
  resolved_by: "customer" | "admin" | null
}

/** Colunas cruas do aviso, como vêm do banco. */
export type RawOrderNoticeColumns = {
  customer_notice_reason: string | null
  customer_notice_message: string | null
  customer_notice_sent_at: string | null
  customer_notice_resolved_at: string | null
  customer_notice_resolved_by: string | null
}

export const ORDER_NOTICE_COLUMNS =
  "customer_notice_reason, customer_notice_message, customer_notice_sent_at, customer_notice_resolved_at, customer_notice_resolved_by"

/** Último aviso do pedido (aberto ou não). Null = nunca houve. */
export function readAdminOrderNotice(row: Partial<RawOrderNoticeColumns>): AdminOrderCustomerNotice | null {
  if (!row.customer_notice_sent_at || !isOrderNoticeReason(row.customer_notice_reason)) return null
  const resolvedBy = row.customer_notice_resolved_by
  return {
    reason: row.customer_notice_reason,
    message: row.customer_notice_message?.trim() || null,
    sent_at: row.customer_notice_sent_at,
    resolved_at: row.customer_notice_resolved_at ?? null,
    resolved_by: resolvedBy === "customer" || resolvedBy === "admin" ? resolvedBy : null,
  }
}

/** Aviso que ainda espera o cliente. Resolvido = null: some da tela dele. */
export function readOpenOrderNotice(row: Partial<RawOrderNoticeColumns>): OrderCustomerNotice | null {
  const notice = readAdminOrderNotice(row)
  if (!notice || notice.resolved_at) return null
  return { reason: notice.reason, message: notice.message, sent_at: notice.sent_at }
}
