import { Skeleton } from "@/components/ui/skeleton"

const TIER_ROWS = 6

export default function TierlistLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-4 py-6 md:px-6 lg:px-8">
      {/* Filtros de categoria */}
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>

      {/* Linhas de tier */}
      <div className="space-y-2">
        {Array.from({ length: TIER_ROWS }).map((_, row) => (
          <div key={row} className="flex gap-2 rounded-xl border border-border bg-card p-2">
            <Skeleton className="h-auto w-14 shrink-0 rounded-lg" />
            <div className="grid flex-1 grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-[88px] rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
