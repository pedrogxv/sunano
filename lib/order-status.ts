/**
 * Texto de status de pedido: fonte única para "Meus Pedidos", fila do admin
 * e notificação. Módulo puro (sem `server-only`), importável dos dois lados.
 *
 * Fluxo de produto físico (ver 20261206000002_order_shipping_stage_auto.sql):
 *   awaiting_shipping_info -> paid -> shipped -> delivered
 * O banco escolhe sozinho entre os dois primeiros pelo endereço: pago sem
 * endereço é "Aguardando dados de entrega", pago com endereço é "Pedido
 * feito". Nenhum dos dois é clicado pelo admin.
 *
 * Serviço/digital não tem armazém nem pacote: `paid` é só "Pago" e
 * `delivered` é "Concluído".
 */

export type OrderStatusValue =
  | "pending"
  | "paid"
  | "awaiting_shipping_info"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded"
  | "expired"

export const ORDER_STATUS_LABEL: Record<OrderStatusValue, string> = {
  pending: "Aguardando pagamento",
  awaiting_shipping_info: "Aguardando dados de entrega",
  paid: "Pedido feito",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  expired: "Expirado",
}

const SERVICE_LABEL: Partial<Record<OrderStatusValue, string>> = {
  paid: "Pago",
  delivered: "Concluído",
}

/** Status já pago, em qualquer etapa do pós-venda (inclui o que espera endereço). */
export const ORDER_PAID_STATUSES: OrderStatusValue[] = [
  "awaiting_shipping_info",
  "paid",
  "shipped",
  "delivered",
]

/**
 * Abas da fila do admin. "Ativos" é tudo que ainda pede ação de alguém
 * (pagar, informar endereço, enviar, receber); os demais são o fim do fluxo.
 * Lido pela tela (abas e contagem) e pela rota (filtro), para as duas
 * recortarem igual.
 */
export type OrderStatusGroup = "active" | "completed" | "expired" | "cancelled" | "refunded" | "all"

export const ORDER_STATUS_GROUPS: Record<Exclude<OrderStatusGroup, "all">, OrderStatusValue[]> = {
  active: ["pending", "awaiting_shipping_info", "paid", "shipped"],
  completed: ["delivered"],
  expired: ["expired"],
  cancelled: ["cancelled"],
  refunded: ["refunded"],
}

export function parseOrderStatusGroup(value: string | null | undefined): OrderStatusGroup {
  return value === "all" || (value != null && Object.hasOwn(ORDER_STATUS_GROUPS, value))
    ? (value as OrderStatusGroup)
    : "all"
}

export function orderStatusLabel(status: OrderStatusValue, requiresShipping = true): string {
  return (!requiresShipping && SERVICE_LABEL[status]) || ORDER_STATUS_LABEL[status] || status
}

/**
 * Uma frase do que está acontecendo com o pedido, para o cliente. Null quando
 * o rótulo já diz tudo.
 */
export function orderStatusDescription(
  status: OrderStatusValue,
  requiresShipping = true
): string | null {
  if (!requiresShipping) {
    return status === "paid" ? "Pagamento confirmado. Vamos combinar o atendimento pelo chamado de suporte." : null
  }
  switch (status) {
    case "awaiting_shipping_info":
      return "Pagamento confirmado. Falta você informar o endereço de entrega para podermos enviar."
    case "paid":
      return "Pedido feito. Estamos esperando o produto chegar ao nosso armazém para enviar."
    case "shipped":
      return "Seu pedido está a caminho. Quando chegar, confirme o recebimento por aqui."
    default:
      return null
  }
}
