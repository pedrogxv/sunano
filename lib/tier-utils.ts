export const NEW_TIERS = ["GOAT", "SS", "S", "A", "B", "C", "L"] as const
export type Tier = (typeof NEW_TIERS)[number]

export function mapTier(raw: unknown): Tier {
  const value = (raw ?? "").toString()

  if ((NEW_TIERS as readonly string[]).includes(value)) return value as Tier

  switch (value) {
    case "T0":
      return "GOAT"
    case "T0.5":
      return "SS"
    case "T1":
      return "S"
    case "T2":
      return "A"
    default:
      // fallback to a safe middle tier
      return "C"
  }
}

/**
 * Rótulo do tier na tela. Fontes não usam a letra "L" pro último tier: uma
 * fonte ruim não é "baixa performance", é risco de queimar o resto do PC — na
 * comunidade isso se chama BOMBA. O valor gravado no banco continua sendo "L",
 * só a etiqueta muda; assim nenhuma consulta, ordenação ou CHECK constraint
 * precisa saber que essa categoria existe.
 */
export function tierLabel(tier: Tier, category?: string | null): string {
  if (category === "psu" && tier === "L") return "BOMBA"
  return tier
}

/**
 * Tiers oferecidos por categoria. Fontes ficam sem o SS: a escala pedida vai de
 * GOAT direto pra S, e um tier que ninguém preenche só polui o board.
 */
export function tiersForCategory(category?: string | null): Tier[] {
  if (category === "psu") return NEW_TIERS.filter((tier) => tier !== "SS")
  return [...NEW_TIERS]
}
