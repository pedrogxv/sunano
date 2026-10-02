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

// ---------------------------------------------------------------------------
// Preço único (serviços)
// ---------------------------------------------------------------------------
// Serviço não tem desconto no PIX nem acréscimo no cartão: o preço cadastrado
// é o que se paga, em qualquer forma de pagamento. Decidido em 01/10/2026.
// É pela categoria, não por `requires_shipping`: há serviço que precisa de
// endereço (o Xianyu Express despacha o que comprou) e continua sendo serviço.

const SINGLE_PRICE_CATEGORIES = new Set(["services"])

export function isSinglePriceProduct(product: { category?: string | null }): boolean {
  return product.category != null && SINGLE_PRICE_CATEGORIES.has(product.category)
}

/** Preço no cartão de UM item: igual ao PIX quando é preço único. */
export function computeItemCardPriceCents(pixPriceCents: number, discountPercent: number, singlePrice: boolean): number {
  return singlePrice ? pixPriceCents : computeCardPriceCents(pixPriceCents, discountPercent)
}

/**
 * Total no cartão de um carrinho que pode misturar produto e serviço. O
 * acréscimo do cartão é calculado sobre a SOMA dos itens com desconto no PIX
 * (não item a item, que somaria centavos de arredondamento), e o preço único
 * entra como está. É a conta que o checkout cobra e que o carrinho mostra.
 */
export function computeCardTotalCents(
  lines: readonly { priceCents: number; quantity: number; singlePrice?: boolean | null }[],
  discountPercent: number
): number {
  let discountedCents = 0
  let singlePriceCents = 0
  for (const line of lines) {
    const subtotal = line.priceCents * line.quantity
    if (line.singlePrice) singlePriceCents += subtotal
    else discountedCents += subtotal
  }
  return computeCardPriceCents(discountedCents, discountPercent) + singlePriceCents
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

/** Combinação (SKU) selecionada, no que importa para o preço. Ver lib/store-sku.ts. */
export type PricingSku = {
  price_cents: number | null
  promo_price_cents: number | null
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
 *
 * A combinação (`sku`) é o nível mais específico e vence todos: com preço
 * próprio, a promoção que vale é só a dela; sem preço próprio mas com
 * promoção, a promoção dela incide sobre o preço que os níveis de cima
 * decidiram.
 */
export function computeEffectivePrice(
  product: PricingProduct,
  variant: PricingVariant | null,
  options: PricingOption[] = [],
  sku: PricingSku | null = null
): EffectivePrice {
  let baseCents = variant?.price_cents_override ?? product.price_cents
  let groupOverrideApplied = false
  for (const option of options) {
    if (option.price_cents_override != null) {
      baseCents = option.price_cents_override
      groupOverrideApplied = true
    }
  }

  let promoCents = groupOverrideApplied
    ? null
    : variant
      ? (variant.promo_price_cents ??
        (variant.price_cents_override == null ? product.promo_price_cents ?? null : null))
      : product.promo_price_cents ?? null

  if (sku?.price_cents != null) {
    baseCents = sku.price_cents
    promoCents = sku.promo_price_cents
  } else if (sku?.promo_price_cents != null) {
    promoCents = sku.promo_price_cents
  }

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

type CardVariant = PricingVariant & { stock: number | null; is_sold_out?: boolean }

function isVariantSoldOut(variant: CardVariant): boolean {
  return Boolean(variant.is_sold_out) || (variant.stock !== null && variant.stock === 0)
}

/**
 * Variante que o card da vitrine anuncia: a primeira à venda (ou a primeira
 * de todas, se nenhuma estiver). Mesma escolha com que a página do produto
 * abre: sem pular a cor esgotada à mão, o card mostrava foto e preço de uma
 * cor e a página abria em outra.
 */
export function cardActiveVariant<V extends CardVariant>(card: {
  has_variants?: boolean
  variants?: V[] | null
}): V | null {
  const variants = card.variants ?? []
  if (!card.has_variants || variants.length === 0) return null
  return variants.find((variant) => !isVariantSoldOut(variant)) ?? variants[0]
}

/** O card mostra "Esgotado"? Produto esgotado à mão, ou a variante anunciada sem estoque. */
export function isCardSoldOut(card: {
  is_sold_out?: boolean
  stock: number | null
  has_variants?: boolean
  variants?: CardVariant[] | null
}): boolean {
  if (card.is_sold_out) return true
  const variant = cardActiveVariant(card)
  return variant ? isVariantSoldOut(variant) : card.stock !== null && card.stock === 0
}

/**
 * Preço que o card mostra. A ordenação "Menor preço" usa este, não a coluna
 * `price_cents`: ordenar pelo preço cheio punha um produto em promoção na
 * posição do preço que ele não está cobrando.
 */
export function computeCardDisplayPrice(
  card: PricingProduct & { has_variants?: boolean; variants?: (PricingVariant & { stock: number | null })[] | null }
): EffectivePrice {
  return computeEffectivePrice(card, cardActiveVariant(card))
}
