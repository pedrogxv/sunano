import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { ProductCardSkeleton } from "@/components/store/ProductCard"
import { ContentSurface, TopBarDock } from "@/components/layout/TopBarDock"
import { STORE_BANNER_CARD, STORE_CARD_WIDTH, STORE_CONTAINER } from "@/components/store/store-layout"

/**
 * Carregando das landings de categoria e marca (`loading.tsx`). Sem ele o Next
 * segurava a página anterior na tela até a nova ficar pronta — quem saía da
 * Home da Loja via os produtos de lá por um segundo, como se a categoria
 * tivesse aberto sem filtro, e a grade só trocava depois.
 *
 * Mesma silhueta de `StoreBannerHero` + catálogo de `StoreContent`, para a
 * troca não pular. A ilha do menu entra como esqueleto: sem ela, a barra do
 * topo sumia durante o carregamento e o conteúdo subia 72px.
 */
export function StoreLandingSkeleton() {
  return (
    <>
      <TopBarDock glassClassName="gap-3 px-3">
        <Skeleton className="size-8 shrink-0 rounded-lg" />
        <Skeleton className="h-9 w-full max-w-[320px] rounded-full" />
        <Skeleton className="ml-auto size-9 shrink-0 rounded-full" />
      </TopBarDock>
      <ContentSurface>
      <div className={cn(STORE_BANNER_CARD, STORE_CARD_WIDTH, "mt-3 py-7 sm:mt-5 sm:py-10")}>
        <div className="flex flex-col gap-3 px-5 sm:px-8 lg:px-10">
          <Skeleton className="h-4 w-28" />
          <div className="flex items-center gap-3.5">
            <Skeleton className="size-14 shrink-0 rounded-2xl" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="h-8 w-48 sm:h-10 sm:w-64" />
            </div>
          </div>
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      <div className={cn(STORE_CONTAINER, "flex flex-col gap-5 pt-5 pb-10 sm:gap-7 sm:pt-6 sm:pb-[72px]")}>
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 5 }).map((_, idx) => (
            <Skeleton key={idx} className="h-9 w-28 shrink-0 rounded-full" />
          ))}
        </div>
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-9 w-32 rounded-[10px]" />
          <Skeleton className="h-9 w-40 rounded-[10px]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <ProductCardSkeleton key={idx} />
          ))}
        </div>
      </div>
      </ContentSurface>
    </>
  )
}
