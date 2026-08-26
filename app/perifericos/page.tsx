import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import {
  listPeripheralsPaginated,
  listPeripheralIdsWithYoutubeReview,
  getPeripheralFilterOptions,
  getTopRankedPeripherals,
} from "@/lib/server/repositories/peripherals-repository"
import { PerifericosContent } from "./perifericos-content"
import { mapTier } from "@/lib/tier-utils"
import type { Category } from "@/lib/tag-options"

export const revalidate = 60

export const metadata: Metadata = buildMetadata({
  title: "Periféricos",
  socialTitle: "Periféricos: a wiki completa",
  description: "Wiki completa de periféricos gamers: mouses, teclados, headsets e mais, com ficha técnica, tier e reviews da comunidade.",
  path: "/perifericos",
  eyebrow: "Wiki",
  subtitle: "Ficha técnica, tier e reviews",
})

const DEFAULT_CATEGORY: Category = "mouse"
const PAGE_SIZE = 24

interface PerifericosPageProps {
  searchParams: Promise<{ category?: string }>
}

export default async function PerifericosPage({ searchParams }: PerifericosPageProps) {
  const { category: categoryParam } = await searchParams
  const category = (categoryParam as Category) || DEFAULT_CATEGORY

  const [{ items: peripheralsListRaw, total }, categoryFilterOptions, allCategoryOptions, topRanked, youtubeReviewIds] = await Promise.all([
    listPeripheralsPaginated({ category, page: 1, pageSize: PAGE_SIZE }),
    getPeripheralFilterOptions(category),
    // Contagem por categoria pro hero cards precisa ser sobre TODAS as
    // categorias, nunca filtrada pela categoria selecionada — senão as
    // outras categorias aparecem zeradas.
    getPeripheralFilterOptions(),
    getTopRankedPeripherals(category, 3),
    listPeripheralIdsWithYoutubeReview(),
  ])
  const filterOptions = { ...categoryFilterOptions, categoryCounts: allCategoryOptions.categoryCounts }

  const items = peripheralsListRaw.map((p) => {
    const rawSpecs = (p.specs || {}) as Record<string, unknown>
    const rawDetails = (rawSpecs.details || {}) as Record<string, unknown>
    const ranking = rawDetails.ranking ? Number(rawDetails.ranking) : undefined
    const score = rawDetails.score != null ? Number(rawDetails.score) : undefined

    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      image_url: p.image_url,
      category: p.category as "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp",
      tier: p.tier ? mapTier(p.tier) : null,
      price: p.price,
      ranking,
      score,
      hasYoutubeReview: youtubeReviewIds.has(p.id),
      tags: (p.tags || []) as ("competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80")[],
      specs: {
        ...(rawSpecs as {
          size?: "small" | "medium" | "large"
          driver?: string
          adminValueBand?: string
          adminRecommendedBand?: string
        }),
        mouseShape: (p.mouseShape ?? rawSpecs.mouseShape) as "symmetrical" | "ergonomic" | undefined,
        keyboardLayout: (p.keyboardLayout ?? rawSpecs.keyboardLayout) as string | undefined,
        connectivity: (p.connectivity ?? rawSpecs.connectivity) as "wired" | "wireless" | undefined,
        surface: (p.surface ?? rawSpecs.surface) as "cloth" | "hybrid" | "glass" | undefined,
        profile: (p.profile ?? rawSpecs.profile) as string | undefined,
        weightG: p.weightG ?? undefined,
      },
    }
  })

  return (
    <PerifericosContent
      initialData={items}
      initialTotal={total}
      initialCategory={category}
      initialFilterOptions={filterOptions}
      initialTopRanked={topRanked}
      pageSize={PAGE_SIZE}
      showAdminActions={false}
    />
  )
}
