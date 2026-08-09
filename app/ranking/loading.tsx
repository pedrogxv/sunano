import { Skeleton } from "@/components/ui/skeleton"

export default function RankingLoading() {
  return (
    <div className="mx-auto max-w-4xl px-2 py-6 sm:px-4 md:px-6 md:py-8">
      <div className="mb-2 flex flex-wrap gap-1.5">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-20 rounded-lg" />
        ))}
      </div>

      <div className="rounded-2xl border border-border/40 bg-card/40 p-2 sm:p-3">
        <div className="flex items-center gap-3 px-2.5 pb-2 pt-1 sm:gap-4 sm:px-4">
          <Skeleton className="h-2.5 w-4" />
          <Skeleton className="h-2.5 w-10" />
          <Skeleton className="hidden h-2.5 w-16 sm:block" />
        </div>

        <div className="flex flex-col gap-1">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl px-2.5 py-2.5 sm:gap-4 sm:px-4">
              <Skeleton className="h-4 w-6 shrink-0 sm:w-8" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-4">
                <div className="flex min-w-0 items-center gap-2 sm:w-56 sm:shrink-0">
                  <Skeleton className="size-5 shrink-0 rounded-md" />
                  <Skeleton className="h-3.5 w-28" />
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  <Skeleton className="h-2.5 min-w-0 flex-1 rounded-sm sm:h-5" />
                  <Skeleton className="h-3.5 w-10 shrink-0 sm:w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
