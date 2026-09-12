/**
 * Estado do VIP e da assinatura, resolvido UMA vez para toda a interface.
 *
 * POR QUE ISTO EXISTE
 * -------------------
 * Sidebar, dropdown da topbar, aba de assinatura e o modal de upsell cada um
 * decidia sozinho o que mostrar, a partir de um booleano diferente:
 *
 *   • a sidebar escondia o Changelog e mostrava "Renovar VIP" só com
 *     `subscriptionCanceled`, ignorando que o período pago ainda corria —
 *     quem cancelou perdia o link do Changelog sendo VIP ativo;
 *   • o dropdown mostrava "RENOVAR" ao lado do selo VIP;
 *   • a aba de assinatura, que lê `/api/vip/subscription`, chamava a mesma
 *     ação de "Reativar assinatura".
 *
 * Três telas, três verbos, para o mesmo usuário no mesmo instante. Pior que
 * o texto: "cancelou" não é UM estado. Cancelar com período pago restante e
 * cancelar depois do vencimento levam a ações opostas — a primeira não cobra
 * nada (só religa a recorrência, ver a RPC `reactivate_vip_subscription`), a
 * segunda é uma assinatura nova com cobrança no ato. Um booleano não tem
 * como carregar essa diferença, e foi por isso que ela se perdeu em duas das
 * três telas.
 *
 * Módulo puro (sem I/O, sem `server-only`): serve Client Components, o
 * contexto de auth e os repositórios igualmente.
 */

import { isVipActive } from "@/lib/account-tier"

/** Status da assinatura recorrente, como gravado em `vip_subscriptions`. */
export type VipSubscriptionStatus = "pending" | "active" | "past_due" | "canceled" | "expired"

/**
 * O que a interface deve oferecer sobre o VIP. Um valor, mutuamente
 * exclusivo — é ele que os componentes consomem, nunca os campos crus.
 *
 *  - `none`         — nunca assinou e não é VIP. CTA: "Seja VIP" (cobra).
 *  - `active`       — VIP com assinatura em dia. Sem CTA; mostra o Changelog.
 *  - `pending`      — assinou, aguardando o 1º pagamento. Sem CTA de compra.
 *  - `past_due`     — VIP ativo, mas a cobrança do ciclo falhou. CTA: regularizar.
 *  - `reactivatable`— CANCELOU e o período pago AINDA corre. CTA: "Reativar
 *                     assinatura", e **nenhuma cobrança agora**. Continua
 *                     sendo VIP para todo efeito (selo, Changelog, limites).
 *  - `lapsed`       — cancelou/expirou e o acesso já acabou. CTA: "Assinar de
 *                     novo" (cobra normalmente, é assinatura nova).
 *  - `granted`      — VIP sem assinatura por trás (Aura ou concedido pela
 *                     equipe). Sem CTA de assinatura.
 */
export type VipUiState =
  | "none"
  | "active"
  | "pending"
  | "past_due"
  | "reactivatable"
  | "lapsed"
  | "granted"

export type VipStatusInput = {
  accountTier: string | null | undefined
  vipExpiresAt: string | null | undefined
  /** `null` = nunca assinou (distinto de ter assinado e cancelado). */
  subscriptionStatus: VipSubscriptionStatus | string | null | undefined
}

export type VipStatus = {
  state: VipUiState
  /** VIP valendo AGORA — inclui `reactivatable` e `past_due`. */
  isVip: boolean
  /** Existe uma assinatura recorrente viva (cobrança acontecendo ou por acontecer). */
  hasLiveSubscription: boolean
  /**
   * Reativar desfaz o cancelamento SEM cobrar nada agora. Só verdadeiro em
   * `reactivatable` — é a condição que o `POST /api/vip/subscribe` também
   * exige, e que a RPC reconfere com a linha do perfil travada.
   */
  canReactivate: boolean
  /** Assinar do zero, com cobrança imediata. */
  canSubscribe: boolean
}

/**
 * Resolve o estado. Recebe os campos crus (os mesmos que `/api/auth/me` e
 * `/api/vip/subscription` devolvem) para que as duas fontes não possam
 * divergir: elas alimentam esta função, não regras próprias.
 */
export function resolveVipStatus(input: VipStatusInput): VipStatus {
  const vipNow = isVipActive(input.accountTier, input.vipExpiresAt)
  const status = input.subscriptionStatus ?? null

  const build = (state: VipUiState, over: Partial<VipStatus> = {}): VipStatus => ({
    state,
    isVip: vipNow,
    hasLiveSubscription: false,
    canReactivate: false,
    canSubscribe: false,
    ...over,
  })

  if (status === "active") return build("active", { hasLiveSubscription: true })
  if (status === "pending") return build("pending", { hasLiveSubscription: true })
  if (status === "past_due") return build("past_due", { hasLiveSubscription: true })

  if (status === "canceled" || status === "expired") {
    // A bifurcação que o booleano `subscriptionCanceled` não conseguia
    // expressar, e a razão de este módulo existir.
    return vipNow
      ? build("reactivatable", { canReactivate: true })
      : build("lapsed", { canSubscribe: true })
  }

  // Sem assinatura registrada: ou é VIP por Aura/concessão, ou não é nada.
  return vipNow ? build("granted") : build("none", { canSubscribe: true })
}

/**
 * Rótulo do CTA de assinatura, ou `null` quando não há o que oferecer.
 *
 * Centralizar o VERBO aqui é o que impede a volta de "Renovar" numa tela e
 * "Reativar" noutra para o mesmo estado. "Renovar" saiu do vocabulário: não
 * há renovação manual — ou a recorrência religa (reativar, sem cobrança) ou
 * é assinatura nova (assinar, com cobrança).
 */
export function vipCtaLabel(status: VipStatus): string | null {
  if (status.canReactivate) return "Reativar assinatura"
  if (status.state === "lapsed") return "Assinar de novo"
  if (status.state === "none") return "Seja VIP"
  return null
}

/** Versão curta do mesmo rótulo, para onde não cabe a frase inteira (dropdown). */
export function vipCtaShortLabel(status: VipStatus): string | null {
  if (status.canReactivate) return "Reativar"
  if (status.state === "lapsed") return "Assinar"
  if (status.state === "none") return "Seja VIP"
  return null
}
