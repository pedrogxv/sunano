import "server-only"

import { isSandboxGateway as isAsaasSandbox } from "@/lib/server/integrations/asaas"
import { isStripeSandbox } from "@/lib/server/integrations/stripe"
import { isMercadoPagoSandbox } from "@/lib/server/integrations/mercadopago"
import { isInfinitePaySandbox } from "@/lib/server/integrations/infinitepay"
import type { PaymentGateway } from "@/lib/payment-gateways"

export { orderPaymentGateway, type PaymentGateway } from "@/lib/payment-gateways"

/**
 * Gateways da Loja, POR FORMA DE PAGAMENTO:
 *
 *   STORE_PIX_GATEWAY   = asaas | stripe                 (quem emite o PIX)
 *   STORE_CARD_GATEWAY  = asaas | stripe | mercadopago | infinitepay   (quem cobra o cartão)
 *   STORE_PAYMENT_METHODS = pix[,credit_card]            (cartão ligado ou não)
 *
 * Trocar de gateway é trocar UMA env. Cada uma, ausente, cai no
 * `PAYMENT_GATEWAY` antigo (e ele, ausente, na Asaas): um deploy que ainda não
 * tem as envs novas cobra exatamente como antes. Valor com typo também cai no
 * padrão, com aviso no log — errar a env nunca pode tirar a loja do gateway
 * que já funciona.
 *
 * Vale só para criar cobrança. Pedido já criado segue no gateway em que
 * nasceu (`orderPaymentGateway`): trocar a env com pedidos em aberto não
 * quebra webhook, cancelamento nem estorno deles.
 *
 * Escopo: Loja (checkout de produtos). A assinatura VIP continua na Asaas.
 */

const PIX_GATEWAYS = ["asaas", "stripe"] as const satisfies readonly PaymentGateway[]
const CARD_GATEWAYS = ["asaas", "stripe", "mercadopago", "infinitepay"] as const satisfies readonly PaymentGateway[]

export type PixGateway = (typeof PIX_GATEWAYS)[number]
export type CardGateway = (typeof CARD_GATEWAYS)[number]

/** `PAYMENT_GATEWAY` de antes das envs por forma de pagamento. */
function legacyGateway(): "asaas" | "stripe" {
  const raw = process.env.PAYMENT_GATEWAY?.trim().toLowerCase()
  if (raw === "stripe") return "stripe"
  if (raw && raw !== "asaas") {
    console.warn(`[payments] PAYMENT_GATEWAY="${raw}" não reconhecido — usando Asaas.`)
  }
  return "asaas"
}

function readGatewayEnv<T extends PaymentGateway>(name: string, allowed: readonly T[]): T | null {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) return null
  if ((allowed as readonly string[]).includes(raw)) return raw as T
  console.warn(`[payments] ${name}="${raw}" não reconhecido (aceita: ${allowed.join(", ")}) — usando o padrão.`)
  return null
}

/** Quem emite o PIX dos pedidos NOVOS. */
export function storePixGateway(): PixGateway {
  return readGatewayEnv("STORE_PIX_GATEWAY", PIX_GATEWAYS) ?? legacyGateway()
}

/**
 * Quem cobraria o cartão dos pedidos NOVOS. Não diz se o cartão está LIGADO
 * — isso é `storeCardPaymentsEnabled`.
 */
export function storeCardGateway(): CardGateway {
  return readGatewayEnv("STORE_CARD_GATEWAY", CARD_GATEWAYS) ?? legacyGateway()
}

const STORE_PAYMENT_METHODS = ["pix", "credit_card"] as const
type StorePaymentMethod = (typeof STORE_PAYMENT_METHODS)[number]

/**
 * Formas de pagamento que a Loja oferece, por `STORE_PAYMENT_METHODS`
 * (lista separada por vírgula: `pix`, `credit_card`). Ausente = as duas, o
 * comportamento de antes da env existir.
 *
 * PIX é sempre ligado: é a base do checkout (as telas não têm estado "sem
 * PIX"). Uma lista sem `pix` só gera aviso.
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

function gatewaySandbox(gateway: PaymentGateway): boolean {
  if (gateway === "stripe") return isStripeSandbox()
  if (gateway === "mercadopago") return isMercadoPagoSandbox()
  if (gateway === "infinitepay") return isInfinitePaySandbox()
  return isAsaasSandbox()
}

/**
 * A Loja aceita cartão agora? Todas as condições, nesta ordem:
 *
 *   1. `STORE_PAYMENT_METHODS` inclui `credit_card` (ou está ausente) — é a
 *      chave de liga/desliga, e a que segura o cartão em fase de testes;
 *   2. `STORE_CARD_GATEWAY`, se preenchida, é válida (typo desliga o cartão);
 *      e o Stripe só cobra cartão quando escolhido EXPLICITAMENTE em
 *      `STORE_CARD_GATEWAY`. Pelo `PAYMENT_GATEWAY=stripe` antigo ele segue
 *      desligado, como era (a loja estava só no PIX nesse modo);
 *   3. a configuração do gateway de cartão é válida (env e credenciais);
 *   4. o ambiente (teste × produção) do cartão é o MESMO do PIX. A loja tem
 *      um ambiente só (`isActiveGatewaySandbox`): com os dois divergindo, um
 *      pedido de cartão de teste entraria na fila e na receita de produção.
 *
 * Fonte única da regra: o checkout recusa `credit_card` por aqui e
 * `/api/store/settings` repassa o mesmo valor (`cardEnabled`) para as telas
 * esconderem preço, parcelas e o botão de cartão. Se as duas pontas
 * divergissem, a vitrine prometeria um cartão que o checkout recusa.
 *
 * Nunca lança: é lida por telas públicas, e config de pagamento errada só
 * pode desligar o cartão (com o motivo no log), não derrubar a loja.
 */
export function storeCardPaymentsEnabled(): boolean {
  if (!configuredStorePaymentMethods().has("credit_card")) return false

  // Typo em `STORE_CARD_GATEWAY` DESLIGA o cartão em vez de cair no padrão:
  // quem escreveu a env quis um gateway específico, e cobrar por outro (a
  // Asaas, pelo legado) seria pior que ficar só no PIX.
  const explicitGateway = readGatewayEnv("STORE_CARD_GATEWAY", CARD_GATEWAYS)
  if (process.env.STORE_CARD_GATEWAY?.trim() && !explicitGateway) return false

  const gateway = storeCardGateway()
  if (gateway === "stripe" && explicitGateway !== "stripe") return false

  try {
    const cardSandbox = gatewaySandbox(gateway)
    const pixSandbox = gatewaySandbox(storePixGateway())
    if (cardSandbox !== pixSandbox) {
      console.error(
        `[payments] cartão DESLIGADO: ${gateway} está em ${cardSandbox ? "sandbox" : "produção"} e o PIX (${storePixGateway()}) em ${pixSandbox ? "sandbox" : "produção"}. Os dois precisam estar no mesmo ambiente.`
      )
      return false
    }
  } catch (err) {
    console.error(`[payments] cartão DESLIGADO: configuração do gateway ${gateway} inválida —`, err instanceof Error ? err.message : err)
    return false
  }
  return true
}

/**
 * Parcelas que o gateway de cartão ATIVO de fato oferece, a partir do máximo
 * salvo no admin. O Stripe Brasil não parcela (o cartão é à vista), e a
 * vitrine diria "em até 6x" para uma compra sem parcela nenhuma. A InfinitePay
 * oferece até 12x na página dela; a vitrine anuncia o máximo do admin.
 */
export function storeCardMaxInstallments(savedMax: number): number {
  return storeCardGateway() === "stripe" ? 1 : savedMax
}

/**
 * O cartão é digitado no NOSSO site (`/checkout/card`), e não numa página
 * hospedada pelo gateway? Muda o texto do checkout ("página segura da
 * Asaas" × "os dados vão direto para o Mercado Pago"). Asaas e InfinitePay
 * hospedam o cartão.
 */
export function storeCardFormOnSite(): boolean {
  const gateway = storeCardGateway()
  return gateway !== "asaas" && gateway !== "infinitepay"
}

/**
 * Ambiente (teste ou real) da Loja — o que vai para `store_orders.is_sandbox`.
 * É o do gateway de PIX, que está sempre ligado; o cartão só liga quando o
 * dele bate com este (ver `storeCardPaymentsEnabled`), então vale para os dois.
 */
export function isActiveGatewaySandbox(): boolean {
  return gatewaySandbox(storePixGateway())
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
