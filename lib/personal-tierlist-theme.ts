/**
 * Tema da tierlist pessoal (VIP).
 *
 * A escala aqui é S/A/B/C/D (própria da tierlist do membro, gravada em
 * `user_tierlist_items.tier`), mas as cores são emprestadas da tierlist
 * oficial do site (`lib/tierlist-theme.ts`) para as duas se lerem como o
 * mesmo produto: gradiente na coluna do tier, barra de acento e glow no card.
 *
 * Mapeamento: S→S(laranja), A→A(âmbar), B→B(verde), C→C(azul), D→L(cinza).
 * GOAT/SS ficam de fora de propósito — são exclusivos da curadoria oficial,
 * e deixá-los aqui faria a tierlist pessoal parecer um veredito do site.
 *
 * Módulo puro (sem "server-only"): Client Components importam daqui.
 */

import { CARD_TIER_STYLES, TIER_THEMES } from "@/lib/tierlist-theme"
import type { TierlistTier } from "@/lib/personal-tierlist"

export const PERSONAL_TIERS: TierlistTier[] = ["S", "A", "B", "C", "D"]

type PersonalTierTheme = {
  /** Gradiente da coluna do tier — `bg-gradient-to-b` é aplicado por quem usa. */
  accent: string
  /** Cor do texto do rótulo dentro do gradiente. */
  textColor: string
  /** Legenda curta abaixo da letra, no espírito das legendas da tierlist oficial. */
  subtitle: string
  /** Estilos do card (barra de acento, borda, glow) — reaproveitados da tierlist oficial. */
  card: (typeof CARD_TIER_STYLES)[keyof typeof CARD_TIER_STYLES]
}

export const PERSONAL_TIER_THEMES: Record<TierlistTier, PersonalTierTheme> = {
  S: { ...TIER_THEMES.S, subtitle: "Topo", card: CARD_TIER_STYLES.S },
  A: { ...TIER_THEMES.A, subtitle: "Ótimo", card: CARD_TIER_STYLES.A },
  B: { ...TIER_THEMES.B, subtitle: "Bom", card: CARD_TIER_STYLES.B },
  C: { ...TIER_THEMES.C, subtitle: "Mediano", card: CARD_TIER_STYLES.C },
  D: { ...TIER_THEMES.L, subtitle: "Evite", card: CARD_TIER_STYLES.L },
}

/** Agrupa itens por tier na ordem canônica, preservando a ordem de `position`. */
export function groupByTier<T extends { tier: TierlistTier }>(items: T[]): Map<TierlistTier, T[]> {
  const byTier = new Map<TierlistTier, T[]>()
  for (const tier of PERSONAL_TIERS) byTier.set(tier, [])
  for (const item of items) byTier.get(item.tier)?.push(item)
  return byTier
}
