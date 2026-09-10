/**
 * Peso numérico de um tier, para ordenar itens GOAT → L. Módulo puro para ser
 * compartilhado entre o grid (Client) e o builder de página (Server).
 */

type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null

export function getTierScore(tier: TierValue): number {
  if (tier === "GOAT") return 7
  if (tier === "SS") return 6
  if (tier === "S") return 5
  if (tier === "A") return 4
  if (tier === "B") return 3
  if (tier === "C") return 2
  if (tier === "L") return 1
  return 0
}
