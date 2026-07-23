import { Skeleton } from "@/components/ui/skeleton"

export default function PeripheralDetailLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-4 md:px-6 lg:px-8">
      <Skeleton className="mb-3 h-5 w-40" />
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Galeria */}
        <Skeleton className="aspect-square w-full rounded-2xl" />

        {/* Informações */}
        <div className="space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      </div>
    </div>
  )
}
