/**
 * Quando um cartão AUTORIZADO (captura manual, ver `createStripeCardPayment`)
 * vira cobrança de verdade. Módulo puro: a decisão sai só dos sinais que o
 * Stripe devolve na cobrança, sem I/O, para ser testável e igual em todo
 * caminho que captura (webhook e aprovação no admin).
 *
 *   • `reject`  → solta a autorização (o cliente não é cobrado) e o pedido sai
 *                 de "aguardando pagamento";
 *   • `review`  → segura a autorização para um humano decidir no admin;
 *   • `capture` → cobra e libera o pedido.
 *
 * Por que segurar SEM 3DS acima de um valor: o 3DS autenticado passa ao
 * emissor o prejuízo de chargeback por fraude (liability shift). Sem ele, um
 * cartão roubado num pedido caro é perda inteira da loja — produto enviado E
 * dinheiro devolvido na disputa.
 */

/** Acima disso (em centavos), cartão sem 3DS autenticado vai para revisão. */
export const CARD_REVIEW_WITHOUT_3DS_ABOVE_CENTS = 1_500_00

/** 3DS que dá liability shift. `attempt_acknowledged` também conta (o emissor não participa, a responsabilidade é dele). */
const LIABILITY_SHIFT_3DS = new Set(["authenticated", "attempt_acknowledged"])

export type CardCaptureSignals = {
  amountCents: number
  /** `charge.outcome.risk_level` do Radar. */
  riskLevel: string | null
  /** `charge.payment_method_details.card.three_d_secure.result`; null = sem 3DS. */
  threeDSecureResult: string | null
  /** A cobrança está numa revisão aberta do Radar. */
  inRadarReview: boolean
}

export type CardCaptureDecision =
  | { action: "capture" }
  | { action: "review"; reason: string }
  | { action: "reject"; reason: string }

export function decideCardCapture(signals: CardCaptureSignals): CardCaptureDecision {
  const has3ds = signals.threeDSecureResult !== null && LIABILITY_SHIFT_3DS.has(signals.threeDSecureResult)

  // O Radar já bloqueia `highest` por padrão; se uma regra afrouxada deixar
  // passar, a loja não captura mesmo assim.
  if (signals.riskLevel === "highest") {
    return { action: "reject", reason: "Risco máximo no Radar." }
  }
  if (signals.inRadarReview) {
    return { action: "review", reason: "O Radar abriu revisão para esta cobrança." }
  }
  if (signals.riskLevel === "elevated" && !has3ds) {
    return { action: "review", reason: "Risco elevado no Radar sem 3DS autenticado." }
  }
  if (signals.amountCents > CARD_REVIEW_WITHOUT_3DS_ABOVE_CENTS && !has3ds) {
    return {
      action: "review",
      reason: `Valor acima de R$ ${(CARD_REVIEW_WITHOUT_3DS_ABOVE_CENTS / 100).toFixed(2)} sem 3DS autenticado.`,
    }
  }
  return { action: "capture" }
}
