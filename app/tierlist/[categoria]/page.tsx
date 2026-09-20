import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import { buildMetadata } from "@/lib/seo"
import {
  getTierlistPageData,
  orderedForCategory,
  itemListEntries,
} from "@/lib/server/tierlist-page-data"
import {
  TIERLIST_CATEGORY_BY_SLUG,
  TIERLIST_CATEGORY_SLUGS,
  TIERLIST_CATEGORY_LABELS,
  TIERLIST_CATEGORY_BLURBS,
  tierlistCategoryPath,
} from "@/lib/tierlist-categories"
import { TierlistPageHeader } from "@/components/tierlist/TierlistPageHeader"
import { TierlistContent } from "@/components/tierlist/TierlistContent"
import { TierlistSeoBlock } from "@/components/tierlist/TierlistSeoBlock"

export const revalidate = 120

// Só os slugs conhecidos são pré-renderizados; qualquer outro cai no
// `notFound()` do corpo (200 + noindex por conta do `loading.tsx` pai — mesmo
// comportamento de `/perifericos/categoria/[slug]`).
export const dynamicParams = true

export function generateStaticParams() {
  return TIERLIST_CATEGORY_SLUGS.map((categoria) => ({ categoria }))
}

interface PageProps {
  params: Promise<{ categoria: string }>
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categoria } = await params
  const category = TIERLIST_CATEGORY_BY_SLUG[categoria]

  if (!category) {
    return buildMetadata({
      title: "Categoria não encontrada",
      description: "Essa categoria de tierlist não existe na Sunano.",
      path: `/tierlist/${categoria}`,
      noIndex: true,
    })
  }

  const label = TIERLIST_CATEGORY_LABELS[category]
  const blurb = TIERLIST_CATEGORY_BLURBS[category]

  return buildMetadata({
    title: `Tierlist de ${label}`,
    socialTitle: `Tierlist de ${label}: do S ao F`,
    description: `A tier list de ${blurb}, avaliados pela Sunano. Ranking do S ao F, com filtros por marca, preço e modo de avaliação.`,
    path: tierlistCategoryPath(category),
    eyebrow: "Tierlist",
    subtitle: `Ranking de ${label.toLowerCase()}`,
  })
}

export default async function TierlistCategoriaPage({ params }: PageProps) {
  const { categoria } = await params
  const category = TIERLIST_CATEGORY_BY_SLUG[categoria]
  if (!category) notFound()

  const { items, tierlistMeta } = await getTierlistPageData()
  const ordered = orderedForCategory(items, category)
  const label = TIERLIST_CATEGORY_LABELS[category]
  const blurb = TIERLIST_CATEGORY_BLURBS[category]

  return (
    <div className="mx-auto max-w-6xl px-2 py-5 sm:px-3 md:px-6 md:py-6 lg:px-8 space-y-4 md:space-y-5">
      <TierlistPageHeader
        active="oficial"
        latestUpdate={tierlistMeta}
        heading={`Tierlist de ${label}`}
        sharePath={tierlistCategoryPath(category)}
      />

      <TierlistSeoBlock
        category={category}
        heading={`Tierlist de ${label}`}
        intro={`Ranking de ${blurb}, avaliados pela Sunano — do S ao F. Use os filtros abaixo para refinar por marca, faixa de preço e modo de avaliação.`}
        itemListEntries={itemListEntries(ordered)}
        canonicalPath={tierlistCategoryPath(category)}
        updatedAt={tierlistMeta?.updatedAt ?? null}
      />

      <Suspense fallback={null}>
        <TierlistContent
          initialData={items as never}
          initialCategory={category}
        />
      </Suspense>
    </div>
  )
}
