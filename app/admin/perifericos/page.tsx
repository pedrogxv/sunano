import {
  listPeripheralsPaginated,
  getPeripheralFilterOptions,
  getTopRankedPeripherals,
} from "@/lib/server/repositories/peripherals-repository"
import { PerifericosContent } from "@/app/perifericos/perifericos-content"
import { mapTier } from "@/lib/tier-utils"
import type { Category } from "@/lib/tag-options"

export const dynamic = "force-dynamic"

const DEFAULT_CATEGORY: Category = "mouse"
const PAGE_SIZE = 24

interface AdminPerifericosPageProps {
  searchParams: Promise<{ category?: string }>
}

export default async function AdminPerifericosPage({ searchParams }: AdminPerifericosPageProps) {
  const { category: categoryParam } = await searchParams
  const category = (categoryParam as Category) || DEFAULT_CATEGORY

  const [{ items: peripheralsList, total }, categoryFilterOptions, allCategoryOptions, topRanked] = await Promise.all([
    listPeripheralsPaginated({ category, page: 1, pageSize: PAGE_SIZE }),
    getPeripheralFilterOptions(category),
    // Contagem por categoria pro hero cards precisa ser sobre TODAS as
    // categorias, nunca filtrada pela categoria selecionada.
    getPeripheralFilterOptions(),
    getTopRankedPeripherals(category, 3),
  ])
  const filterOptions = { ...categoryFilterOptions, categoryCounts: allCategoryOptions.categoryCounts }

  const items = peripheralsList.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    image_url: p.image_url,
    category: p.category as "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp" | "psu",
    tier: p.tier ? mapTier(p.tier) : null,
    price: p.price,
    tags: (p.tags || []) as ("competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80")[],
    specs: {
      ...(p.specs || {}),
      mouseShape: p.mouseShape ?? (p.specs?.mouseShape as string | undefined),
      keyboardLayout: p.keyboardLayout ?? (p.specs?.keyboardLayout as string | undefined),
      connectivity: p.connectivity ?? (p.specs?.connectivity as string | undefined),
      surface: p.surface ?? (p.specs?.surface as string | undefined),
      profile: p.profile ?? (p.specs?.profile as string | undefined),
    } as {
      mouseShape?: "symmetrical" | "ergonomic"
      keyboardLayout?: string
      connectivity?: "wired" | "wireless"
      size?: "small" | "medium" | "large"
      surface?: "cloth" | "hybrid" | "glass"
      driver?: string
      profile?: string
      adminValueBand?: string
      adminRecommendedBand?: string
    },
  }))

  return (
    <PerifericosContent
      initialData={items}
      initialTotal={total}
      initialCategory={category}
      initialFilterOptions={filterOptions}
      initialTopRanked={topRanked}
      pageSize={PAGE_SIZE}
      showAdminActions={true}
    />
  )
}
