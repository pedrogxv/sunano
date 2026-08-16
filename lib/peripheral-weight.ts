/** Extrai gramas de um texto livre tipo "61g", "800 g", "61" — usado no form
 * admin (peso ainda é digitado como texto) e como fallback de leitura para
 * registros que só têm o valor legado em `specs.details.weight`. */
export function parseWeightToGrams(raw: string | null | undefined): number | undefined {
  if (!raw) return undefined
  const match = String(raw).match(/(\d+(?:\.\d+)?)/)
  return match ? Math.round(parseFloat(match[1])) : undefined
}
