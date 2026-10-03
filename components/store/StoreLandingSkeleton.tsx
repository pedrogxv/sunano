import { Skeleton } from "@/components/ui/skeleton"
import { ProductCardSkeleton } from "@/components/store/ProductCard"

/**
 * Carregando das landings de categoria e marca (`loading.tsx`). Sem ele o Next
 * segurava a página anterior na tela até a nova ficar pronta — quem saía da
 * Home da Loja via os produtos de lá por um segundo, como se a categoria
 * tivesse aberto sem filtro, e a grade só trocava depois.
 *
 * Mesma silhueta de `StoreBannerHero` + catálogo de `StoreContent`, para a
 * troca não pular.
 */
export function StoreLandingSkeleton() {
  return (
    <div>
      <div className="border-b border-[#1c1c1c] bg-[#0b0f14] py-10 sm:py-14">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 lg:px-8">
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

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pt-5 pb-10 sm:gap-7 sm:pt-6 sm:pb-[72px] lg:px-8">
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
    </div>
  )
}
