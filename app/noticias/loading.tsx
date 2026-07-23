import { Skeleton } from "@/components/ui/skeleton"

export default function NoticiasLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-4 py-8 md:px-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Em alta */}
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <div className="flex gap-3 overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-44 shrink-0 rounded-xl" />
          ))}
        </div>
      </div>

      {/* Feed */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-xl border border-border/50 bg-card/50 p-3">
            <Skeleton className="h-20 w-32 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-2 py-0.5">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
