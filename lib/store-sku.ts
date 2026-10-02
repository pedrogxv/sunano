import { computeEffectivePrice, type EffectivePrice, type PricingOption, type PricingProduct, type PricingVariant } from "@/lib/store-pricing"

/**
 * Combinação vendável de um produto (cor + uma opção por grupo), com SKU,
 * preço, promoção, estoque e foto próprios. Mora em `store_product_skus`
 * (migration 20261213000000).
 *
 * Módulo puro: a página do produto, o "Escolher opções" do card, a
 * revalidação do carrinho e o checkout resolvem a seleção por AQUI. Preço e
 * estoque divergindo entre a tela e a cobrança foi o bug que tirou a regra de
 * preço de três cópias e a pôs em `store-pricing.ts`; a combinação segue o
 * mesmo caminho.
 */

export type StoreSku = {
  id: string
  /** Nulo quando o produto não tem Cor, só grupos de opção. */
  variant_id: string | null
  /** Uma opção por grupo, em qualquer ordem (a chave ordena). */
  option_ids: string[]
  sku: string | null
  price_cents: number | null
  promo_price_cents: number | null
  /** `null` = sem controle nesta combinação: vale o estoque da cor/produto. */
  stock: number | null
  image_url: string | null
  is_sold_out: boolean
}

/** Chave estável de uma combinação: a ordem em que as opções foram escolhidas não importa. */
export function skuKey(variantId: string | null, optionIds: readonly string[]): string {
  return `${variantId ?? ""}|${[...optionIds].sort().join(",")}`
}

export function findSku<T extends Pick<StoreSku, "variant_id" | "option_ids">>(
  skus: readonly T[],
  variantId: string | null,
  optionIds: readonly string[]
): T | null {
  const key = skuKey(variantId, optionIds)
  return skus.find((sku) => skuKey(sku.variant_id, sku.option_ids) === key) ?? null
}

type SelectionProduct = PricingProduct & {
  stock: number | null
  is_sold_out: boolean
  sale_type: "pre_order" | "ready_stock" | "normal"
  /** SKU de produto simples (sem cor nem grupo). */
  sku?: string | null
}

type SelectionVariant = PricingVariant & { id: string; stock: number | null; is_sold_out: boolean }

type SelectionOption = PricingOption & { id: string; is_sold_out: boolean }

export type StockSource = "sku" | "variant" | "product"

export type ResolvedSelection = {
  sku: StoreSku | null
  price: EffectivePrice
  /**
   * Estoque que vale para a combinação; `null` = sem controle. Pré-venda é
   * sempre `null`: não há estoque físico, o teto é o lote
   * (`preorder_limit`, conferido por `reserve_preorder`).
   */
  stock: number | null
  /** De onde o checkout tira a unidade: a combinação, a cor ou o produto. */
  stockSource: StockSource
  soldOut: boolean
  /** Código para mostrar e para a separação do pedido. */
  skuCode: string | null
  /** Foto da combinação, se o admin cadastrou uma. Vem antes das da cor na galeria. */
  image: string | null
}

/**
 * O que a seleção atual custa, quanto tem e se dá para comprar.
 *
 * Do mais específico para o mais geral: a combinação vence a cor, que vence o
 * produto. Coluna nula na combinação herda (é o que deixa a matriz opcional:
 * produto sem nenhuma linha se comporta exatamente como antes dela existir).
 *
 * `options` precisa chegar ordenada por `group.position`: a ordem decide qual
 * override de opção vence no preço (ver `computeEffectivePrice`).
 */
export function resolveSelection(
  product: SelectionProduct,
  variant: SelectionVariant | null,
  options: readonly SelectionOption[],
  skus: readonly StoreSku[]
): ResolvedSelection {
  const sku = findSku(skus, variant?.id ?? null, options.map((option) => option.id))
  const isPreOrder = product.sale_type === "pre_order"

  const stockSource: StockSource = sku && sku.stock !== null ? "sku" : variant ? "variant" : "product"
  const physicalStock =
    stockSource === "sku" ? (sku as StoreSku).stock : stockSource === "variant" ? variant!.stock : product.stock
  const stock = isPreOrder ? null : physicalStock

  const soldOut =
    product.is_sold_out ||
    Boolean(variant?.is_sold_out) ||
    options.some((option) => option.is_sold_out) ||
    Boolean(sku?.is_sold_out) ||
    (stock !== null && stock <= 0)

  const isSimpleProduct = variant === null && options.length === 0

  return {
    sku,
    price: computeEffectivePrice(product, variant, [...options], sku),
    stock,
    stockSource,
    soldOut,
    skuCode: sku?.sku ?? (isSimpleProduct ? product.sku ?? null : null),
    image: sku?.image_url ?? null,
  }
}
