/**
 * Regras de taxa e preço do Mercado — módulo puro (sem I/O), seguro para
 * client e server, mesmo espírito de `lib/account-tier.ts`. Ser puro permite
 * usar a mesma função no preview do formulário e no cálculo autoritativo da
 * API, sem duplicar a regra em dois lugares.
 */

import type { AccountTier } from "@/lib/account-tier"

/** Taxa cobrada de quem não tem direito ao anúncio grátis. */
export const MARKET_FEE_RATE = 0.05

/** vip tem direito a 1 anúncio ativo simultâneo sem custo. */
export function isVipTier(tier: AccountTier): boolean {
  return tier === "vip"
}

export type ListingFee = {
  feeCents: number
  isFreeVipSlot: boolean
}

/**
 * Calcula a taxa de publicação. `occupiesFreeSlot` deve contar anúncios do
 * vendedor em `pending_review` ou `active` marcados como `is_free_vip_slot`
 * — a vaga grátis fica "ocupada" assim que criada, mesmo antes da aprovação,
 * para não deixar um VIP acumular vários rascunhos grátis em fila.
 */
export function calculateListingFee(
  priceCents: number,
  params: { tier: AccountTier; occupiesFreeSlot: boolean }
): ListingFee {
  if (isVipTier(params.tier) && !params.occupiesFreeSlot) {
    return { feeCents: 0, isFreeVipSlot: true }
  }
  return { feeCents: Math.round(priceCents * MARKET_FEE_RATE), isFreeVipSlot: false }
}

/**
 * A regra é "nunca aumentar": cada edição é validada contra o preço atual
 * (não só contra o preço original), então o valor só pode cair, edição após
 * edição.
 */
export function isPriceChangeAllowed(currentPriceCents: number, newPriceCents: number): boolean {
  return newPriceCents <= currentPriceCents
}
