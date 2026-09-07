import { ItemListJsonLd } from "@/components/seo/JsonLd"
import {
  listPeripheralsPaginated,
  listPeripheralIdsWithYoutubeReview,
  getPeripheralFilterOptions,
  getTopRankedPeripherals,
} from "@/lib/server/repositories/peripherals-repository"
import { PerifericosContent } from "./perifericos-content"
import { buildPeripheralDisplayName, buildPeripheralSlug } from "@/lib/peripheral-slug"
import { mapTier } from "@/lib/tier-utils"
import { CATEGORY_PLURAL_LABELS, hasScoreRanking, isCategory, type Category } from "@/lib/tag-options"

/** URL canônica da listagem de uma categoria. */
export function categoryPath(category: Category) {
  return `/perifericos/categoria/${category}`
}

const PAGE_SIZE = 24

/**
 * Corpo compartilhado entre `/perifericos` (com `?category=`) e a rota
 * canônica `/perifericos/categoria/<slug>`. As duas servem exatamente a mesma
 * listagem — só o canonical/metadata difere, o que é justamente o ponto: a
 * rota antiga aponta para a nova em vez de competir com ela.
 */
export async function PerifericosCategoryView({ category }: { category: Category }) {
  const [{ items: peripheralsListRaw, total }, categoryFilterOptions, allCategoryOptions, topRanked, youtubeReviewIds] = await Promise.all([
    listPeripheralsPaginated({ category, page: 1, pageSize: PAGE_SIZE }),
    getPeripheralFilterOptions(category),
    // Contagem por categoria pro hero cards precisa ser sobre TODAS as
    // categorias, nunca filtrada pela categoria selecionada — senão as
    // outras categorias aparecem zeradas.
    getPeripheralFilterOptions(),
    // Ranking por pontuação só existe em teclado/mouse — ver SCORE_CATEGORIES.
    hasScoreRanking(category) ? getTopRankedPeripherals(category, 3) : Promise.resolve([]),
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
      category: p.category as "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp" | "psu",
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
    <>
      {/* A listagem é filtrada e paginada no cliente, então não há âncora
          rastreável para cada ficha. O `ItemList` marca a página como coleção
          e informa ao Google quais URLs ela reúne. */}
      <ItemListJsonLd
        name={isCategory(category) ? CATEGORY_PLURAL_LABELS[category] : "Periféricos"}
        items={items.map((item) => ({
          name: buildPeripheralDisplayName(item.brand, item.name),
          url: `/perifericos/${buildPeripheralSlug(item.name, item.id)}`,
        }))}
      />
      <PerifericosContent
        initialData={items}
        initialTotal={total}
        initialCategory={category}
        initialFilterOptions={filterOptions}
        initialTopRanked={topRanked}
        pageSize={PAGE_SIZE}
        showAdminActions={false}
      />
    </>
  )
}
