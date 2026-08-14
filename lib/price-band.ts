// Faixas de preço usadas pela aba "Custo Benefício" da tierlist. Diferente do sistema de
// tier (GOAT..L), a faixa nunca é atribuída manualmente: é sempre derivada do `price` do
// periférico em runtime. GOLPE é a exceção — quando marcado, tem prioridade sobre a faixa
// de preço calculada. Fonte única usada pela tierlist pública, pelo board admin e pela
// página de detalhe do periférico.

export const PRICE_BANDS = [
  { key: "1000", label: "R$1000+", min: 1000 },
  { key: "750", label: "R$750+", min: 750 },
  { key: "500", label: "R$500+", min: 500 },
  { key: "300", label: "R$300+", min: 300 },
  { key: "200", label: "R$200+", min: 200 },
  { key: "100", label: "R$100+", min: 100 },
] as const

export type PriceBandKey = (typeof PRICE_BANDS)[number]["key"]

export const GOLPE_KEY = "golpe" as const

export type PriceGroupKey = PriceBandKey | typeof GOLPE_KEY

export const PRICE_BAND_LABEL: Record<PriceGroupKey, string> = {
  ...Object.fromEntries(PRICE_BANDS.map((band) => [band.key, band.label])),
  [GOLPE_KEY]: "GOLPE",
} as Record<PriceGroupKey, string>

// Faixa = maior piso que o preço atinge (ex: R$850 cai em "R$750+", não em "R$500+").
// Preços abaixo de R$100 não têm faixa — não existe faixa fictícia pra cobrir esse caso.
export function getPriceBandKey(price: number): PriceBandKey | null {
  for (const band of PRICE_BANDS) {
    if (price >= band.min) return band.key
  }
  return null
}

export function getPriceGroupKey(price: number, isGolpe: boolean | undefined): PriceGroupKey | null {
  if (isGolpe) return GOLPE_KEY
  return getPriceBandKey(price)
}
