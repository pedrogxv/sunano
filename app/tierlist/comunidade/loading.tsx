import { Skeleton } from "@/components/ui/skeleton"

/**
 * Override do `loading.tsx` do segmento pai (`app/tierlist/loading.tsx`, que
 * desenha um esqueleto de board de tiers). A listagem da comunidade é uma
 * grade de cards, então o fallback precisa ter esse formato — sem isto o
 * usuário via um esqueleto de tierlist que nunca combina com esta página
 * (e o Next trata `loading.tsx` do pai vazando pro filho como soft-404).
 */
export default function CommunityTierlistsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-2 py-5 sm:px-3 md:space-y-5 md:px-6 md:py-6 lg:px-8">
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-5 w-72 rounded" />
      <div className="flex flex-wrap gap-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-28 rounded-full" />
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-72 rounded-xl" />
        ))}
      </div>
    </div>
  )
}
