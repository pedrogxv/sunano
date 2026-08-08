import { Skeleton } from "@/components/ui/skeleton"

export default function EventosLoading() {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-6 lg:px-8">
      <div className="space-y-2">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-4 w-80" />
      </div>

      <div className="space-y-4">
        <Skeleton className="h-4 w-32" />
        <div className="flex flex-wrap gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="w-64 space-y-3 rounded-2xl border border-border bg-card p-5">
              <Skeleton className="mx-auto size-20 rounded-full" />
              <Skeleton className="mx-auto h-4 w-3/4" />
              <Skeleton className="h-2 w-full rounded-full" />
              <Skeleton className="mx-auto h-8 w-24 rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
