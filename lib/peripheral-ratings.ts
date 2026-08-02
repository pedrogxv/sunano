/**
 * Extrai as notas (ratings) públicas de um periférico a partir do JSON `specs`
 * salvo no banco (`specs.details.ratings`). Usado tanto pela tierlist quanto
 * pela vitrine de perfil (setup/favoritos), que reaproveitam o mesmo tooltip.
 */

import type { RatingKey, Ratings } from "@/components/tierlist/TierItemTooltipContent"

const RATING_KEYS: RatingKey[] = ["overall", "performance", "build", "value", "software", "battery", "qc"]

export function extractPeripheralRatings(specs: unknown): Ratings {
  const details = (specs as { details?: { ratings?: Record<string, number> } } | null | undefined)?.details
  const raw = details?.ratings ?? {}
  const ratings: Ratings = {}
  for (const key of RATING_KEYS) {
    if (typeof raw[key] === "number") ratings[key] = raw[key]
  }
  return ratings
}
