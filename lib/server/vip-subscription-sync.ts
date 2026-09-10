import "server-only"

import { isSubscriptionLiveAtAsaas } from "@/lib/server/integrations/asaas"
import {
  getOngoingSubscriptionForUser,
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
 *  • linha `pending` sem subscription id -> checkout ainda não pago; não há o
 *    que consultar na Asaas (o id só nasce no CHECKOUT_PAID). Mantém a trava:
 *    o checkout expira sozinho e o webhook CHECKOUT_EXPIRED a libera.
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
  // `asaas_subscription_id` para consultar. Deixa como está — o fluxo de
  // expiração do checkout (CHECKOUT_EXPIRED/CHECKOUT_CANCELED) cuida dele.
  if (!ongoing.asaasSubscriptionId) {
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
