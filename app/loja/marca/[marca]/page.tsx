import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { listStoreProductsPaginated, getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { StoreContent } from "@/components/store/StoreContent"

export const revalidate = 60

const PAGE_SIZE = 24

interface MarcaPageProps {
  params: Promise<{ marca: string }>
  searchParams: Promise<{ categoria?: string }>
}

export async function generateMetadata({ params }: MarcaPageProps): Promise<Metadata> {
  const { marca } = await params
  const brand = decodeURIComponent(marca)
  return buildMetadata({
    title: `${brand} — Loja`,
    description: `Todos os produtos da marca ${brand} na Loja Sunano: periféricos novos e usados testados antes de anunciar, com PIX na hora e envio para todo o Brasil.`,
    path: `/loja/marca/${encodeURIComponent(brand)}`,
    eyebrow: "Loja",
    subtitle: `Periféricos da marca ${brand}`,
  })
}

export default async function LojaMarcaPage({ params, searchParams }: MarcaPageProps) {
  const { marca } = await params
  const { categoria } = await searchParams
  const brand = decodeURIComponent(marca)
  const category = categoria ? decodeURIComponent(categoria) : null

  const filterOptions = await getStoreFilterOptions("store")
  if (!filterOptions.brands.includes(brand)) {
    notFound()
  }
  // Categoria vinda do menu (ex: clicou na marca dentro do grupo "Mouse")
  // pode não existir mais — ignora silenciosamente em vez de 404, já que a
  // marca em si continua válida.
  const validCategory = category && filterOptions.categories.includes(category) ? category : null

  const [{ items, total }, { items: featuredItems }] = await Promise.all([
    listStoreProductsPaginated({
      type: "store",
      brands: [brand],
      categories: validCategory ? [validCategory] : undefined,
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
        initialCategory={validCategory}
      />
    </Suspense>
  )
}
