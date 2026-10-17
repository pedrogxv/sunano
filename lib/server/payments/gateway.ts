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

const STORE_PAYMENT_METHODS = ["pix", "credit_card"] as const
type StorePaymentMethod = (typeof STORE_PAYMENT_METHODS)[number]

/**
 * Formas de pagamento que a Loja oferece, por `STORE_PAYMENT_METHODS`
 * (lista separada por vírgula: `pix`, `credit_card`). Ausente = as duas, o
 * comportamento de antes da env existir.
 *
 * PIX é sempre ligado: é a base do checkout (as telas não têm estado "sem
 * PIX") e é o que o Stripe cobra. Uma lista sem `pix` só gera aviso.
 */
function configuredStorePaymentMethods(): ReadonlySet<StorePaymentMethod> {
  const raw = process.env.STORE_PAYMENT_METHODS?.trim()
  if (!raw) return new Set(STORE_PAYMENT_METHODS)

  const tokens = raw.toLowerCase().split(",").map((t) => t.trim()).filter(Boolean)
  const methods = new Set<StorePaymentMethod>(["pix"])
  for (const value of tokens) {
    if ((STORE_PAYMENT_METHODS as readonly string[]).includes(value)) {
      methods.add(value as StorePaymentMethod)
    } else {
      console.warn(`[payments] STORE_PAYMENT_METHODS: "${value}" não reconhecido — ignorado.`)
    }
  }
  if (!tokens.includes("pix")) {
    console.warn("[payments] STORE_PAYMENT_METHODS sem \"pix\" — PIX continua ligado (é obrigatório).")
  }
  return methods
}

/**
 * A Loja aceita cartão agora? Só quando `STORE_PAYMENT_METHODS` inclui
 * `credit_card` (ou está ausente) E o gateway ativo é a Asaas. No Stripe o
 * cartão segue desligado independente da env (ver "Religar o cartão" em
 * STRIPE_SETUP.md).
 *
 * Fonte única da regra: o checkout recusa `credit_card` por aqui e
 * `/api/store/settings` repassa o mesmo valor (`cardEnabled`) para as telas
 * esconderem preço, parcelas e o botão de cartão. Se as duas pontas
 * divergissem, a vitrine prometeria um cartão que o checkout recusa.
 */
export function storeCardPaymentsEnabled(): boolean {
  if (!configuredStorePaymentMethods().has("credit_card")) return false
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
