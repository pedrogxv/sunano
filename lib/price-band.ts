// Faixas de preço usadas pela aba "Custo Benefício" da tierlist. A posição de cada item é
// manual (igual ao tier GOAT..L) e fica em `specs.adminPriceGroup` — mover um item de faixa
// no board admin NUNCA altera `price`, só essa posição visual. Itens que nunca foram movidos
// não têm `adminPriceGroup` gravado: nesse caso a faixa cai de volta pro cálculo a partir do
// `price` real (fallback), só pra dar uma posição inicial razoável. GOLPE é a exceção — quando
// marcado, tem prioridade sobre a faixa de preço. Fonte única usada pela tierlist pública, pelo
// board admin e pela página de detalhe do periférico.

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

export const PRICE_GROUP_SPEC_KEY = "adminPriceGroup"

const PRICE_BAND_KEYS: string[] = PRICE_BANDS.map((band) => band.key)

function isPriceBandKey(value: unknown): value is PriceBandKey {
  return typeof value === "string" && PRICE_BAND_KEYS.includes(value)
}

// Faixa = maior piso que o preço atinge (ex: R$850 cai em "R$750+", não em "R$500+").
// Preços abaixo de R$100 não têm faixa — não existe faixa fictícia pra cobrir esse caso.
export function getPriceBandKey(price: number): PriceBandKey | null {
  for (const band of PRICE_BANDS) {
    if (price >= band.min) return band.key
  }
  return null
}

// Cálculo puro a partir do preço — usado só como fallback pra itens sem `adminPriceGroup`
// gravado ainda. Não usar diretamente pra decidir em que faixa um item aparece.
export function getPriceGroupKey(price: number, isGolpe: boolean | undefined): PriceGroupKey | null {
  if (isGolpe) return GOLPE_KEY
  return getPriceBandKey(price)
}

// Faixa efetiva de um item: `adminPriceGroup` manda quando definido; GOLPE (specs.golpe)
// sempre tem prioridade sobre ele; sem nenhum dos dois, cai pro cálculo a partir do `price`.
export function resolvePriceGroupKey(
  price: number,
  isGolpe: boolean | undefined,
  manualGroup: unknown,
): PriceGroupKey | null {
  if (isGolpe) return GOLPE_KEY
  if (isPriceBandKey(manualGroup)) return manualGroup
  return getPriceBandKey(price)
}
