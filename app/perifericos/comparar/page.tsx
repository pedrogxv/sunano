import { Suspense } from "react"
import BoxLoader from "@/components/ui/box-loader"
import { ComparePageClient } from "./ComparePageClient"

import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

export const metadata: Metadata = buildMetadata({
  title: "Comparar periféricos",
  socialTitle: "Comparador de periféricos",
  description:
    "Compare mouses, teclados, mousepads e headsets lado a lado: specs, peso, sensor, preço e nota do Sunano na mesma tabela.",
  path: "/perifericos/comparar",
  eyebrow: "Periféricos",
  subtitle: "Compare specs lado a lado",
})

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
