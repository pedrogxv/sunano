import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getRequestUser, isImpersonating } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIpIdentifier } from "@/lib/server/rate-limit"
import { isUuid } from "@/lib/server/repositories/_shared"
import {
  getStripeCardOrderForOwner,
  handleStripeCardAuthorized,
} from "@/lib/server/repositories/stripe-orders-repository"
import { confirmStripeCardPayment, getStripeCardPaymentState } from "@/lib/server/integrations/stripe"
import {
  getMercadoPagoCardOrderForOwner,
  payMercadoPagoCardOrder,
  type MercadoPagoCardOrderForOwner,
} from "@/lib/server/repositories/mercadopago-orders-repository"
import { MercadoPagoError } from "@/lib/server/integrations/mercadopago"
import { mercadoPagoCardSchema } from "@/lib/server/validation/mercadopago-card"
import { getStoreSettings } from "@/lib/server/repositories/store-settings-repository"
import { storeCardMaxInstallments } from "@/lib/server/payments/gateway"
import { cardDeclineMessage, mercadoPagoDeclineMessage } from "@/lib/card-decline-messages"
import { SITE_URL } from "@/lib/site-url"
import type { CardPaymentState } from "@/lib/store-card-payment"

export const runtime = "nodejs"

/**
 * Pagamento com cartão NO NOSSO SITE — Stripe ou Mercado Pago, pelo gateway
 * em que o PEDIDO nasceu (não pela env de agora: trocar `STORE_CARD_GATEWAY`
 * com pedidos abertos não os quebra).
 *
 *   GET  → em que pé está o pagamento do pedido (a tela decide o que mostrar)
 *          e qual formulário montar (`gateway`).
 *   POST → Stripe: confirma o PaymentIntent com o ConfirmationToken do
 *          Payment Element. Mercado Pago: NOVA tentativa num pedido que ficou
 *          pendente (em análise ou sem resposta). A primeira tentativa é do
 *          checkout, que só cria o pedido junto com a cobrança.
 *
 * O número do cartão NUNCA passa por aqui: ele fica nos iframes do gateway, e
 * o que chega é um token de uso único (PCI SAQ A).
 *
 * Por que confirmar no servidor: é o que permite contar tentativas. Robôs de
 * "card testing" usam checkouts de loja para validar cartões roubados; com
 * a confirmação no navegador eles iriam direto à API do Stripe e a conta é
 * que seria suspensa. Aqui há três tetos: IP, conta e pedido.
 */

/** Tentativas de cartão por PEDIDO. Quem erra 6 vezes no mesmo pedido não é um cliente confuso. */
const MAX_ATTEMPTS_PER_ORDER = 6
/** Por CONTA, somando pedidos — impede contornar o teto acima criando pedidos novos. */
const MAX_ATTEMPTS_PER_USER = 10
const MAX_ATTEMPTS_PER_IP = 20
const WINDOW_SECONDS = 60 * 60

const bodySchema = z.object({
  confirmationTokenId: z.string().regex(/^ctoken_[A-Za-z0-9_]{8,200}$/),
})

async function mercadoPagoMaxInstallments(): Promise<number> {
  const settings = await getStoreSettings()
  return Math.max(1, storeCardMaxInstallments(settings.cardMaxInstallments))
}

function mercadoPagoState(order: MercadoPagoCardOrderForOwner): CardPaymentState {
  return order.status === "pending" ? "ready" : "closed"
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 })

  // Mercado Pago: não há estado de pagamento a consultar fora do pedido (o
  // pagamento só existe depois do POST, e sai aprovado ou recusado na hora).
  const mpOrder = await getMercadoPagoCardOrderForOwner(id, user.id)
  if (mpOrder) {
    return NextResponse.json({
      gateway: "mercadopago",
      state: mercadoPagoState(mpOrder),
      amountCents: mpOrder.totalCents,
      maxInstallments: await mercadoPagoMaxInstallments(),
      payerEmail: mpOrder.customerEmail,
    })
  }

  const order = await getStripeCardOrderForOwner(id, user.id)
  if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })

  if (order.status !== "pending") {
    return NextResponse.json({ gateway: "stripe", state: "closed" satisfies CardPaymentState, amountCents: order.totalCents })
  }
  if (order.inReview) {
    return NextResponse.json({ gateway: "stripe", state: "review" satisfies CardPaymentState, amountCents: order.totalCents })
  }

  // Cada consulta é uma chamada à API do Stripe e a tela chama a cada 3 s: um
  // teto por pedido (1 a cada 2 s) impede que um script com a sessão do dono
  // consuma a cota do Stripe. A tela ignora respostas que não sejam 2xx e
  // mantém o estado que já tinha, então o 429 não a quebra.
  const stateLimit = await checkRateLimit({
    action: "store_card_state",
    identifier: order.id,
    maxAttempts: 1,
    windowSeconds: 2,
    onError: "closed",
  })
  if (!stateLimit.allowed) {
    return NextResponse.json(
      { error: "Consulta muito frequente." },
      { status: 429, headers: { "Retry-After": "2" } }
    )
  }

  const intent = await getStripeCardPaymentState(order.paymentIntentId)
  // `requires_action` aqui = o desafio do banco (3DS) foi interrompido (a
  // pessoa recarregou ou fechou). O PaymentIntent aceita nova confirmação
  // nesse estado, então a tela volta ao formulário — sem entregar o
  // `client_secret` num GET.
  const state: CardPaymentState =
    intent.status === "requires_payment_method" ||
    intent.status === "requires_confirmation" ||
    intent.status === "requires_action"
      ? "ready"
      : intent.status === "canceled"
        ? "closed"
        : "processing"

  const lastError =
    intent.status === "requires_action"
      ? "A autenticação do banco não foi concluída. Tente de novo."
      : state === "ready" && intent.lastError
        ? cardDeclineMessage(intent.lastError.code, intent.lastError.declineCode)
        : null

  return NextResponse.json({ gateway: "stripe", state, amountCents: order.totalCents, lastError })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })

  const tooMany = () =>
    NextResponse.json(
      { error: "Muitas tentativas com cartão. Aguarde um pouco ou pague com PIX." },
      { status: 429 }
    )

  const ipLimit = await checkRateLimit({
    action: "store_card_confirm_ip",
    identifier: getClientIpIdentifier(request),
    maxAttempts: MAX_ATTEMPTS_PER_IP,
    windowSeconds: WINDOW_SECONDS,
    onError: "closed",
  })
  if (!ipLimit.allowed) return tooMany()

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 })

  // Pagar em nome de outra pessoa é o oposto do escopo de uma sessão de suporte.
  if (isImpersonating(request)) {
    return NextResponse.json(
      { error: "impersonation_read_only", message: "Sessão de acesso é somente leitura." },
      { status: 403 }
    )
  }

  const rawBody = await request.json().catch(() => null)

  // Tetos por conta e por pedido: os mesmos para os dois gateways (o robô
  // testando cartão não escolhe gateway).
  const checkAttemptLimits = async (orderId: string) => {
    const userLimit = await checkRateLimit({
      action: "store_card_confirm_user",
      identifier: user.id,
      maxAttempts: MAX_ATTEMPTS_PER_USER,
      windowSeconds: WINDOW_SECONDS,
      onError: "closed",
    })
    if (!userLimit.allowed) return false
    const orderLimit = await checkRateLimit({
      action: "store_card_confirm_order",
      identifier: orderId,
      maxAttempts: MAX_ATTEMPTS_PER_ORDER,
      windowSeconds: 24 * 60 * 60,
      onError: "closed",
    })
    return orderLimit.allowed
  }

  const mpOrder = await getMercadoPagoCardOrderForOwner(id, user.id)
  if (mpOrder) {
    const mpParsed = mercadoPagoCardSchema.safeParse(rawBody)
    if (!mpParsed.success) {
      return NextResponse.json({ error: "Dados do cartão inválidos. Recarregue a página." }, { status: 400 })
    }
    if (mpOrder.status !== "pending") {
      return NextResponse.json({ error: "Este pedido não está mais aguardando pagamento." }, { status: 409 })
    }
    if (mpParsed.data.installments > (await mercadoPagoMaxInstallments())) {
      return NextResponse.json({ error: "Número de parcelas indisponível. Escolha outro." }, { status: 400 })
    }
    if (!(await checkAttemptLimits(mpOrder.id))) return tooMany()

    try {
      const result = await payMercadoPagoCardOrder(mpOrder, {
        token: mpParsed.data.token,
        paymentMethodId: mpParsed.data.payment_method_id,
        installments: mpParsed.data.installments,
        identification: mpParsed.data.payer?.identification ?? null,
      })
      if (result.outcome === "declined") {
        return NextResponse.json(
          { error: mercadoPagoDeclineMessage(result.statusDetail), declined: true },
          { status: 402 }
        )
      }
      if (result.outcome === "closed") {
        return NextResponse.json(
          { error: "Este pedido não estava mais aguardando pagamento. O valor foi devolvido ao seu cartão." },
          { status: 409 }
        )
      }
      return NextResponse.json({ state: "processing" satisfies CardPaymentState })
    } catch (err) {
      console.error("[card-payment] mercadopago:", err)
      // 4xx do Mercado Pago com token: o token expirou/foi usado ou algum
      // dado não bateu. A pessoa pode digitar o cartão de novo.
      if (err instanceof MercadoPagoError && err.status >= 400 && err.status < 500) {
        return NextResponse.json(
          { error: "Não foi possível validar os dados do cartão. Confira e tente de novo.", declined: true },
          { status: 402 }
        )
      }
      return NextResponse.json(
        { error: "Não foi possível processar o cartão agora. Tente de novo em instantes ou pague com PIX." },
        { status: 502 }
      )
    }
  }

  const parsed = bodySchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados do cartão inválidos. Recarregue a página." }, { status: 400 })
  }

  const order = await getStripeCardOrderForOwner(id, user.id)
  if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })
  if (order.status !== "pending" || order.inReview) {
    return NextResponse.json({ error: "Este pedido não está mais aguardando pagamento." }, { status: 409 })
  }

  if (!(await checkAttemptLimits(order.id))) return tooMany()

  try {
    const result = await confirmStripeCardPayment({
      paymentIntentId: order.paymentIntentId,
      confirmationTokenId: parsed.data.confirmationTokenId,
      returnUrl: `${SITE_URL}/checkout/card?orderId=${order.id}`,
    })

    if (result.outcome === "declined") {
      return NextResponse.json(
        { error: cardDeclineMessage(result.code, result.declineCode), declined: true },
        { status: 402 }
      )
    }
    if (result.outcome === "requires_action") {
      return NextResponse.json({ state: "requires_action" satisfies CardPaymentState, clientSecret: result.clientSecret })
    }
    // Autorizado: decide captura / revisão / recusa AGORA, pela mesma função
    // do webhook (idempotente — o evento que chegar depois não repete nada).
    // Assim a compra não depende da latência nem da configuração do webhook,
    // que segue como rede de segurança se esta chamada falhar.
    if (result.outcome === "authorized") {
      try {
        await handleStripeCardAuthorized(order.paymentIntentId)
      } catch (err) {
        console.error("[card-payment] handleStripeCardAuthorized (o webhook tenta de novo):", err)
      }
    }
    return NextResponse.json({ state: "processing" satisfies CardPaymentState })
  } catch (err) {
    console.error("[card-payment] confirm:", err)
    return NextResponse.json(
      { error: "Não foi possível processar o cartão agora. Tente de novo em instantes ou pague com PIX." },
      { status: 502 }
    )
  }
}
