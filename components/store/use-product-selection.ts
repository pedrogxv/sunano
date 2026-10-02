"use client"

import { useMemo, useState } from "react"

import type { CartItem, CartVariantOption } from "@/components/providers/cart-context"
import type {
  StoreProductDetailResult,
  StoreProductVariant,
  StoreProductVariantGroup,
  StoreProductVariantGroupOption,
} from "@/lib/server/repositories/store-repository"
import { effectivePreorderStatus, type PreorderStatus } from "@/lib/store-preorder"
import { isSinglePriceProduct } from "@/lib/store-pricing"
import { resolveSelection, type ResolvedSelection } from "@/lib/store-sku"

type OptionByGroup = Record<string, string | null>

function optionsFor(groups: readonly StoreProductVariantGroup[], byGroup: OptionByGroup): StoreProductVariantGroupOption[] {
  // Os grupos já chegam em `position`: a ordem decide qual override de preço vence.
  return groups
    .map((group) => group.options.find((option) => option.id === byGroup[group.id]) ?? null)
    .filter((option): option is StoreProductVariantGroupOption => option !== null)
}

/**
 * A seleção com que a página abre: a primeira combinação que dá para comprar,
 * escolhendo cor e depois cada grupo na ordem. Sem nenhuma comprável, abre na
 * primeira de todas (a página mostra o produto e oferece o "avise-me").
 */
function pickDefaults({
  product,
  variants,
  variantGroups,
  skus,
}: Pick<StoreProductDetailResult, "product" | "variants" | "variantGroups" | "skus">): {
  variantId: string | null
  options: OptionByGroup
} {
  const candidates: (StoreProductVariant | null)[] = variants.length > 0 ? variants : [null]

  for (const variant of candidates) {
    const byGroup: OptionByGroup = {}
    for (const group of variantGroups) {
      const choice = group.options.find(
        (option) => !resolveSelection(product, variant, optionsFor(variantGroups, { ...byGroup, [group.id]: option.id }), skus).soldOut
      )
      byGroup[group.id] = choice?.id ?? group.options[0]?.id ?? null
    }
    if (!resolveSelection(product, variant, optionsFor(variantGroups, byGroup), skus).soldOut) {
      return { variantId: variant?.id ?? null, options: byGroup }
    }
  }

  return {
    variantId: variants[0]?.id ?? null,
    options: Object.fromEntries(variantGroups.map((group) => [group.id, group.options[0]?.id ?? null])),
  }
}

export type ProductSelection = {
  activeVariant: StoreProductVariant | null
  selectedOptions: StoreProductVariantGroupOption[]
  selectedOptionByGroup: OptionByGroup
  selection: ResolvedSelection
  /** Status do lote já efetivo (lote cheio vira "Esgotado"); `null` fora da pré-venda. */
  preorderStatus: PreorderStatus | null
  singlePrice: boolean
  /** Algum grupo sem opção escolhida (grupo vazio no cadastro): nada a comprar. */
  hasUnselectableGroup: boolean
  /** Pode ir para o carrinho/checkout agora. */
  canBuy: boolean
  selectVariant: (variantId: string) => void
  selectOption: (groupId: string, optionId: string) => void
  /** Como ficaria escolhendo ESTA cor, com as opções atuais: o chip mostra "esgotado" sem precisar do clique. */
  variantChoice: (variant: StoreProductVariant) => ResolvedSelection
  /** Como ficaria escolhendo ESTA opção, com o resto da seleção atual. */
  optionChoice: (group: StoreProductVariantGroup, option: StoreProductVariantGroupOption) => ResolvedSelection
  /** "Rosa · Max · Omron": o que está escolhido, para o título e o carrinho. */
  versionLabel: string | null
  /** A linha de carrinho desta seleção (sem a quantidade). */
  toCartItem: () => Omit<CartItem, "quantity"> | null
}

/**
 * Seleção de cor + opções de um produto, resolvida por `resolveSelection`
 * (lib/store-sku.ts): preço, estoque, SKU e foto da combinação. A página do
 * produto e o "Escolher opções" do card usam este hook, então trocar de Mini
 * para Max muda as mesmas coisas nos dois lugares, sem recarregar.
 *
 * `detail` pode chegar depois (o popup busca ao abrir): enquanto a pessoa não
 * escolhe nada, vale a seleção padrão calculada do que chegou.
 */
export function useProductSelection(detail: StoreProductDetailResult | null): ProductSelection | null {
  const [chosenVariantId, setChosenVariantId] = useState<string | null>(null)
  const [chosenOptions, setChosenOptions] = useState<OptionByGroup>({})

  // Pelas partes, não pelo objeto: a página monta `detail` a cada render (rest
  // das props), e as partes são as mesmas referências vindas do servidor.
  const product = detail?.product
  const variants = detail?.variants
  const variantGroups = detail?.variantGroups
  const skus = detail?.skus
  const defaults = useMemo(
    () => (product && variants && variantGroups && skus ? pickDefaults({ product, variants, variantGroups, skus }) : null),
    [product, variants, variantGroups, skus]
  )

  if (!product || !variants || !variantGroups || !skus || !defaults) return null

  const variantId = chosenVariantId ?? defaults.variantId
  const activeVariant = variants.find((variant) => variant.id === variantId) ?? null
  const selectedOptionByGroup: OptionByGroup = { ...defaults.options, ...chosenOptions }
  const selectedOptions = optionsFor(variantGroups, selectedOptionByGroup)
  const selection = resolveSelection(product, activeVariant, selectedOptions, skus)
  const preorderStatus = product.preorder ? effectivePreorderStatus(product.preorder, product.is_sold_out) : null
  const hasUnselectableGroup = variantGroups.some((group) => !selectedOptionByGroup[group.id])
  const singlePrice = isSinglePriceProduct(product)

  const canBuy =
    !selection.soldOut &&
    !hasUnselectableGroup &&
    (variants.length === 0 || activeVariant !== null) &&
    (preorderStatus === null || preorderStatus === "open")

  const versionLabel =
    [activeVariant?.label, ...selectedOptions.map((option) => option.label)].filter(Boolean).join(" · ") || null

  return {
    activeVariant,
    selectedOptions,
    selectedOptionByGroup,
    selection,
    preorderStatus,
    singlePrice,
    hasUnselectableGroup,
    canBuy,
    selectVariant: (id) => setChosenVariantId(id),
    selectOption: (groupId, optionId) => setChosenOptions((prev) => ({ ...prev, [groupId]: optionId })),
    variantChoice: (variant) => resolveSelection(product, variant, selectedOptions, skus),
    optionChoice: (group, option) =>
      resolveSelection(product, activeVariant, optionsFor(variantGroups, { ...selectedOptionByGroup, [group.id]: option.id }), skus),
    versionLabel,
    toCartItem: () => {
      if (!canBuy) return null
      const variantOptions: CartVariantOption[] = selectedOptions.map((option) => {
        const group = variantGroups.find((g) => g.options.some((o) => o.id === option.id))!
        return { groupId: group.id, groupName: group.name, optionId: option.id, label: option.label }
      })
      return {
        productId: product.id,
        variantId: activeVariant?.id ?? null,
        variantLabel: activeVariant?.label ?? null,
        variantColor: activeVariant?.color ?? null,
        variantIcon: activeVariant?.icon ?? null,
        variantOptions,
        slug: product.slug,
        name: product.name,
        priceCents: selection.price.effectiveCents,
        image: selection.image ?? activeVariant?.image_url ?? product.images?.[0] ?? null,
        stock: selection.stock,
        type: product.type,
        condition: product.condition,
        sale_type: product.sale_type,
        singlePrice,
      }
    },
  }
}
