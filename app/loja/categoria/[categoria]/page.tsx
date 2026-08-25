import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { listStoreProductsPaginated, getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { StoreContent } from "@/components/store/StoreContent"
import { getCategoryLabel } from "@/lib/store-category-icons"

export const revalidate = 60

const PAGE_SIZE = 24

interface CategoriaPageProps {
  params: Promise<{ categoria: string }>
}

export async function generateMetadata({ params }: CategoriaPageProps): Promise<Metadata> {
  const { categoria } = await params
  const category = decodeURIComponent(categoria)
  const categoryLabel = getCategoryLabel(category)
  return {
    title: `${categoryLabel} — Mercado`,
    description: `Produtos da categoria ${categoryLabel} no Mercado Sunano: periféricos testados antes de anunciar, com PIX na hora.`,
    alternates: { canonical: `/loja/categoria/${encodeURIComponent(category)}` },
  }
}

export default async function LojaCategoriaPage({ params }: CategoriaPageProps) {
  const { categoria } = await params
  const category = decodeURIComponent(categoria)

  const filterOptions = await getStoreFilterOptions("store")
  if (!filterOptions.categories.includes(category)) {
    notFound()
  }

  const [{ items, total }, { items: featuredItems }] = await Promise.all([
    listStoreProductsPaginated({
      type: "store",
      categories: [category],
      page: 1,
      pageSize: PAGE_SIZE,
    }),
    listStoreProductsPaginated({
      type: "store",
      featured: true,
      page: 1,
      pageSize: 8,
    }),
  ])

  return (
    <Suspense>
      <StoreContent
        initialItems={items}
        initialTotal={total}
        initialFilterOptions={filterOptions}
        initialFeatured={featuredItems}
        pageSize={PAGE_SIZE}
        banner={{ type: "category", value: category }}
      />
    </Suspense>
  )
}
