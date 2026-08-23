/**
 * Acréscimo do cartão de crédito sobre o preço PIX já efetivo (depois de
 * overrides de variante/opção e promoção) — percentual configurável pelo
 * admin em store_settings, obtido via /api/store/settings.
 */
export function computeCardPriceCents(pixPriceCents: number, surchargePercent: number): number {
  return Math.round(pixPriceCents * (1 + surchargePercent / 100))
}
