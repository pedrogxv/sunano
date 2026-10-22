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
 * Dentro de "Pedido feito" há um marco, não um status: `warehouse_arrived_at`
 * (migration 20270102000000), que o admin marca quando o produto chega ao
 * armazém. Rótulo e descrição recebem esse marco para dizerem "No armazém".
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

/** Rótulo do marco "chegou ao armazém" dentro de `paid`. */
export const ORDER_WAREHOUSE_LABEL = "No armazém"

export const ORDER_WAREHOUSE_DESCRIPTION =
  "Seu produto chegou ao nosso armazém. Estamos conferindo tudo e ele é o próximo a ser enviado."

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

export function orderStatusLabel(
  status: OrderStatusValue,
  requiresShipping = true,
  warehouseArrived = false
): string {
  if (status === "paid" && requiresShipping && warehouseArrived) return ORDER_WAREHOUSE_LABEL
  return (!requiresShipping && SERVICE_LABEL[status]) || ORDER_STATUS_LABEL[status] || status
}

/**
 * Uma frase do que está acontecendo com o pedido, para o cliente. Null quando
 * o rótulo já diz tudo.
 */
export function orderStatusDescription(
  status: OrderStatusValue,
  requiresShipping = true,
  warehouseArrived = false
): string | null {
  if (!requiresShipping) {
    return status === "paid" ? "Pagamento confirmado. Vamos combinar o atendimento pelo chamado de suporte." : null
  }
  switch (status) {
    case "awaiting_shipping_info":
      return "Pagamento confirmado. Falta você informar o endereço de entrega para podermos enviar."
    case "paid":
      if (warehouseArrived) return ORDER_WAREHOUSE_DESCRIPTION
      return "Pedido feito. Estamos esperando o produto chegar ao nosso armazém para enviar."
    case "shipped":
      return "Seu pedido está a caminho. Quando chegar, confirme o recebimento por aqui."
    default:
      return null
  }
}

/**
 * Aviso de rastreio para o cliente, depois do envio. Fonte única: Meus
 * Pedidos, e-mail de envio e e-mail de rastreio alterado leem daqui.
 *
 * O produto sai da China: o código costuma levar dias para aparecer na
 * transportadora e, em alguns casos, MUDA quando a encomenda entra no Brasil
 * (por isso o admin pode trocar o código enquanto o pedido está "Enviado").
 */
export const ORDER_TRACKING_NOTICE = {
  title: "Pedido enviado!",
  /** Cada parágrafo é uma lista de trechos; `strong` sai em negrito no site e no e-mail. */
  paragraphs: [
    [
      {
        text: "Seu pedido já foi despachado e está a caminho. Como o envio foi realizado recentemente, é normal que o código de rastreio ainda não apresente atualizações no site da transportadora.",
      },
    ],
    [
      {
        text: "Em pedidos internacionais, o rastreamento costuma começar a exibir movimentações mais detalhadas após o pacote avançar no transporte ou chegar ao Brasil. Recomendamos aguardar ",
      },
      { text: "cerca de 7 dias", strong: true },
      { text: " para consultar novamente." },
    ],
    [
      {
        text: "Não se preocupe caso o rastreio fique alguns dias sem atualização. Isso é normal nas etapas iniciais do envio.",
      },
    ],
  ] as ReadonlyArray<ReadonlyArray<{ text: string; strong?: boolean }>>,
  codeChange:
    "Obs.: em alguns casos, assim que o produto chega ao Brasil, o código de rastreio muda automaticamente. Se a nossa equipe ainda não tiver atualizado o código aqui, abra um chamado pedindo mais informações sobre o seu pedido que a gente ajuda com tudo que você precisar.",
} as const

/** Status em que o admin pode trocar o código de rastreio. */
export const TRACKING_EDITABLE_STATUSES: OrderStatusValue[] = ["shipped"]
