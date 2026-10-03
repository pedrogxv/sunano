import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { Suspense } from "react"
import { ShoppingBag } from "lucide-react"
import {
  listStoreProductsPaginated,
  getStoreFilterOptions,
  listBestSellingProducts,
  listLaunchAndPreorderProducts,
} from "@/lib/server/repositories/store-repository"
import { listActiveBannersBySection } from "@/lib/server/repositories/store-banners-repository"
import { getStoreHeroTrust, listLiveHeroSlides } from "@/lib/server/repositories/store-hero-repository"
import { StoreContent } from "@/components/store/StoreContent"
import { ItemListJsonLd } from "@/components/seo/JsonLd"
import { ComingSoon } from "@/components/store/ComingSoon"
import {
  isStoreBrowsingBlocked,
  storeMaintenanceMetadata,
} from "@/lib/server/auth/store-maintenance-gate"
import { getStoreLaunchAt } from "@/lib/store-maintenance"
import { STORE_SHOWCASE_SLOTS } from "@/lib/store-showcase"

export const revalidate = 60

// Em manutenção a página é a mesma tela "Coming soon" de todo `/loja/**`, e
// sai do índice (noindex, follow) para não competir com nada nem virar
// conteúdo fino. Fora dela, a metadata completa de sempre.
export function generateMetadata(): Metadata {
  return (
    storeMaintenanceMetadata({ title: "Loja", path: "/loja" }) ??
    buildMetadata({
      title: "Loja",
      socialTitle: "Loja: periféricos novos e usados",
      description: "Loja Sunano: periféricos novos e usados testados antes de anunciar, com filtros de marca, categoria, estado e preço.",
      path: "/loja",
      eyebrow: "Loja",
      subtitle: "Periféricos novos e usados",
    })
  )
}

const PAGE_SIZE = 24

export default async function LojaPage() {
  // Só quem tem a liberação individual do "pacote Loja"
  // (user_profiles.store_access) ignora a manutenção e continua vendo tudo.
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

  const [
    { items, total },
    filterOptions,
    { items: featuredItems },
    { preorders: preOrderItems, launches: launchItems },
    { items: siteItems },
    { items: serviceItems },
    bestSellingItems,
    sectionBanners,
    heroSlides,
    heroTrust,
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
      pageSize: STORE_SHOWCASE_SLOTS,
    }),
    listLaunchAndPreorderProducts(12),
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
    listLiveHeroSlides(),
    getStoreHeroTrust(),
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
      {/* A vitrine é filtrada e paginada no cliente: sem `ItemList` o Google
          não tem âncora rastreável para os produtos desta página. */}
      <ItemListJsonLd
        name="Loja Sunano"
        items={items.map((item) => ({ name: item.name, url: `/loja/${item.slug}` }))}
      />
      <StoreContent
        initialItems={items}
        initialTotal={total}
        initialFilterOptions={filterOptions}
        initialFeatured={featuredItems}
        preOrderItems={preOrderItems}
        launchItems={launchItems}
        heroSlides={heroSlides}
        heroTrust={heroTrust}
        siteItems={siteItems}
        serviceItems={serviceItems}
        bestSellingItems={bestSellingItems}
        sectionBanners={sectionBanners}
        pageSize={PAGE_SIZE}
      />
    </Suspense>
  )
}
