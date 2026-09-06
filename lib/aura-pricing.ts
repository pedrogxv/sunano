/**
 * Preço em Aura conforme o tier — módulo puro (sem I/O, sem `server-only`),
 * importável tanto por Client Components quanto pelos repositórios.
 *
 * ATENÇÃO: isto é **prévia de exibição**, não a regra de cobrança. O valor
 * realmente debitado é decidido dentro das RPCs `security definer`
 * (`redeem_aura_item`, `change_display_name_with_aura`,
 * `purchase_streak_shield`, `claim_event_medal`) — o client nunca decide
 * preço. A conta aqui espelha exatamente o `round(custo * 0.9)::integer` do
 * SQL: mesma regra de arredondamento (meio para cima, como o `round` do
 * Postgres para numeric), para a tela nunca prometer um número diferente do
 * que a carteira vai perder.
 *
 * O percentual vem de `auraDiscountBps` em `lib/account-tier.ts` — mudar o
 * desconto é mudar lá (e nas RPCs), nunca espalhar 0.9 pelos componentes.
 */

import { TIER_CAPABILITIES, type AccountTier } from "@/lib/account-tier"

export type AuraPrice = {
  /** Preço de tabela do catálogo, sem desconto. */
  listPrice: number
  /** O que vai sair da carteira. Igual a `listPrice` quando não há desconto. */
  finalPrice: number
  /** Quanto o desconto economiza (0 quando não há). */
  savings: number
  /** Desconto aplicado, em pontos percentuais inteiros (10 = "−10%"). */
  discountPercent: number
  /** Conveniência para a UI decidir entre mostrar um preço ou dois. */
  discounted: boolean
}

/** Percentual de desconto do tier em pontos inteiros — 1000 bps = 10. */
export function auraDiscountPercent(tier: AccountTier): number {
  return TIER_CAPABILITIES[tier].auraDiscountBps / 100
}

/** O percentual que o VIP ganha — usado em textos de vitrine/upsell. */
export const VIP_AURA_DISCOUNT_PERCENT = auraDiscountPercent("vip")

/**
 * Aplica o desconto do tier a um custo de catálogo.
 *
 * `Math.round` do JS arredonda .5 para cima igual ao `round` do Postgres em
 * valores positivos, que é o único caso possível aqui (custos são sempre > 0).
 */
export function auraPriceFor(listPrice: number, tier: AccountTier): AuraPrice {
  const percent = auraDiscountPercent(tier)
  const finalPrice = percent > 0 ? Math.round(listPrice * (1 - percent / 100)) : listPrice

  return {
    listPrice,
    finalPrice,
    savings: listPrice - finalPrice,
    discountPercent: percent,
    discounted: finalPrice < listPrice,
  }
}

/** Atalho para o caso mais comum na UI: "este usuário é VIP agora?". */
export function auraPriceForVip(listPrice: number, isVip: boolean): AuraPrice {
  return auraPriceFor(listPrice, isVip ? "vip" : "common")
}
