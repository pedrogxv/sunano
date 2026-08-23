import { timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"

import { getPayment, getPaymentsByCheckoutSession } from "@/lib/server/integrations/asaas"
import {
  activateSubscriptionFromWebhook,
  renewSubscriptionFromWebhook,
  markSubscriptionPastDue,
  cancelSubscriptionByAsaasId,
  cancelSubscriptionByCheckoutId,
} from "@/lib/server/repositories/vip-subscription-repository"
import { VIP_SUBSCRIPTION_PRICE_CENTS } from "@/lib/vip-plan"

export const runtime = "nodejs"
export const maxDuration = 20

// Webhook DEDICADO à assinatura VIP — token e handler próprios, não
// reaproveita app/api/webhooks/asaas/route.ts (PIX avulso) nem
// app/api/webhooks/asaas-checkout/route.ts (checkout avulso de loja): o
// ciclo de vida de uma assinatura recorrente é diferente de um pedido
// único, e misturar aumentaria o raio de impacto de qualquer bug.
//
// A Asaas envia dois FORMATOS de payload distintos para este fluxo,
// confirmados contra a documentação oficial:
//   - eventos de checkout/pagamento: { event, checkout: {id} } ou { event, payment: {id, subscription, ...} }
//   - eventos de assinatura: { event, subscription: {id, ...} }
interface AsaasSubscriptionWebhookPayload {
  event: string
  checkout?: { id: string; customer?: string }
  payment?: { id: string; subscription?: string | null }
  subscription?: { id: string }
}

function safeTokenMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_SUBSCRIPTION_TOKEN
  if (!expectedToken) {
    console.error("ASAAS_WEBHOOK_SUBSCRIPTION_TOKEN não configurado — recusando webhook.")
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 })
  }

  const providedToken = request.headers.get("asaas-access-token") ?? ""
  if (!providedToken || !safeTokenMatch(providedToken, expectedToken)) {
    return NextResponse.json({ error: "Token inválido" }, { status: 401 })
  }

  let payload: AsaasSubscriptionWebhookPayload
  try {
    payload = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 })
  }

  try {
    // 1º pagamento de uma assinatura recém-criada — mesmo padrão do webhook
    // de checkout avulso: GET /v3/checkouts/{id} não existe na API v3, então
    // resolvemos o payment real via checkoutSession.
    if (payload.event === "CHECKOUT_PAID") {
      const checkoutId = payload.checkout?.id
      const customerId = payload.checkout?.customer
      if (!checkoutId || !customerId) {
        return NextResponse.json({ error: "checkout.id ou checkout.customer ausente" }, { status: 400 })
      }

      const [payment] = await getPaymentsByCheckoutSession(checkoutId, customerId)
      if (!payment || !payment.subscription) {
        console.error("[webhooks/asaas-subscription] CHECKOUT_PAID sem payment.subscription:", checkoutId)
        return NextResponse.json({ received: true, ignored: "no_subscription_on_payment" })
      }

      // Defesa em profundidade: reconsulta na origem antes de ativar.
      const verified = await getPayment(payment.id)
      if (verified.status !== "RECEIVED" && verified.status !== "CONFIRMED") {
        return NextResponse.json({ received: true, ignored: "payment_not_confirmed" })
      }
      if (typeof verified.value === "number" && Math.round(verified.value * 100) !== VIP_SUBSCRIPTION_PRICE_CENTS) {
        console.error(
          "[webhooks/asaas-subscription] valor divergente do plano VIP:",
          verified.value,
          "esperado:",
          VIP_SUBSCRIPTION_PRICE_CENTS
        )
        // Não bloqueia — a Asaas é a fonte de verdade da cobrança real, só alerta pra investigação manual.
      }

      await activateSubscriptionFromWebhook({
        asaasCheckoutId: checkoutId,
        asaasSubscriptionId: payment.subscription,
        asaasPaymentId: payment.id,
      })

      return NextResponse.json({ received: true })
    }

    // Ciclos seguintes — cobrança confirmada de uma assinatura já ativada.
    if (payload.event === "PAYMENT_CONFIRMED" || payload.event === "PAYMENT_RECEIVED") {
      const paymentId = payload.payment?.id
      const subscriptionId = payload.payment?.subscription
      if (!paymentId || !subscriptionId) {
        return NextResponse.json({ received: true, ignored: "not_a_subscription_payment" })
      }

      const verified = await getPayment(paymentId)
      if (verified.status !== "RECEIVED" && verified.status !== "CONFIRMED") {
        return NextResponse.json({ received: true, ignored: "payment_not_confirmed" })
      }
      if (typeof verified.value === "number" && Math.round(verified.value * 100) !== VIP_SUBSCRIPTION_PRICE_CENTS) {
        console.error(
          "[webhooks/asaas-subscription] valor divergente do plano VIP:",
          verified.value,
          "esperado:",
          VIP_SUBSCRIPTION_PRICE_CENTS
        )
      }

      await renewSubscriptionFromWebhook({ asaasSubscriptionId: subscriptionId, asaasPaymentId: paymentId })

      return NextResponse.json({ received: true })
    }

    // Cobrança do ciclo atrasada — não rebaixa na hora, dá benefício da
    // dúvida até vip_expires_at vencer de fato (cron de expiração).
    if (payload.event === "PAYMENT_OVERDUE") {
      const subscriptionId = payload.payment?.subscription
      if (!subscriptionId) {
        return NextResponse.json({ received: true, ignored: "not_a_subscription_payment" })
      }
      await markSubscriptionPastDue(subscriptionId)
      return NextResponse.json({ received: true })
    }

    // Cancelamento feito direto no painel Asaas (fora do nosso endpoint de
    // cancelamento) — idempotente, mesmo padrão do cancelamento manual.
    if (payload.event === "SUBSCRIPTION_DELETED") {
      const subscriptionId = payload.subscription?.id
      if (!subscriptionId) {
        return NextResponse.json({ error: "subscription.id ausente" }, { status: 400 })
      }
      await cancelSubscriptionByAsaasId(subscriptionId)
      return NextResponse.json({ received: true })
    }

    // Checkout abandonado ou expirado antes do 1º pagamento — a linha ainda
    // está 'pending' (criada em POST /api/vip/subscribe) e nunca chegou a
    // ganhar asaas_subscription_id, então cancela por asaas_checkout_id.
    // Sem isso a linha fica presa em 'pending' para sempre e bloqueia
    // qualquer nova tentativa de assinatura (getOngoingSubscriptionForUser).
    if (payload.event === "CHECKOUT_EXPIRED" || payload.event === "CHECKOUT_CANCELED") {
      const checkoutId = payload.checkout?.id
      if (!checkoutId) {
        return NextResponse.json({ error: "checkout.id ausente" }, { status: 400 })
      }
      await cancelSubscriptionByCheckoutId(checkoutId)
      return NextResponse.json({ received: true })
    }

    return NextResponse.json({ received: true, ignored: payload.event })
  } catch (err) {
    console.error("[webhooks/asaas-subscription] Handler error:", err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }
}
