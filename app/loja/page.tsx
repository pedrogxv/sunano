import type { Metadata } from "next"
import { Suspense } from "react"
import { ShoppingBag } from "lucide-react"
import { listStoreProductsPaginated, getStoreFilterOptions, listBestSellingProducts } from "@/lib/server/repositories/store-repository"
import { listActiveBannersBySection } from "@/lib/server/repositories/store-banners-repository"
import { StoreContent } from "@/components/store/StoreContent"
import { ComingSoon } from "@/components/store/ComingSoon"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { isWebMaster } from "@/lib/admin-permissions"
import { isStoreMaintenanceEnabled, getStoreLaunchAt } from "@/lib/store-maintenance"

export const revalidate = 60

export const metadata: Metadata = {
  title: "Loja",
  description: "Loja Sunano: periféricos novos e usados, com filtros de marca, categoria, estado e preço.",
  alternates: { canonical: "/loja" },
}

const PAGE_SIZE = 24

export default async function LojaPage() {
  if (isStoreMaintenanceEnabled()) {
    // WEB MASTER ignora o modo de manutenção da Loja e continua vendo tudo.
    const { profile } = await getAuthorizedProfile()
    if (!isWebMaster(profile)) {
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
  }

  const [
    { items, total },
    filterOptions,
    { items: featuredItems },
    { items: preOrderItems },
    { items: readyStockItems },
    { items: siteItems },
    { items: serviceItems },
    bestSellingItems,
    sectionBanners,
  ] = await Promise.all([
    listStoreProductsPaginated({
      type: "store",
      page: 1,
      pageSize: PAGE_SIZE,
    }),
    getStoreFilterOptions("store"),
    listStoreProductsPaginated({
      type: "store",
      featured: true,
      page: 1,
      pageSize: 8,
    }),
    listStoreProductsPaginated({
      type: "store",
      saleType: "pre_order",
      page: 1,
      pageSize: 12,
    }),
    listStoreProductsPaginated({
      type: "store",
      saleType: "ready_stock",
      page: 1,
      pageSize: 12,
    }),
    listStoreProductsPaginated({
      type: "store",
      categories: ["site"],
      page: 1,
      pageSize: 12,
    }),
    listStoreProductsPaginated({
      type: "store",
      categories: ["services"],
      page: 1,
      pageSize: 12,
    }),
    listBestSellingProducts(12),
    listActiveBannersBySection(),
  ])

  if (total === 0 && filterOptions.countByType.store === 0) {
    return (
      <ComingSoon
        icon={ShoppingBag}
        title="Loja"
        description="A Loja, com produtos selecionados pelo Sunano, está sendo preparada. Fique de olho nas redes para o lançamento."
        accent="emerald"
      />
    )
  }

  return (
    <Suspense>
      <StoreContent
        initialItems={items}
        initialTotal={total}
        initialFilterOptions={filterOptions}
        initialFeatured={featuredItems}
        preOrderItems={preOrderItems}
        readyStockItems={readyStockItems}
        siteItems={siteItems}
        serviceItems={serviceItems}
        bestSellingItems={bestSellingItems}
        sectionBanners={sectionBanners}
        pageSize={PAGE_SIZE}
      />
    </Suspense>
  )
}
