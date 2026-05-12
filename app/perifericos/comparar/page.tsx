import { Suspense } from "react"
import BoxLoader from "@/components/ui/box-loader"
import { ComparePageClient } from "./ComparePageClient"

export default function ComparePage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-24">
          <BoxLoader />
        </div>
      }
    >
      <ComparePageClient />
    </Suspense>
  )
}
