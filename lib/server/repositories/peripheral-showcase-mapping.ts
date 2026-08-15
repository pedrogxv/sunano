import "server-only"

import { extractPeripheralRatings } from "@/lib/peripheral-ratings"
import type { ShowcasePeripheral } from "@/lib/profile-showcase"

/**
 * Mapeamento periférico → `ShowcasePeripheral`, compartilhado por
 * `profile-showcase-repository.ts` (setup/favoritos) e
 * `peripheral-reviews-repository.ts` (Meus Reviews) — mesmas colunas, mesma
 * extração de ratings a partir de `specs.details.ratings`.
 */

// `specs` e `tags` só existem aqui para alimentar o hover/tooltip (ratings +
// chips) reaproveitado da tierlist — a resposta pública (`ShowcasePeripheral`)
// expõe só `ratings` já extraído, nunca o `specs` bruto.
export const PERIPHERAL_SHOWCASE_COLUMNS = "id, name, brand_id, brands(name), category, image_url, tier, specs, tags"

export type PeripheralShowcaseRow = {
  id: string
  name: string
  brand_id: string
  brands: { name: string } | { name: string }[] | null
  category: string
  image_url: string | null
  tier: string | null
  specs: Record<string, unknown> | null
  tags: string[] | null
}

export function toShowcasePeripheral(row: PeripheralShowcaseRow): ShowcasePeripheral {
  const brandRow = Array.isArray(row.brands) ? row.brands[0] : row.brands
  return {
    id: row.id,
    name: row.name,
    brand: brandRow?.name ?? "",
    category: row.category,
    image_url: row.image_url,
    tier: row.tier,
    tags: row.tags ?? [],
    ratings: extractPeripheralRatings(row.specs),
  }
}
