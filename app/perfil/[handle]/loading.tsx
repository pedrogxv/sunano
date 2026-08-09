import { Skeleton } from "@/components/ui/skeleton"

export default function ProfilePublicoLoading() {
  return (
    <div className="mx-auto max-w-5xl px-2 py-6 sm:px-4 md:px-6 md:py-8">
      <div className="relative">
        <Skeleton className="h-44 w-full rounded-2xl sm:h-64 md:h-80" />

        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2">
          <Skeleton className="size-24 rounded-xl border-[3px] border-transparent sm:size-28 md:size-32" />
        </div>

        <Skeleton className="absolute right-0 top-full mt-3 h-8 w-28 rounded-lg" />
      </div>

      <div className="flex flex-col items-center gap-1.5 px-4 pb-5 pt-16 text-center sm:pt-[4.5rem]">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-5 w-24 rounded-full" />
        <Skeleton className="h-3 w-32" />
      </div>

      <div className="flex flex-wrap justify-center gap-3 sm:gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-24 rounded-xl" />
        ))}
      </div>

      <div className="mt-3 space-y-8">
        <section className="space-y-3">
          <Skeleton className="h-3.5 w-20" />
          <div className="flex flex-wrap gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="size-16 rounded-xl" />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <Skeleton className="h-3.5 w-24" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-xl" />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <Skeleton className="h-3.5 w-44" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
