/**
 * `specs` (jsonb) enxuto para a Tierlist.
 *
 * A tela de tierlist é uma das de maior tráfego do site e renderiza 575+
 * periféricos de uma vez num Client Component. Antes, o `map` da página
 * espalhava o `specs` jsonb INTEIRO de cada linha (média 521 B, máx 3,6 KB,
 * ~293 KB no total) dentro de `initialData` — todo esse blob ia serializado no
 * payload RSC/HTML, mesmo o grid só lendo ~25 chaves.
 *
 * Aqui ficam as únicas chaves que `TierlistGrid` / `PeripheralCard` /
 * `TierItemTooltipContent` consomem. `slimTierlistSpecs` recorta o blob no
 * servidor; o resto (`details.score`, histórico admin, campos de outras telas)
 * nunca chega ao cliente.
 */

/** Modos de avaliação (abas) da tierlist — cada um tem um par tier/ordem próprio. */
const RATING_MODE_SUFFIXES = [
  "performance",
  "value",
  "recommended",
  "oled",
  "soundTyping",
  "mechanical",
  "magnetic",
  "pcb",
  "ips_va",
  "competitive",
] as const

/** Chaves escalares (não derivadas de modo) que o grid/card leem de `specs`. */
const SCALAR_SPEC_KEYS = [
  "mouseShape",
  "keyboardLayout",
  "connectivity",
  "size",
  "surface",
  "driver",
  "profile",
  "panelType",
  "golpe",
  "golpeMotivo",
  "tierlistCategories",
  "adminPriceGroup",
  "adminPriceBandOrder",
  "adminTierOrder", // fallback legado do modo "overall"
] as const

export type TierlistSpecs = Record<string, unknown>

/**
 * Recorta o `specs` jsonb para só as chaves que a Tierlist usa. As colunas
 * migradas (`p.mouseShape`, `p.connectivity`, …) continuam tendo prioridade e
 * são aplicadas por quem chama, por cima do retorno daqui.
 */
export function slimTierlistSpecs(raw: unknown): TierlistSpecs {
  const specs = (raw ?? {}) as Record<string, unknown>
  const out: TierlistSpecs = {}

  for (const key of SCALAR_SPEC_KEYS) {
    if (specs[key] !== undefined) out[key] = specs[key]
  }

  for (const suffix of RATING_MODE_SUFFIXES) {
    const tierKey = `adminTier_${suffix}`
    const orderKey = `adminTierOrder_${suffix}`
    if (specs[tierKey] !== undefined) out[tierKey] = specs[tierKey]
    if (specs[orderKey] !== undefined) out[orderKey] = specs[orderKey]
  }

  return out
}
