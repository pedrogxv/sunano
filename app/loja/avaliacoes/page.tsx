import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"
import { Suspense } from "react"
import { getStoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { getStoreWideReviewAggregate, listStoreWideReviews } from "@/lib/server/repositories/store-reviews-repository"
import { StoreReviewsContent } from "@/components/store/StoreReviewsContent"

export const revalidate = 60

export const metadata: Metadata = buildMetadata({
  title: "Avaliações — Loja",
  description: "Veja as avaliações de quem já comprou na Loja Sunano: notas e comentários reais de compradores verificados.",
  path: "/loja/avaliacoes",
  eyebrow: "Loja",
  subtitle: "Avaliações de compradores",
})

export default async function LojaAvaliacoesPage() {
  const [filterOptions, aggregate, reviews] = await Promise.all([
    getStoreFilterOptions("store"),
    getStoreWideReviewAggregate(),
    listStoreWideReviews(60),
  ])

  return (
    <Suspense>
      <StoreReviewsContent filterOptions={filterOptions} aggregate={aggregate} reviews={reviews} />
    </Suspense>
  )
}
