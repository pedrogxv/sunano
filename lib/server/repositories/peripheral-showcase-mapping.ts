import "server-only"

import { extractPeripheralRatings } from "@/lib/peripheral-ratings"
import type { PeripheralReviewSummary, ShowcasePeripheral } from "@/lib/profile-showcase"

/**
 * Mapeamento periférico → `ShowcasePeripheral`, compartilhado por
 * `profile-showcase-repository.ts` (setup/favoritos) e
 * `peripheral-reviews-repository.ts` (Meus Reviews) — mesmas colunas, mesma
 * extração de ratings a partir de `specs.details.ratings`.
 */

// `specs` e `tags` só existem aqui para alimentar o hover/tooltip (ratings +
// chips) reaproveitado da tierlist — a resposta pública (`ShowcasePeripheral`)
// expõe só `ratings` já extraído, nunca o `specs` bruto.
export const PERIPHERAL_SHOWCASE_COLUMNS =
  "id, name, brand_id, brands(name), category, image_url, tier, price, specs, tags"

export type PeripheralShowcaseRow = {
  id: string
  name: string
  brand_id: string
  brands: { name: string } | { name: string }[] | null
  category: string
  image_url: string | null
  tier: string | null
  price: number | null
  specs: Record<string, unknown> | null
  tags: string[] | null
}

/**
 * Zero reviews: para o id que o lote não trouxe (ninguém avaliou ainda) e para
 * a tela que não exibe contagem nenhuma (a tierlist pessoal), onde buscar o
 * lote seria consulta jogada fora.
 */
export const NO_PERIPHERAL_REVIEWS: PeripheralReviewSummary = { count: 0, average: null }

/**
 * `reviews` é parâmetro OBRIGATÓRIO, não opcional com default: é o que força
 * cada listagem nova a buscar `getPeripheralReviewSummaries(ids)` em lote. Como
 * campo opcional, a tela compilaria e o card sairia sem a contagem da
 * comunidade — o mesmo esquecimento silencioso das molduras.
 */
export function toShowcasePeripheral(
  row: PeripheralShowcaseRow,
  reviews: PeripheralReviewSummary
): ShowcasePeripheral {
  const brandRow = Array.isArray(row.brands) ? row.brands[0] : row.brands
  return {
    id: row.id,
    name: row.name,
    brand: brandRow?.name ?? "",
    category: row.category,
    image_url: row.image_url,
    tier: row.tier,
    price: row.price ?? 0,
    tags: row.tags ?? [],
    ratings: extractPeripheralRatings(row.specs),
    reviews,
  }
}
