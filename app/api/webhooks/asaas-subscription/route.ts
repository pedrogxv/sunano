import { NextRequest, NextResponse } from "next/server"
import { secretsMatch } from "@/lib/server/secret-compare"

import {
  getPayment,
  getPaymentsByCheckoutSession,
  isSubscriptionLiveAtAsaas,
} from "@/lib/server/integrations/asaas"
import {
  activateSubscriptionFromWebhook,
  activatePixSubscriptionFromWebhook,
  setPendingPixPayment,
  renewSubscriptionFromWebhook,
  markSubscriptionPastDue,
  endSubscriptionByAsaasId,
  cancelSubscriptionByCheckoutId,
  getLatestSubscriptionByAsaasId,
  getLatestSubscriptionByCheckoutId,
  reactivateSubscriptionRecord,
} from "@/lib/server/repositories/vip-subscription-repository"
import { getVipPlan, type VipBillingPeriod } from "@/lib/vip-plan"

/**
 * `true` quando o valor confirmado na origem está longe demais do plano
 * CONTRATADO para ser tratado como cobrança legítima — nesse caso NÃO
 * concedemos nem renovamos o acesso (defesa contra assinatura adulterada no
 * painel da Asaas). Valor ausente no payload não bloqueia.
 *
 * A validação é POR PLANO, contra o `billing_period` gravado na linha local.
 * Com um único preço global, a chegada do plano anual abriria duas brechas ao
 * mesmo tempo:
 *
 *   • uma tolerância larga o bastante para aceitar R$ 89,90 aceitaria também
 *     qualquer coisa entre R$ 8,90 e R$ 89,90 numa assinatura MENSAL;
 *   • e uma cobrança de R$ 8,90 numa assinatura marcada como ANUAL passaria
 *     batido, concedendo 12 meses pelo preço de 1.
 *
 * Comparando com o preço do plano da linha, cada assinatura só aceita o valor
 * da sua própria faixa. A folga (metade do preço do plano) existe para não
 * brigar com reajuste legítimo: assinaturas antigas seguem no valor antigo
 * depois de uma edição de `lib/vip-plan.ts` + deploy. O objetivo é barrar uma
 * assinatura adulterada para R$ 0,01, não recusar quem paga o preço de ontem.
 */
function isPaymentValueOffPlan(value: unknown, billingPeriod: VipBillingPeriod): boolean {
  if (typeof value !== "number") return false
  const expected = getVipPlan(billingPeriod).priceCents
  const cents = Math.round(value * 100)
  return Math.abs(cents - expected) > Math.round(expected / 2)
}

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

/**
 * As RPCs `activate_vip_subscription`/`renew_vip_subscription` sinalizam
 * "essa assinatura não existe aqui" com `raise exception
 * 'subscription_not_found'`, que o supabase-js entrega como um PostgrestError
 * de code P0001 (raise_exception) e `message` igual ao texto levantado.
 */
function isSubscriptionNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { message?: unknown }).message === "subscription_not_found"
  )
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.ASAAS_WEBHOOK_SUBSCRIPTION_TOKEN
  if (!expectedToken) {
    console.error("ASAAS_WEBHOOK_SUBSCRIPTION_TOKEN não configurado — recusando webhook.")
    return NextResponse.json({ error: "Webhook não configurado" }, { status: 500 })
  }

  const providedToken = request.headers.get("asaas-access-token") ?? ""
  if (!secretsMatch(providedToken, expectedToken)) {
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

      // A linha local é lida ANTES de qualquer decisão porque é ela que diz
      // qual plano foi contratado — e o valor aceitável depende disso. O
      // webhook nunca é a fonte do plano: se fosse, bastaria uma cobrança
      // adulterada para transformar 1 mês em 12.
      const local = await getLatestSubscriptionByCheckoutId(checkoutId)

      // REATIVAÇÃO dentro do período já pago: a cobrança nasce agendada para
      // o FIM desse período (`nextDueDate` = `vip_expires_at`, ver
      // POST /api/vip/subscribe), então o payment fica `PENDING` até lá e
      // NUNCA chega em RECEIVED/CONFIRMED agora. O checkout serviu só para
      // cadastrar o cartão.
      //
      // A evidência de sucesso aqui não é o pagamento — é a ASSINATURA estar
      // viva na Asaas. Exigir payment confirmado fazia a linha local ficar
      // presa em `pending` para sempre, exibindo "Renovação em andamento" a
      // um VIP ativo que já tinha cadastrado o cartão.
      //
      // Usa `reactivateSubscriptionRecord` (e não `activateSubscriptionFromWebhook`):
      // aquela SOMA um mês ao acesso, o que seria conceder tempo não pago. A
      // reativação só religa a cobrança futura — o período atual já foi pago
      // no ciclo anterior.
      if (verified.status !== "RECEIVED" && verified.status !== "CONFIRMED") {
        const live = await isSubscriptionLiveAtAsaas(payment.subscription)

        if (live && local?.currentPeriodEnd && new Date(local.currentPeriodEnd) > new Date()) {
          await reactivateSubscriptionRecord({
            id: local.id,
            userId: local.userId,
            asaasCustomerId: local.asaasCustomerId ?? "",
            paymentMethod: local.paymentMethod,
            asaasSubscriptionId: payment.subscription,
            currentPeriodEnd: local.currentPeriodEnd,
            // Preserva o plano que o usuário escolheu ao reativar — ele já foi
            // gravado por POST /api/vip/subscribe e a cobrança agendada na
            // Asaas é a desse plano. Reescrever com um default aqui faria uma
            // reativação no anual conceder 1 mês quando aquela cobrança de
            // R$ 89,90 fosse confirmada.
            billingPeriod: local.billingPeriod,
          })
          return NextResponse.json({ received: true, reactivated: true })
        }

        return NextResponse.json({ received: true, ignored: "payment_not_confirmed" })
      }
      // Sem linha local não há plano contratado para comparar. Cai no mensal
      // (o mais barato) em vez de aceitar qualquer valor: a RPC logo abaixo
      // levanta `subscription_not_found` nesse caso de qualquer forma.
      const checkoutPlan = local?.billingPeriod ?? "monthly"
      if (isPaymentValueOffPlan(verified.value, checkoutPlan)) {
        console.error(
          "[webhooks/asaas-subscription] CHECKOUT_PAID com valor fora do plano VIP — acesso NÃO concedido:",
          verified.value,
          "plano:",
          checkoutPlan,
          "esperado:",
          getVipPlan(checkoutPlan).priceCents
        )
        return NextResponse.json({ received: true, ignored: "payment_value_off_plan" })
      }

      await activateSubscriptionFromWebhook({
        asaasCheckoutId: checkoutId,
        asaasSubscriptionId: payment.subscription,
        asaasPaymentId: payment.id,
      })

      return NextResponse.json({ received: true })
    }

    // Nova cobrança gerada pela assinatura. Só interessa no PIX: é o QR que
    // o usuário precisa pagar naquele ciclo. No cartão a Asaas cobra sozinha
    // o cartão tokenizado, não há nada para o usuário fazer.
    if (payload.event === "PAYMENT_CREATED") {
      const paymentId = payload.payment?.id
      const subscriptionId = payload.payment?.subscription
      if (!paymentId || !subscriptionId) {
        return NextResponse.json({ received: true, ignored: "not_a_subscription_payment" })
      }

      const local = await getLatestSubscriptionByAsaasId(subscriptionId)
      if (!local || local.paymentMethod !== "pix") {
        return NextResponse.json({ received: true, ignored: "not_a_pix_subscription" })
      }

      await setPendingPixPayment({ asaasSubscriptionId: subscriptionId, asaasPaymentId: paymentId })
      return NextResponse.json({ received: true })
    }

    // Cobrança confirmada de uma assinatura. No cartão isto é sempre uma
    // RENOVAÇÃO (o 1º pagamento chega como CHECKOUT_PAID). No PIX não existe
    // checkout, então o 1º pagamento chega por aqui também — e a assinatura
    // ainda está `pending`, precisando de ATIVAÇÃO, não de renovação.
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

      // A linha local vem ANTES da validação de valor: é ela que carrega o
      // plano contratado, e é contra o preço DESSE plano que o valor pago tem
      // de ser conferido. Validar contra um preço fixo aceitaria R$ 8,90 numa
      // assinatura anual — 12 meses de acesso pelo preço de 1.
      const local = await getLatestSubscriptionByAsaasId(subscriptionId)
      const renewalPlan = local?.billingPeriod ?? "monthly"
      if (isPaymentValueOffPlan(verified.value, renewalPlan)) {
        console.error(
          "[webhooks/asaas-subscription] renovação com valor fora do plano VIP — acesso NÃO renovado:",
          verified.value,
          "plano:",
          renewalPlan,
          "esperado:",
          getVipPlan(renewalPlan).priceCents
        )
        return NextResponse.json({ received: true, ignored: "payment_value_off_plan" })
      }

      // Assinatura PIX ainda não ativada = este é o 1º pagamento dela.
      // `activate_vip_subscription_pix` localiza por asaas_subscription_id
      // (no PIX não há asaas_checkout_id para a RPC do cartão usar).
      if (local?.paymentMethod === "pix" && local.status === "pending") {
        await activatePixSubscriptionFromWebhook({
          asaasSubscriptionId: subscriptionId,
          asaasPaymentId: paymentId,
        })
        return NextResponse.json({ received: true })
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

    // Assinatura encerrada na Asaas fora do nosso endpoint: ou o usuário
    // cancelou pelo painel deles, ou — mais comum — a Asaas a excluiu
    // sozinha depois de esgotar as tentativas de cobrança do cartão
    // recusado. `endSubscriptionByAsaasId` distingue os dois casos pelo
    // status atual da linha: se estava `past_due` (último ciclo não pago),
    // corta `vip_expires_at` para agora — não há mais cobrança para
    // renovar, e segurar um mês inteiro de graça seria brecha. Se estava
    // `active` (em dia, exclusão por outro motivo), mantém o período pago.
    // Idempotente.
    if (payload.event === "SUBSCRIPTION_DELETED") {
      const subscriptionId = payload.subscription?.id
      if (!subscriptionId) {
        return NextResponse.json({ error: "subscription.id ausente" }, { status: 400 })
      }
      await endSubscriptionByAsaasId(subscriptionId)
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

      // Defesa em profundidade antes de encerrar a linha: este evento pode
      // chegar DEPOIS de o checkout ter sido pago — reentrega atrasada, ou a
      // corrida entre o usuário clicando "cancelar checkout" e a confirmação
      // do pagamento. Marcar `canceled` por cima de uma assinatura recém-paga
      // tiraria o VIP de quem acabou de pagar.
      //
      // `GET /v3/checkouts/{id}` não existe na API v3, mas os payments do
      // checkout são consultáveis — mesma verificação que o webhook da loja
      // já faz antes de devolver estoque.
      //
      // Só aborta com evidência POSITIVA de pagamento: falha de rede ou
      // `customer` ausente não podem impedir a liberação da trava, senão uma
      // instabilidade da Asaas prende o usuário em `pending`.
      const customerId = payload.checkout?.customer
      if (customerId) {
        try {
          const payments = await getPaymentsByCheckoutSession(checkoutId, customerId)
          const paid = payments.find(
            (p) => p.status === "RECEIVED" || p.status === "CONFIRMED" || p.status === "RECEIVED_IN_CASH"
          )
          if (paid) {
            console.warn(
              `[webhooks/asaas-subscription] ${payload.event} ignorado: checkout ${checkoutId} tem pagamento ${paid.id} (${paid.status}).`
            )
            return NextResponse.json({ received: true, ignored: "already_paid" })
          }
        } catch (err) {
          console.error("[webhooks/asaas-subscription] verificação de pagamento antes de cancelar:", err)
        }
      }

      await cancelSubscriptionByCheckoutId(checkoutId)
      return NextResponse.json({ received: true })
    }

    return NextResponse.json({ received: true, ignored: payload.event })
  } catch (err) {
    // `subscription_not_found` é erro PERMANENTE, não transitório: a Asaas
    // está entregando um evento de uma assinatura que não existe aqui
    // (assinatura criada num ambiente/base anterior, ou cujo CHECKOUT_PAID
    // nunca chegou ao servidor — comum em sandbox, onde a URL do ngrok muda
    // e os eventos ficam presos na fila). Retentar não vai mudar o
    // resultado, e devolver 500 só faz a Asaas penalizar o webhook e
    // reenfileirar para sempre. Reconhecemos com 200 + `ignored` e logamos
    // para investigação. Qualquer outro erro (rede, banco fora) continua
    // 500, que é onde o retry da Asaas de fato ajuda.
    if (isSubscriptionNotFound(err)) {
      console.error(
        "[webhooks/asaas-subscription] assinatura desconhecida — evento descartado:",
        payload.event,
        payload.payment?.subscription ?? payload.subscription?.id ?? payload.checkout?.id
      )
      return NextResponse.json({ received: true, ignored: "subscription_not_found" })
    }
    console.error("[webhooks/asaas-subscription] Handler error:", err)
    return NextResponse.json({ error: "Handler error" }, { status: 500 })
  }
}
