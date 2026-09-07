import { Skeleton } from "@/components/ui/skeleton"

export default function NoticiasLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-8 px-2 py-8 sm:px-4 md:px-6">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Manchetes */}
      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="overflow-hidden rounded-2xl border border-border/50 bg-card/50">
            <Skeleton className="aspect-video w-full rounded-none" />
            <div className="space-y-3 p-4 sm:p-5">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-8 w-40 rounded-full" />
            </div>
          </div>
        ))}
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
