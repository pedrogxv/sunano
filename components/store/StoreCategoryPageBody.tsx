import { Suspense } from "react"
import { notFound } from "next/navigation"
import { listStoreProductsPaginated, getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { listActiveCategoryBanners } from "@/lib/server/repositories/store-banners-repository"
import { StoreContent } from "@/components/store/StoreContent"
import { BreadcrumbJsonLd, ItemListJsonLd } from "@/components/seo/JsonLd"
import { getCategoryLabel } from "@/lib/store-category-icons"
import { categoryPageScope, hasCategoryPage } from "@/lib/store-catalog"

const PAGE_SIZE = 24

/**
 * Conteúdo da página de categoria da Loja. Compartilhado entre a rota pública
 * (`/loja/categoria/[categoria]`, ISR) e a cópia dinâmica que o proxy serve a
 * quem atravessa a manutenção (`/loja/acesso-equipe/categoria/[categoria]`):
 * uma tela só, para as duas nunca divergirem.
 */
export async function StoreCategoryPageBody({ category }: { category: string }) {
  const filterOptions = await getStoreFilterOptions("store")
  // `audio` não é categoria do banco: é página de grupo (Headset + IEM).
  if (!hasCategoryPage(category, filterOptions.categories)) {
    notFound()
  }

  const [{ items, total }, { items: featuredItems }, categoryBanners] = await Promise.all([
    listStoreProductsPaginated({
      type: "store",
      // Mousepad lista também os de vidro; Áudio, Headset + IEM (ver `categoryPageScope`).
      categories: categoryPageScope(category),
      page: 1,
      pageSize: PAGE_SIZE,
    }),
    listStoreProductsPaginated({
      type: "store",
      featured: true,
      page: 1,
      pageSize: 8,
    }),
    // Banner é enfeite: se a leitura falhar, a categoria sai com o cabeçalho
    // padrão em vez de derrubar a página inteira.
    listActiveCategoryBanners(category).catch(() => []),
  ])

  return (
    <>
      {/* A grade é filtrada e paginada no cliente: sem `ItemList` o Google não
          tem âncora rastreável para os produtos desta categoria — o mesmo
          motivo pelo qual `/loja` emite o bloco. FORA do `<Suspense>`: com a
          página estática, o `useSearchParams` do StoreContent faz tudo dentro
          do boundary renderizar só no cliente, e o JSON-LD sumiria do HTML. */}
      <ItemListJsonLd
        name={`${getCategoryLabel(category)} - Loja Sunano`}
        items={items.map((item) => ({ name: item.name, url: `/loja/${item.slug}` }))}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Loja", item: "/loja" },
          { name: getCategoryLabel(category), item: `/loja/categoria/${encodeURIComponent(category)}` },
        ]}
      />
      <Suspense>
        <StoreContent
          initialItems={items}
          initialTotal={total}
          initialFilterOptions={filterOptions}
          initialFeatured={featuredItems}
          pageSize={PAGE_SIZE}
          banner={{ type: "category", value: category }}
          categoryBanners={categoryBanners}
        />
      </Suspense>
    </>
  )
}
