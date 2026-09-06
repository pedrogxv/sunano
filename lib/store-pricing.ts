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

// ---------------------------------------------------------------------------
// Preço efetivo de uma linha de carrinho/pedido
// ---------------------------------------------------------------------------
// A regra de precedência abaixo era duplicada em três lugares — a vitrine
// (ProductCard), a página de produto (ProductDetailContent) e o checkout — e
// o checkout tinha uma versão DIFERENTE das outras duas: ignorava
// `promo_price_cents`, então um produto anunciado em promoção era cobrado
// pelo preço cheio, sem erro nem log. Preço é uma regra só; mora aqui.

/** Variante (cor) selecionada, no que importa para o preço. */
export type PricingVariant = {
  price_cents_override: number | null
  promo_price_cents?: number | null
}

/** Opção de grupo (Switch, Voltagem…) selecionada, no que importa para o preço. */
export type PricingOption = {
  price_cents_override: number | null
}

export type PricingProduct = {
  price_cents: number
  promo_price_cents?: number | null
}

export type EffectivePrice = {
  /** O que será efetivamente cobrado (promo aplicada, se houver). */
  effectiveCents: number
  /** Preço "de", antes da promoção — igual a `effectiveCents` quando não há desconto. */
  baseCents: number
  hasDiscount: boolean
  /** Percentual de desconto arredondado, ou null se não houver. */
  discountPercent: number | null
}

/**
 * Preço efetivo de uma linha, aplicando os overrides nesta ordem (o último
 * presente vence): preço base do produto → override da cor → override de cada
 * opção de grupo selecionada, na ordem de `group.position`.
 *
 * A promoção só se aplica ao nível cujo preço está valendo: um override de
 * grupo (Switch Blue +R$ 50) descarta a promo do produto, porque a promo foi
 * cadastrada sobre o preço base, não sobre a combinação. Mesma razão para
 * `promo_price_cents` do produto ser ignorado quando a cor tem
 * `price_cents_override` — a cor redefiniu o preço, a promo do produto não
 * fala mais sobre ele.
 *
 * `options` deve chegar ordenada por `group.position` (é o que a vitrine e o
 * checkout já fazem) — a ordem decide qual override vence quando há mais de um.
 */
export function computeEffectivePrice(
  product: PricingProduct,
  variant: PricingVariant | null,
  options: PricingOption[] = []
): EffectivePrice {
  let baseCents = variant?.price_cents_override ?? product.price_cents
  let groupOverrideApplied = false
  for (const option of options) {
    if (option.price_cents_override != null) {
      baseCents = option.price_cents_override
      groupOverrideApplied = true
    }
  }

  const promoCents = groupOverrideApplied
    ? null
    : variant
      ? (variant.promo_price_cents ??
        (variant.price_cents_override == null ? product.promo_price_cents ?? null : null))
      : product.promo_price_cents ?? null

  const hasDiscount = promoCents != null && promoCents < baseCents
  const effectiveCents = hasDiscount ? (promoCents as number) : baseCents

  return {
    effectiveCents,
    baseCents,
    hasDiscount,
    discountPercent: hasDiscount
      ? Math.round((1 - (promoCents as number) / baseCents) * 100)
      : null,
  }
}
