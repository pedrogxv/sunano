import "server-only"

import { cache } from "react"

import {
  listAllPeripheralsForTierlist,
  type TierlistPeripheralRecord,
} from "@/lib/server/repositories/peripherals-repository"
import { getTierlistMeta } from "@/lib/server/repositories/tierlist-meta-repository"
import { extractPeripheralRatings } from "@/lib/peripheral-ratings"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { mapTier } from "@/lib/tier-utils"
import { getTierScore } from "@/lib/tierlist-score"
import type { Category } from "@/lib/tag-options"

/**
 * Item já no formato que `TierlistContent` (Client Component) consome. Antes
 * essa transformação vivia inline em `app/tierlist/page.tsx`; agora é
 * compartilhada com `/tierlist/[categoria]`.
 */
export type TierlistClientItem = {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: Category
  tier: ReturnType<typeof mapTier> | null
  price: number
  tags: string[]
  ratings: ReturnType<typeof extractPeripheralRatings>
  specs: Record<string, unknown>
}

function toClientItem(p: TierlistPeripheralRecord): TierlistClientItem {
  return {
    id: p.id,
    name: p.name,
    brand: p.brand,
    image_url: p.image_url,
    category: p.category as Category,
    tier: p.tier ? mapTier(p.tier) : null,
    price: p.price,
    tags: p.tags,
    ratings: extractPeripheralRatings({ details: p.details }),
    // Colunas migradas têm prioridade sobre o valor equivalente dentro de
    // `specs` (ainda presente por dual-write).
    specs: {
      ...p.specs,
      mouseShape: p.mouseShape ?? p.specs.mouseShape,
      keyboardLayout: p.keyboardLayout ?? p.specs.keyboardLayout,
      connectivity: p.connectivity ?? p.specs.connectivity,
      surface: p.surface ?? p.specs.surface,
      profile: p.profile ?? p.specs.profile,
      panelType: p.panelType ?? p.specs.panelType,
    },
  }
}

export type TierlistPageData = {
  items: TierlistClientItem[]
  tierlistMeta: Awaited<ReturnType<typeof getTierlistMeta>>
}

/**
 * Dados compartilhados por `/tierlist` e `/tierlist/[categoria]`.
 *
 * `React.cache`: em `[categoria]` a rota chama isto no `generateMetadata` e de
 * novo no componente — o `cache` dedupe as duas no mesmo request (o
 * `unstable_cache` de `listAllPeripheralsForTierlist` já cobre entre requests;
 * aqui é o `getTierlistMeta`, que é uma query solta, que passa a não repetir).
 */
export const getTierlistPageData = cache(async (): Promise<TierlistPageData> => {
  const [records, tierlistMeta] = await Promise.all([
    listAllPeripheralsForTierlist(),
    getTierlistMeta(),
  ])
  return { items: records.map(toClientItem), tierlistMeta }
})

/**
 * Periféricos de uma categoria em ordem de tier (GOAT → L) e depois nome —
 * aproxima a ordem que o grid mostra na aba padrão, sem depender do estado do
 * Client Component. Alimenta o `ItemList` JSON-LD do `TierlistSeoBlock`.
 */
export function orderedForCategory(
  items: TierlistClientItem[],
  category: Category
): TierlistClientItem[] {
  return items
    .filter((item) => item.category === category)
    .sort(
      (a, b) =>
        getTierScore(b.tier) - getTierScore(a.tier) || a.name.localeCompare(b.name)
    )
}

/** `{ name, url }` para `ItemListJsonLd`. */
export function itemListEntries(items: TierlistClientItem[]) {
  return items.map((item) => ({
    name: item.name,
    url: `/perifericos/${buildPeripheralSlug(item.name, item.id)}`,
  }))
}
