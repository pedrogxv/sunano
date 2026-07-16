// Faixas de preço para a categoria Switches. Em switches é difícil cravar um
// valor exato, então em vez do preço numérico o admin escolhe uma faixa. Fonte
// única usada pelo formulário do admin e pela página pública do periférico.

export const SWITCH_PRICE_TIERS = [
  { key: "cheap", label: "Barato" },
  { key: "medium", label: "Médio" },
  { key: "expensive", label: "Caro" },
  { key: "very_expensive", label: "Muito Caro" },
] as const

export type SwitchPriceTier = (typeof SWITCH_PRICE_TIERS)[number]["key"]

export const SWITCH_PRICE_TIER_LABEL: Record<string, string> = Object.fromEntries(
  SWITCH_PRICE_TIERS.map((tier) => [tier.key, tier.label])
)
