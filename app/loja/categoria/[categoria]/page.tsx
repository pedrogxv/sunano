import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { Suspense } from "react"
import { notFound } from "next/navigation"
import { listStoreProductsPaginated, getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { StoreContent } from "@/components/store/StoreContent"
import { getCategoryLabel } from "@/lib/store-category-icons"
import { ShoppingBag } from "lucide-react"
import { ComingSoon } from "@/components/store/ComingSoon"
import {
  isStoreBrowsingBlocked,
  storeMaintenanceMetadata,
} from "@/lib/server/auth/store-maintenance-gate"
import { getStoreLaunchAt } from "@/lib/store-maintenance"

export const revalidate = 60

const PAGE_SIZE = 24

interface CategoriaPageProps {
  params: Promise<{ categoria: string }>
}

export async function generateMetadata({ params }: CategoriaPageProps): Promise<Metadata> {
  const { categoria } = await params
  const category = decodeURIComponent(categoria)
  const categoryLabel = getCategoryLabel(category)

  const maintenance = storeMaintenanceMetadata({
    title: "Loja",
    path: `/loja/categoria/${encodeURIComponent(category)}`,
  })
  if (maintenance) return maintenance

  return buildMetadata({
    title: `${categoryLabel} - Loja`,
    description: `Todos os produtos da categoria ${categoryLabel} na Loja Sunano: periféricos novos e usados testados antes de anunciar, com PIX na hora e envio para todo o Brasil.`,
    path: `/loja/categoria/${encodeURIComponent(category)}`,
    eyebrow: "Loja",
    subtitle: `Periféricos da categoria ${categoryLabel}`,
  })
}

export default async function LojaCategoriaPage({ params }: CategoriaPageProps) {
  // Mesma tela de manutenção de `/loja` — sem ela esta rota servia o catálogo
  // inteiro da categoria com HTTP 200 enquanto a Loja dizia "Coming soon".
  if (await isStoreBrowsingBlocked()) {
    return (
      <ComingSoon
        icon={ShoppingBag}
        title="Loja"
        description="A Loja, com produtos selecionados pelo Sunano, está sendo preparada. Fique de olho nas redes para o lançamento."
        accent="emerald"
        launchAt={getStoreLaunchAt()}
      />
    )
  }

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
