import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { AsaasError, cancelCheckout, getPaymentsByCheckoutSession } from "@/lib/server/integrations/asaas"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import {
  cancelSubscriptionForUser,
  clearCheckoutFields,
  getLatestSubscriptionForUser,
} from "@/lib/server/repositories/vip-subscription-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/vip/checkout/cancel — desiste de um checkout de assinatura
 * (cartão) que foi aberto mas nunca pago.
 *
 * POR QUE É UM ENDPOINT SEPARADO DE /api/vip/cancel
 * -------------------------------------------------
 * São operações diferentes na Asaas. `/api/vip/cancel` faz
 * `DELETE /v3/subscriptions/{id}` — e no fluxo de cartão esse id só passa a
 * existir depois do 1º pagamento (CHECKOUT_PAID). Enquanto o checkout está
 * em aberto não há assinatura nenhuma para excluir, então aquele endpoint
 * respondia 404 e o usuário ficava sem saída: `/subscribe` recusava com 409
 * pela trava de "assinatura em andamento", e a única orientação da interface
 * era esperar o checkout expirar — até uma hora, e para sempre caso o webhook
 * CHECKOUT_EXPIRED se perdesse.
 *
 * Aqui a chamada é `POST /v3/checkouts/{id}/cancel`, que encerra a página
 * hospedada. Cancelar um checkout não pago NÃO gera estorno nem cobrança: o
 * cartão sequer chegou a ser tokenizado.
 *
 * SEGURANÇA
 * ---------
 * O checkout a cancelar é sempre resolvido a partir do USUÁRIO DA SESSÃO —
 * nunca de um id vindo do corpo da requisição. Aceitar um `checkoutId` do
 * cliente deixaria qualquer pessoa autenticada cancelar o checkout de outra.
 * O corpo desta requisição é ignorado por completo, de propósito.
 */
export async function POST(request: NextRequest) {
  const clientId = getClientIdentifier(request)
  const rateLimit = await checkRateLimit({
    action: "vip_checkout_cancel",
    identifier: clientId,
    maxAttempts: 5,
    windowSeconds: 600,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 }
    )
  }

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
  }

  const subscription = await getLatestSubscriptionForUser(user.id)

  // Só um checkout de cartão REALMENTE em aberto é cancelável por aqui: linha
  // `pending`, com id de checkout e ainda sem assinatura na Asaas. Depois que
  // a assinatura existe, quem cancela é /api/vip/cancel — que também precisa
  // preservar o período já pago, coisa que este endpoint não faz.
  if (
    !subscription ||
    subscription.status !== "pending" ||
    !subscription.asaasCheckoutId ||
    subscription.asaasSubscriptionId
  ) {
    return NextResponse.json(
      { error: "Nenhum checkout em aberto para cancelar.", code: "no_pending_checkout" },
      { status: 404 }
    )
  }

  // ANTES de cancelar: o checkout pode ter sido pago entre o carregamento da
  // tela e este clique. `GET /v3/checkouts/{id}` não existe na API v3, mas o
  // payment gerado pelo checkout é consultável — é a mesma verificação que o
  // webhook da loja já faz antes de reverter estoque.
  //
  // Só aborta com evidência POSITIVA de pagamento: uma falha de rede não pode
  // prender o usuário no estado que este endpoint existe para destravar.
  if (subscription.asaasCustomerId) {
    try {
      const payments = await getPaymentsByCheckoutSession(
        subscription.asaasCheckoutId,
        subscription.asaasCustomerId
      )
      const paid = payments.find(
        (p) => p.status === "RECEIVED" || p.status === "CONFIRMED" || p.status === "RECEIVED_IN_CASH"
      )
      if (paid) {
        return NextResponse.json(
          {
            error:
              "Este checkout já foi pago. Sua assinatura está sendo ativada — atualize a página em instantes.",
            code: "checkout_already_paid",
          },
          { status: 409 }
        )
      }
    } catch (err) {
      console.error("[vip/checkout/cancel] verificação de pagamento:", err)
    }
  }

  // Asaas PRIMEIRO, banco depois — mesma ordem de /api/vip/cancel. Inverter
  // deixaria a trava local liberada com um checkout ainda vivo lá, que o
  // usuário poderia pagar em outra aba enquanto abre uma segunda assinatura.
  try {
    await cancelCheckout(subscription.asaasCheckoutId)
  } catch (err) {
    // 400/404 = a Asaas já não considera este checkout cancelável (expirado,
    // já cancelado, ou removido). O objetivo — nada mais pode ser cobrado por
    // ele — está cumprido, então segue para limpar o lado local em vez de
    // travar a interface com um 502.
    const goneAtAsaas =
      err instanceof AsaasError && (err.status === 404 || err.status === 400)
    if (!goneAtAsaas) {
      console.error("[vip/checkout/cancel] cancelCheckout:", err)
      return NextResponse.json({ error: "Não foi possível cancelar o checkout." }, { status: 502 })
    }
    console.warn(
      "[vip/checkout/cancel] checkout já não cancelável na Asaas, limpando local:",
      subscription.asaasCheckoutId
    )
  }

  // Libera a trava de "assinatura em andamento". O webhook CHECKOUT_CANCELED
  // fará o mesmo quando chegar — ambos são idempotentes, e não depender dele
  // é justamente o ponto: é a entrega perdida desse evento que prendia a
  // linha em `pending` para sempre.
  await cancelSubscriptionForUser(user.id)
  await clearCheckoutFields(user.id)

  return NextResponse.json({ ok: true })
}
