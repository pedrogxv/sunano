import { Skeleton } from "@/components/ui/skeleton"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"

export default function ForumPostLoading() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-2 py-8 sm:px-4 md:px-6">
      <Skeleton className="h-4 w-32" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {/* Post */}
          <div className={cn("rounded-xl p-4", CARD_SURFACE)}>
            <div className="flex items-start gap-3">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-16" />
                </div>
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-2/3" />
                <div className="mt-3 flex items-center gap-2">
                  <Skeleton className="h-6 w-14 rounded-full" />
                  <Skeleton className="h-6 w-12 rounded-full" />
                  <Skeleton className="h-6 w-6 rounded-full" />
                </div>
              </div>
            </div>
          </div>

          {/* Comments */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-7 w-40 rounded-lg" />
            </div>

            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="size-8 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-2">
                    <div className="flex items-center gap-1.5">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                    <Skeleton className="h-3.5 w-full" />
                    <Skeleton className="h-3.5 w-1/2" />
                    <div className="mt-2 flex items-center gap-3">
                      <Skeleton className="h-3 w-10" />
                      <Skeleton className="h-3 w-14" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="space-y-4">
          <div className={cn("rounded-xl p-4 space-y-3", CARD_SURFACE)}>
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-full" />
            <div className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
              <Skeleton className="mx-auto h-6 w-10" />
              <Skeleton className="mx-auto h-6 w-10" />
            </div>
          </div>

          <div className={cn("rounded-xl p-4 space-y-3", CARD_SURFACE)}>
            <Skeleton className="h-3 w-12" />
            <div className="flex items-center gap-2.5">
              <Skeleton className="size-9 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3">
              <Skeleton className="mx-auto h-6 w-8" />
              <Skeleton className="mx-auto h-6 w-8" />
              <Skeleton className="mx-auto h-6 w-8" />
            </div>
          </div>
        </aside>
      </div>
    </div>
  )
}
