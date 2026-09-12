import "server-only"

import {
  getPaymentsByCheckoutSession,
  isSubscriptionLiveAtAsaas,
} from "@/lib/server/integrations/asaas"
import {
  activateSubscriptionFromWebhook,
  cancelSubscriptionForUser,
  reactivateSubscriptionRecord,
  getOngoingSubscriptionForUser,
  getLatestSubscriptionForUser,
  isCheckoutExpired,
  reconcileSubscriptionWithAsaas,
  type VipSubscription,
} from "@/lib/server/repositories/vip-subscription-repository"

/**
 * Reconciliação da assinatura VIP entre o banco local e a Asaas.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * `vip_subscriptions` é um ESPELHO do que existe na Asaas, mantido por
 * webhook. Espelho mantido por webhook diverge — é questão de quando, não de
 * se: entrega perdida enquanto o deploy reiniciava, URL de sandbox trocada,
 * cancelamento feito direto no painel da Asaas, ou um cancel nosso que foi
 * até a Asaas mas cujo commit local falhou depois.
 *
 * Enquanto a divergência durava, o usuário ficava preso: a linha `active`
 * órfã ocupava a trava de "assinatura em andamento" em POST /api/vip/subscribe
 * e devolvia 409 — sem VIP e sem poder reassinar. Pior ainda quando a
 * assinatura seguia viva lá: cobrança todo mês, nenhum acesso.
 *
 * A regra é uma só: quando as duas bases discordam, a ASAAS VENCE — é ela
 * que efetivamente cobra o cartão.
 */

export type VipSyncResult = {
  /** Assinatura local após a reconciliação (null = trava livre para assinar). */
  ongoing: VipSubscription | null
  /** `true` quando a reconciliação de fato mudou algo (log/telemetria). */
  changed: boolean
  /**
   * `true` quando a Asaas não pôde ser consultada. Quem chama deve tratar o
   * estado local como "não confirmado" em vez de agir como se estivesse
   * validado — nunca liberar uma 2ª cobrança em cima de dúvida.
   */
  unverified: boolean
}

/**
 * Confere a assinatura "em andamento" do usuário contra a Asaas e conserta o
 * estado local se preciso. Devolve a assinatura que AINDA bloqueia uma nova
 * assinatura (ou `null` se a trava foi liberada).
 *
 * Casos:
 *  • sem linha em andamento          -> nada a fazer, trava livre.
 *  • linha `pending` sem subscription id -> checkout hospedado. Consulta os
 *    payments dele: se foi PAGO, ATIVA a assinatura (recupera um
 *    CHECKOUT_PAID perdido). Se não foi e o prazo venceu, libera a trava sem
 *    depender do CHECKOUT_EXPIRED. Se não deu para consultar, `unverified` —
 *    nunca cancela em cima de dúvida.
 *  • Asaas diz que não cobra mais    -> marca canceled, LIBERA a trava.
 *  • Asaas diz que ainda cobra       -> mantém a trava e garante que o VIP
 *    local reflita o que está sendo pago.
 *  • Asaas inacessível               -> mantém tudo, sinaliza `unverified`.
 */
export async function syncSubscriptionWithAsaas(userId: string): Promise<VipSyncResult> {
  const ongoing = await getOngoingSubscriptionForUser(userId)
  if (!ongoing) {
    return { ongoing: null, changed: false, unverified: false }
  }

  // Checkout em aberto que nunca chegou a virar assinatura na Asaas: não há
  // `asaas_subscription_id` para consultar, e `GET /v3/checkouts/{id}` não
  // existe na API v3 — então não há nada a perguntar à Asaas sobre ele.
  if (!ongoing.asaasSubscriptionId) {
    // ANTES de qualquer conclusão: o checkout pode ter sido PAGO e o
    // CHECKOUT_PAID ter se perdido. Nesse caso a linha segue `pending` sem
    // assinatura, exibindo "pagamento em andamento" para quem já pagou — e,
    // pior, o ramo de expiração abaixo cancelaria a assinatura de um pagante.
    //
    // Os payments do checkout são consultáveis (é a mesma evidência que o
    // webhook usa), então a reconciliação ATIVA o que o webhook deixou
    // passar. `activateSubscriptionFromWebhook` é idempotente — se o webhook
    // chegar atrasado depois disto, não duplica nada.
    if (ongoing.asaasCheckoutId && ongoing.asaasCustomerId) {
      try {
        const payments = await getPaymentsByCheckoutSession(
          ongoing.asaasCheckoutId,
          ongoing.asaasCustomerId
        )
        const paid = payments.find(
          (p) =>
            (p.status === "RECEIVED" || p.status === "CONFIRMED" || p.status === "RECEIVED_IN_CASH") &&
            p.subscription
        )
        if (paid?.subscription) {
          await activateSubscriptionFromWebhook({
            asaasCheckoutId: ongoing.asaasCheckoutId,
            asaasSubscriptionId: paid.subscription,
            asaasPaymentId: paid.id,
          })
          console.warn(
            "[vip-sync] CHECKOUT_PAID perdido — assinatura ativada pela reconciliação:",
            ongoing.asaasCheckoutId
          )
          // Relê: a linha acabou de virar `active` com o id da assinatura.
          const activated = await getLatestSubscriptionForUser(userId)
          return { ongoing: activated, changed: true, unverified: false }
        }

        // REATIVAÇÃO com cobrança AGENDADA: o checkout concluiu (o cartão foi
        // cadastrado e a assinatura está viva na Asaas), mas a 1ª cobrança
        // vence só no fim do período já pago — então o payment fica `PENDING`
        // e nunca satisfaz a busca acima.
        //
        // Este é o caso normal de quem reativa dentro do período pago, e sem
        // tratá-lo a linha ficava presa em `pending` PARA SEMPRE: a aba
        // exibia "Renovação em andamento" com botão de cancelar para um VIP
        // ativo que já tinha feito tudo certo.
        //
        // `reactivateSubscriptionRecord` (e não `activateSubscriptionFromWebhook`)
        // porque aquela SOMA um mês — concederia tempo que ninguém pagou.
        const scheduled = payments.find((p) => p.status === "PENDING" && p.subscription)
        const periodEnd = ongoing.currentPeriodEnd
        if (scheduled?.subscription && periodEnd && new Date(periodEnd) > new Date()) {
          const live = await isSubscriptionLiveAtAsaas(scheduled.subscription)
          if (live) {
            await reactivateSubscriptionRecord({
              id: ongoing.id,
              userId: ongoing.userId,
              asaasCustomerId: ongoing.asaasCustomerId ?? "",
              paymentMethod: ongoing.paymentMethod,
              asaasSubscriptionId: scheduled.subscription,
              currentPeriodEnd: periodEnd,
              // Plano preservado: quem reativou no anual tem R$ 89,90 agendado
              // na Asaas, e é esse plano que define o acesso quando a cobrança
              // for confirmada. Um default aqui concederia 1 mês por ela.
              billingPeriod: ongoing.billingPeriod,
            })
            console.warn(
              "[vip-sync] reativação com cobrança agendada — linha ativada pela reconciliação:",
              ongoing.asaasCheckoutId
            )
            const activated = await getLatestSubscriptionForUser(userId)
            return { ongoing: activated, changed: true, unverified: false }
          }
        }
      } catch (err) {
        // Sem conseguir consultar, não se conclui nada — e em particular NÃO
        // se cancela: prosseguir para o ramo de expiração poderia derrubar a
        // assinatura de quem pagou. Sinaliza `unverified` e preserva tudo.
        console.error("[vip-sync] falha ao verificar pagamento do checkout:", err)
        return { ongoing, changed: false, unverified: true }
      }
    }

    // Comprovadamente não pago. Se o PRAZO já passou, o checkout não cobra
    // mais nada e não pode continuar travando uma nova assinatura. Antes isso
    // dependia exclusivamente do webhook CHECKOUT_EXPIRED: perdida aquela
    // entrega (deploy no meio, URL trocada — os mesmos cenários que
    // justificam toda esta reconciliação), a linha ficava presa em `pending`
    // PARA SEMPRE e o usuário não conseguia nem assinar nem cancelar.
    if (isCheckoutExpired(ongoing)) {
      const changed = await cancelSubscriptionForUser(ongoing.userId)
      console.warn(
        "[vip-sync] checkout hospedado vencido sem webhook — trava liberada localmente:",
        ongoing.asaasCheckoutId
      )
      return { ongoing: null, changed, unverified: false }
    }
    return { ongoing, changed: false, unverified: false }
  }

  const live = await isSubscriptionLiveAtAsaas(ongoing.asaasSubscriptionId)

  if (live === null) {
    // Asaas fora do ar: não se conclui nada a partir de indisponibilidade.
    return { ongoing, changed: false, unverified: true }
  }

  const changed = await reconcileSubscriptionWithAsaas({ userId, asaasActive: live })

  if (!live) {
    console.warn(
      "[vip-sync] assinatura inexistente/inativa na Asaas — trava liberada localmente:",
      ongoing.asaasSubscriptionId
    )
    return { ongoing: null, changed, unverified: false }
  }

  return { ongoing, changed, unverified: false }
}
