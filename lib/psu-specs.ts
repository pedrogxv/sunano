/**
 * Fontes (categoria `psu`) — selos, leituras de bancada e a ponte entre os
 * campos planos do formulário de admin e o bloco aninhado gravado em
 * `specs.details.psu`.
 *
 * Fonte é a única categoria em que a ficha técnica é um *relatório de teste*:
 * os mesmos cinco números (ripple de cada linha, eficiência e temperatura) se
 * repetem em três cenários de carga. Guardar isso plano dentro de `details`
 * daria 20+ chaves soltas disputando espaço com as specs de mouse/teclado, por
 * isso aqui vai aninhado (`load100`, `load110`, `overload`) e o mapa abaixo é o
 * único lugar que sabe traduzir de/para os campos do react-hook-form — que
 * precisam ser planos.
 */

export const PSU_CYBENETICS_LEVELS = ["Bronze", "Silver", "Gold", "Platinum", "Titanium", "Diamond"] as const
export const PSU_80_PLUS_LEVELS = ["White", "Bronze", "Silver", "Gold", "Platinum", "Titanium", "Ruby"] as const

/**
 * Cor de cada nível de selo, reproduzida em CSS. O 80 Plus e o Cybenetics são
 * reconhecidos pela cor do metal antes do nome, então a etiqueta na página
 * pública imita essa cor em vez de mostrar todos os selos iguais. Se um dia
 * entrarem as artes oficiais em `/public`, o único lugar a trocar é aqui.
 */
export const PSU_CERT_LEVEL_STYLE: Record<string, string> = {
  White: "border-zinc-200/50 bg-zinc-200/15 text-zinc-100",
  Bronze: "border-amber-700/60 bg-amber-700/20 text-amber-300",
  Silver: "border-slate-300/50 bg-slate-300/15 text-slate-200",
  Gold: "border-yellow-400/60 bg-yellow-400/15 text-yellow-300",
  Platinum: "border-cyan-200/50 bg-cyan-200/15 text-cyan-100",
  Titanium: "border-indigo-300/50 bg-indigo-300/15 text-indigo-200",
  Diamond: "border-sky-300/60 bg-sky-300/15 text-sky-200",
  Ruby: "border-rose-400/60 bg-rose-400/15 text-rose-300",
}

export const PSU_CERT_FALLBACK_STYLE = "border-border bg-muted/40 text-muted-foreground"

/** Leituras de uma mesma bateria de testes, repetidas por cenário de carga. */
export type PsuLoadReadings = {
  ripple12v?: string
  ripple5v?: string
  ripple33v?: string
  efficiency?: string
  maxTemp?: string
}

export type PsuOverloadTest = {
  protectionWorked?: string
  maxLoad?: string
  rippleStable?: string
  ripple12v?: string
  efficiency?: string
  maxTemp?: string
}

export type PsuSpecs = {
  warranty?: string
  wattage?: string
  cybenetics?: string
  cybeneticsLevel?: string
  plus80?: string
  plus80Level?: string
  teclab?: string
  load100?: PsuLoadReadings
  load110?: PsuLoadReadings
  overload?: PsuOverloadTest
  fanModel?: string
  circuitType?: string
  mainCapacitor?: string
  secondaryCapacitor?: string
}

/**
 * Campos planos que o formulário registra. Ficam todos como `string` porque o
 * relatório de bancada é copiado do teste com a unidade junto ("12.4mV", "89%",
 * "41°C") — transformar em número perderia a unidade e não daria nenhum ganho:
 * nada aqui é ordenado, filtrado ou somado.
 */
export type PsuFormValues = {
  psuWarranty: string
  psuWattage: string
  psuCybenetics: string
  psuCybeneticsLevel: string
  psu80Plus: string
  psu80PlusLevel: string
  psuTeclab: string
  psuLoad100Ripple12v: string
  psuLoad100Ripple5v: string
  psuLoad100Ripple33v: string
  psuLoad100Efficiency: string
  psuLoad100MaxTemp: string
  psuLoad110Ripple12v: string
  psuLoad110Ripple5v: string
  psuLoad110Ripple33v: string
  psuLoad110Efficiency: string
  psuLoad110MaxTemp: string
  psuOverloadProtection: string
  psuOverloadMaxLoad: string
  psuOverloadRippleStable: string
  psuOverloadRipple12v: string
  psuOverloadEfficiency: string
  psuOverloadMaxTemp: string
  psuFanModel: string
  psuCircuitType: string
  psuMainCapacitor: string
  psuSecondaryCapacitor: string
}

export type PsuFormField = keyof PsuFormValues

/** Campo do formulário ↔ caminho dentro de `specs.details.psu`. */
const PSU_FIELD_MAP: readonly (readonly [PsuFormField, readonly string[]])[] = [
  ["psuWarranty", ["warranty"]],
  ["psuWattage", ["wattage"]],
  ["psuCybenetics", ["cybenetics"]],
  ["psuCybeneticsLevel", ["cybeneticsLevel"]],
  ["psu80Plus", ["plus80"]],
  ["psu80PlusLevel", ["plus80Level"]],
  ["psuTeclab", ["teclab"]],
  ["psuLoad100Ripple12v", ["load100", "ripple12v"]],
  ["psuLoad100Ripple5v", ["load100", "ripple5v"]],
  ["psuLoad100Ripple33v", ["load100", "ripple33v"]],
  ["psuLoad100Efficiency", ["load100", "efficiency"]],
  ["psuLoad100MaxTemp", ["load100", "maxTemp"]],
  ["psuLoad110Ripple12v", ["load110", "ripple12v"]],
  ["psuLoad110Ripple5v", ["load110", "ripple5v"]],
  ["psuLoad110Ripple33v", ["load110", "ripple33v"]],
  ["psuLoad110Efficiency", ["load110", "efficiency"]],
  ["psuLoad110MaxTemp", ["load110", "maxTemp"]],
  ["psuOverloadProtection", ["overload", "protectionWorked"]],
  ["psuOverloadMaxLoad", ["overload", "maxLoad"]],
  ["psuOverloadRippleStable", ["overload", "rippleStable"]],
  ["psuOverloadRipple12v", ["overload", "ripple12v"]],
  ["psuOverloadEfficiency", ["overload", "efficiency"]],
  ["psuOverloadMaxTemp", ["overload", "maxTemp"]],
  ["psuFanModel", ["fanModel"]],
  ["psuCircuitType", ["circuitType"]],
  ["psuMainCapacitor", ["mainCapacitor"]],
  ["psuSecondaryCapacitor", ["secondaryCapacitor"]],
] as const

type PsuRecord = Record<string, unknown>

/**
 * Monta `specs.details.psu` a partir dos campos do formulário. Campo vazio não
 * é gravado, e um sub-bloco inteiro vazio (ex.: nunca preencheram a sobrecarga)
 * some junto — assim a página pública consegue esconder o card só olhando se o
 * bloco existe. O nível do selo só é gravado quando o selo está em "Sim", pra
 * não deixar um "Gold" preso num item que depois foi marcado como sem selo.
 */
export function buildPsuSpecs(values: Partial<PsuFormValues>): PsuSpecs | undefined {
  const root: PsuRecord = {}

  for (const [field, path] of PSU_FIELD_MAP) {
    const value = values[field]?.trim()
    if (!value) continue
    if (field === "psuCybeneticsLevel" && values.psuCybenetics !== "yes") continue
    if (field === "psu80PlusLevel" && values.psu80Plus !== "yes") continue

    if (path.length === 1) {
      root[path[0]] = value
      continue
    }
    const [group, key] = path
    const bucket = (root[group] as PsuRecord | undefined) ?? {}
    bucket[key] = value
    root[group] = bucket
  }

  return Object.keys(root).length > 0 ? (root as PsuSpecs) : undefined
}

/** Caminho inverso: preenche os campos do formulário ao abrir um item salvo. */
export function psuFormValuesFrom(psu: unknown): PsuFormValues {
  const source = (psu ?? {}) as PsuRecord
  const values = {} as PsuFormValues

  for (const [field, path] of PSU_FIELD_MAP) {
    const raw = path.length === 1
      ? source[path[0]]
      : ((source[path[0]] as PsuRecord | undefined) ?? {})[path[1]]
    values[field] = typeof raw === "string" ? raw : ""
  }

  return values
}

/** `"yes"`/`"no"` do formulário → o que a página pública mostra. */
export function formatPsuBoolean(value: string | undefined): string | undefined {
  if (value === "yes") return "Sim"
  if (value === "no") return "Não"
  return undefined
}

/** `true` quando o bloco tem pelo menos um valor — usado pra esconder cards vazios. */
export function hasPsuReadings(readings: PsuLoadReadings | PsuOverloadTest | undefined): boolean {
  return !!readings && Object.values(readings).some((value) => typeof value === "string" && value.trim() !== "")
}
