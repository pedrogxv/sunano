import type { Metadata } from "next"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { listStoreProductsPaginated, getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { StoreContent } from "@/components/store/StoreContent"

export const revalidate = 60

const PAGE_SIZE = 24

interface MarcaPageProps {
  params: Promise<{ marca: string }>
}

export async function generateMetadata({ params }: MarcaPageProps): Promise<Metadata> {
  const { marca } = await params
  const brand = decodeURIComponent(marca)
  return {
    title: `${brand} — Mercado`,
    description: `Produtos da marca ${brand} no Mercado Sunano: periféricos testados antes de anunciar, com PIX na hora.`,
    alternates: { canonical: `/loja/marca/${encodeURIComponent(brand)}` },
  }
}

export default async function LojaMarcaPage({ params }: MarcaPageProps) {
  const { marca } = await params
  const brand = decodeURIComponent(marca)

  const filterOptions = await getStoreFilterOptions("store")
  if (!filterOptions.brands.includes(brand)) {
    notFound()
  }

  const [{ items, total }, { items: featuredItems }] = await Promise.all([
    listStoreProductsPaginated({
      type: "store",
      brands: [brand],
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
        banner={{ type: "brand", value: brand }}
      />
    </Suspense>
  )
}
