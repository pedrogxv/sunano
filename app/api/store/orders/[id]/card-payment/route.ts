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
import { cardDeclineMessage } from "@/lib/card-decline-messages"
import { SITE_URL } from "@/lib/site-url"
import type { CardPaymentState } from "@/lib/store-card-payment"

export const runtime = "nodejs"

/**
 * Pagamento com cartão NO NOSSO SITE (Stripe, `PAYMENT_GATEWAY=stripe`).
 *
 *   GET  → em que pé está o pagamento do pedido (a tela decide o que mostrar).
 *   POST → confirma o PaymentIntent com o ConfirmationToken que o Payment
 *          Element gerou no navegador.
 *
 * O número do cartão NUNCA passa por aqui: ele fica nos iframes do Stripe, e
 * o que chega é um token `ctoken_…` de uso único (PCI SAQ A).
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

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!isUuid(id)) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Faça login para continuar." }, { status: 401 })

  const order = await getStripeCardOrderForOwner(id, user.id)
  if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })

  if (order.status !== "pending") {
    return NextResponse.json({ state: "closed" satisfies CardPaymentState, amountCents: order.totalCents })
  }
  if (order.inReview) {
    return NextResponse.json({ state: "review" satisfies CardPaymentState, amountCents: order.totalCents })
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

  return NextResponse.json({ state, amountCents: order.totalCents, lastError })
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

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados do cartão inválidos. Recarregue a página." }, { status: 400 })
  }

  const order = await getStripeCardOrderForOwner(id, user.id)
  if (!order) return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 })
  if (order.status !== "pending" || order.inReview) {
    return NextResponse.json({ error: "Este pedido não está mais aguardando pagamento." }, { status: 409 })
  }

  const userLimit = await checkRateLimit({
    action: "store_card_confirm_user",
    identifier: user.id,
    maxAttempts: MAX_ATTEMPTS_PER_USER,
    windowSeconds: WINDOW_SECONDS,
    onError: "closed",
  })
  if (!userLimit.allowed) return tooMany()

  const orderLimit = await checkRateLimit({
    action: "store_card_confirm_order",
    identifier: order.id,
    maxAttempts: MAX_ATTEMPTS_PER_ORDER,
    windowSeconds: 24 * 60 * 60,
    onError: "closed",
  })
  if (!orderLimit.allowed) return tooMany()

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
