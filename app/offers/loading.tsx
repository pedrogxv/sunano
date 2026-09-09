import { Skeleton } from "@/components/ui/skeleton"

export default function OffersLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-2 py-8 sm:px-4 md:px-6">
      <Skeleton className="h-44 w-full rounded-2xl" />

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
        {/* Coluna lateral */}
        <div className="space-y-4">
          <Skeleton className="h-10 w-full rounded-xl" />
          <div className="flex gap-1.5 lg:flex-col">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 flex-1 rounded-xl lg:w-full lg:flex-none" />
            ))}
          </div>
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-44 w-full rounded-2xl" />
        </div>

        {/* Grid */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
              <Skeleton className="aspect-[16/10] w-full rounded-none" />
              <div className="space-y-3 p-5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-7 w-28" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
