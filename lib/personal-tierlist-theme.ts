/**
 * Tema da tierlist pessoal (VIP).
 *
 * Os tiers são definidos pelo próprio usuário (nome + cor livre, ver
 * `lib/personal-tierlist.ts`), então não dá mais pra usar classes Tailwind
 * pré-geradas por tier como a tierlist oficial (`lib/tierlist-theme.ts`)
 * faz — os helpers abaixo calculam gradiente, borda/glow do card e cor do
 * texto a partir do hex arbitrário escolhido pelo usuário.
 *
 * Módulo puro (sem "server-only"): Client Components importam daqui.
 */

import type { TierlistTierDef } from "@/lib/personal-tierlist"

/**
 * Preset inicial de tiers — mesmas cores da tierlist oficial
 * (`TIER_BASE_COLORS` em `lib/tierlist-theme.ts`, S/A/B/C e o cinza do L pro
 * D) pra tierlist pessoal e oficial se lerem como o mesmo produto no
 * primeiro uso. É só o ponto de partida: o usuário pode renomear, recolorir,
 * adicionar (até 6) ou remover (até 2) tiers depois.
 */
export const DEFAULT_TIER_PRESET: Omit<TierlistTierDef, "id">[] = [
  { label: "S", color: "#F97316", position: 0 },
  { label: "A", color: "#F59E0B", position: 1 },
  { label: "B", color: "#22C55E", position: 2 },
  { label: "C", color: "#3B82F6", position: 3 },
  { label: "D", color: "#6B7280", position: 4 },
]

/** Converte um hex de 6 dígitos + opacidade (0-100) num hex de 8 dígitos. */
export function withAlpha(hex: string, alphaPercent: number): string {
  const clamped = Math.max(0, Math.min(100, alphaPercent))
  const alphaHex = Math.round((clamped / 100) * 255)
    .toString(16)
    .padStart(2, "0")
  return `${hex}${alphaHex}`
}

/** Texto claro ou escuro sobre a cor do tier, pela luminância relativa. */
export function tierTextColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? "#141925" : "#FFFFFF"
}

/** Gradiente vertical da coluna do tier — mesma leitura visual do board oficial, calculada a partir da cor escolhida. */
export function tierGradientStyle(hex: string): React.CSSProperties {
  return { backgroundImage: `linear-gradient(to bottom, ${withAlpha(hex, 85)}, ${hex})` }
}

/**
 * CSS custom properties com a cor do tier e suas variações de opacidade —
 * a mesma linguagem visual de `CARD_TIER_STYLES` (borda, glow, glow forte no
 * hover), só que computada a partir do hex arbitrário do tier em vez de
 * classes Tailwind pré-geradas. Aplicar no elemento via `style`, e usar
 * classes como `border-[color:var(--tier-border)]` /
 * `hover:border-[color:var(--tier-color)]` para manter o hover em CSS puro
 * (ver `PersonalTierlistCard`).
 */
export function tierCardVars(hex: string): React.CSSProperties {
  return {
    "--tier-color": hex,
    "--tier-border": withAlpha(hex, 25),
    "--tier-glow": withAlpha(hex, 15),
    "--tier-glow-strong": withAlpha(hex, 85),
    "--tier-glow-mid": withAlpha(hex, 60),
    "--tier-glow-soft": withAlpha(hex, 35),
  } as React.CSSProperties
}

/** Agrupa itens por tier (id), na ordem de `position` dos tiers, preservando a ordem de `position` dos itens. */
export function groupByTierId<T extends { tierId: string }>(
  tiers: TierlistTierDef[],
  items: T[]
): Map<string, T[]> {
  const byTier = new Map<string, T[]>()
  for (const tier of tiers) byTier.set(tier.id, [])
  for (const item of items) byTier.get(item.tierId)?.push(item)
  return byTier
}

/** Tiers ordenados por `position`, prontos pra iterar na UI. */
export function sortTiers(tiers: TierlistTierDef[]): TierlistTierDef[] {
  return [...tiers].sort((a, b) => a.position - b.position)
}
