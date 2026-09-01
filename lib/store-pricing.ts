/**
 * Preços da loja em função da forma de pagamento.
 *
 * O preço cadastrado no produto é o preço À VISTA NO PIX. O cartão de crédito
 * é o mesmo produto SEM o desconto do PIX — ou seja, o PIX é `discountPercent`
 * mais barato que o cartão, exatamente o número que a loja anuncia.
 *
 * Por isso a conta é uma DIVISÃO, não um acréscimo: se somássemos 10% ao preço
 * PIX (700 → 770), o desconto real do PIX sobre o cartão seria 9,09%, e a tela
 * mostraria "10% de desconto" cobrando outro número. Dividindo (700 → 777,78),
 * 10% de 777,78 são exatamente os R$ 77,78 de diferença.
 *
 * `discountPercent` é configurável pelo admin em store_settings (coluna
 * `card_surcharge_percent`, mantida com o nome antigo) e chega ao cliente via
 * /api/store/settings.
 */

/** Guarda o percentual na faixa válida — 100% (ou mais) zeraria/estouraria a divisão. */
function safeDiscountPercent(discountPercent: number): number {
  if (!Number.isFinite(discountPercent)) return 0
  return Math.min(Math.max(discountPercent, 0), 99)
}

/** Preço no cartão de crédito a partir do preço PIX (o preço cadastrado). */
export function computeCardPriceCents(pixPriceCents: number, discountPercent: number): number {
  const pct = safeDiscountPercent(discountPercent)
  if (pct === 0) return pixPriceCents
  return Math.round(pixPriceCents / (1 - pct / 100))
}

/**
 * Desconto em centavos que o cliente economiza pagando no PIX. Derivado do
 * preço do cartão para que "cartão − desconto" feche sempre com o preço PIX
 * exibido, sem sobra de 1 centavo por arredondamento.
 */
export function computePixDiscountCents(pixPriceCents: number, discountPercent: number): number {
  return computeCardPriceCents(pixPriceCents, discountPercent) - pixPriceCents
}
