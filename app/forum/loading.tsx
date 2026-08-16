import { Skeleton } from "@/components/ui/skeleton"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

export default function ForumLoading() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-8 sm:px-4 md:px-6">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-9 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-9 w-28 shrink-0 rounded-lg" />
      </div>

      <Skeleton className="h-11 w-full rounded-xl" />

      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className={cn("flex items-start gap-3 rounded-xl p-4", CARD_SURFACE)}>
            <Skeleton className="size-9 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
              <div className="mt-3 flex items-center gap-2">
                <Skeleton className="h-6 w-14 rounded-full" />
                <Skeleton className="h-6 w-12 rounded-full" />
                <Skeleton className="h-6 w-6 rounded-full" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
