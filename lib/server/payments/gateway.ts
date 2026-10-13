import "server-only"

import { isSandboxGateway as isAsaasSandbox } from "@/lib/server/integrations/asaas"
import { isStripeSandbox } from "@/lib/server/integrations/stripe"
import type { PaymentGateway } from "@/lib/payment-gateways"

export { orderPaymentGateway, type PaymentGateway } from "@/lib/payment-gateways"

/**
 * Qual gateway cobra os pedidos NOVOS da Loja.
 *
 * `PAYMENT_GATEWAY=stripe` liga o Stripe; QUALQUER outro valor (ausente,
 * `asaas`, ou um resto de configuração antiga como `misticpay`) mantém a
 * Asaas. O default é o comportamento de hoje de propósito: errar a env nunca
 * pode tirar a loja do gateway que já funciona.
 *
 * Vale só para criar cobrança. Pedido já criado segue no gateway em que
 * nasceu (pelas colunas `asaas_*` / `stripe_*`): trocar a env com pedidos em
 * aberto não quebra webhook, cancelamento nem estorno deles.
 *
 * Escopo: Loja (checkout de produtos). A assinatura VIP continua na Asaas.
 */
export function activePaymentGateway(): PaymentGateway {
  const raw = process.env.PAYMENT_GATEWAY?.trim().toLowerCase()
  if (raw === "stripe") return "stripe"
  if (raw && raw !== "asaas") {
    console.warn(`[payments] PAYMENT_GATEWAY="${raw}" não reconhecido — usando Asaas.`)
  }
  return "asaas"
}

/**
 * A Loja aceita cartão agora? Na Asaas sim (fluxo de sempre). No Stripe, por
 * enquanto, NÃO: com `PAYMENT_GATEWAY=stripe` a loja cobra só PIX.
 *
 * Fonte única da regra: o checkout recusa `credit_card` por aqui e
 * `/api/store/settings` repassa o mesmo valor (`cardEnabled`) para as telas
 * esconderem preço, parcelas e o botão de cartão. Se as duas pontas
 * divergissem, a vitrine prometeria um cartão que o checkout recusa.
 */
export function storeCardPaymentsEnabled(): boolean {
  return activePaymentGateway() !== "stripe"
}

/** Ambiente (teste ou real) do gateway ativo — o que vai para `store_orders.is_sandbox`. */
export function isActiveGatewaySandbox(): boolean {
  return activePaymentGateway() === "stripe" ? isStripeSandbox() : isAsaasSandbox()
}

/**
 * O deploy está cobrando em ambiente de TESTE? Só então o cliente enxerga um
 * pedido de sandbox — é o que permite testar o fluxo inteiro (QR, polling,
 * confirmação, "Meus pedidos") num ambiente de teste, inclusive localhost.
 * Em produção os gateways recusam sandbox, então aqui é sempre `false` e
 * nada muda. Env inválida também cai em `false`: tela de cliente não pode
 * quebrar por causa da config de pagamento.
 */
export function deployChargesInSandbox(): boolean {
  try {
    return isActiveGatewaySandbox()
  } catch {
    return false
  }
}
