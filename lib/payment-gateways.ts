/**
 * Gateways de pagamento da Loja: identidade e rótulo. Módulo puro (sem
 * `server-only`) porque a fila do admin precisa dos mesmos rótulos e da mesma
 * dedução que o servidor usa.
 *
 * Gateway novo entra AQUI primeiro: o tipo `PaymentGateway` cresce, e cada
 * `Record<PaymentGateway, …>` que depende dele (o filtro da fila em
 * `orders-repository`, por exemplo) deixa de compilar até ganhar o ramo do
 * novo gateway. É isso que impede o filtro de esquecer um gateway em silêncio.
 */
export const PAYMENT_GATEWAYS = ["asaas", "stripe", "mercadopago"] as const

export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number]

export const PAYMENT_GATEWAY_LABEL: Record<PaymentGateway, string> = {
  asaas: "Asaas",
  stripe: "Stripe",
  mercadopago: "Mercado Pago",
}

/**
 * Gateway de um pedido JÁ criado, pelo que o checkout gravou.
 *
 * Mercado Pago é reconhecido por `payment_gateway`, não por uma referência de
 * cobrança: o pedido nasce ANTES do pagamento (o cartão é digitado depois, em
 * `/checkout/card`) e um cartão recusado não deixa referência nenhuma. Os
 * demais seguem pela coluna de referência: sem Stripe é Asaas (inclusive os
 * legados de gateways que já saíram). Pedido pago com Aura não passa por
 * gateway nenhum — quem chama confere `payment_method` antes.
 */
export function orderPaymentGateway(order: {
  payment_gateway?: string | null
  stripe_payment_intent_id?: string | null
  stripe_session_id?: string | null
}): PaymentGateway {
  if (order.payment_gateway === "mercadopago") return "mercadopago"
  return order.stripe_payment_intent_id || order.stripe_session_id ? "stripe" : "asaas"
}

/**
 * Recorte de "como foi pago" na fila do admin: um gateway, ou `aura` (resgate
 * da Central, sem cobrança em dinheiro). `all` = sem recorte.
 */
export type OrderPaymentSourceFilter = "all" | "aura" | PaymentGateway

export const ORDER_PAYMENT_SOURCE_FILTERS: readonly OrderPaymentSourceFilter[] = ["all", ...PAYMENT_GATEWAYS, "aura"]

export const ORDER_PAYMENT_SOURCE_LABEL: Record<OrderPaymentSourceFilter, string> = {
  all: "Todos",
  ...PAYMENT_GATEWAY_LABEL,
  aura: "Aura",
}

/** Normaliza o valor vindo da query string. Desconhecido = sem recorte. */
export function parseOrderPaymentSource(value: string | null | undefined): OrderPaymentSourceFilter {
  return ORDER_PAYMENT_SOURCE_FILTERS.includes(value as OrderPaymentSourceFilter)
    ? (value as OrderPaymentSourceFilter)
    : "all"
}
