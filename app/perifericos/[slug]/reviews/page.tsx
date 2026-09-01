import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { buildMetadata } from "@/lib/seo"
import { buildPeripheralDisplayName, buildPeripheralSlug } from "@/lib/peripheral-slug"

import { getPeripheralByIdOrSlug } from "@/lib/server/repositories/peripherals-repository"
import { getPeripheralReviewsWithStats } from "@/lib/server/repositories/peripheral-reviews-repository"
import { AllPeripheralReviewsContent } from "@/components/peripherals/AllPeripheralReviewsContent"
import { BackButton } from "@/components/ui/back-button"

interface PeripheralReviewsPageProps {
  params: Promise<{ slug: string }>
}

export const revalidate = 120

export async function generateMetadata({ params }: PeripheralReviewsPageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)
  const data = await getPeripheralByIdOrSlug(slug)
  if (!data) return { title: "Periférico não encontrado" }

  const fullName = buildPeripheralDisplayName(data.brand, data.name)

  return buildMetadata({
    title: `Reviews do ${fullName}`,
    titleSuffix: " | Sunano",
    description: `Todas as avaliações da comunidade sobre o ${fullName}: notas, prós e contras de quem usa.`,
    path: `/perifericos/${buildPeripheralSlug(data.name, data.id)}/reviews`,
    eyebrow: "Reviews",
    subtitle: fullName,
    image: data.image_url,
    imageVariant: "product",
  })
}

/**
 * Lista completa das reviews de um periférico, ordenada por Aura do autor —
 * o carrossel de flashcards da página do produto mostra uma por vez em ordem
 * aleatória e linka pra cá quem quiser ler tudo em sequência.
 */
export default async function PeripheralReviewsPage({ params }: PeripheralReviewsPageProps) {
  const { slug: rawSlug } = await params
  const slug = decodeURIComponent(rawSlug)

  const data = await getPeripheralByIdOrSlug(slug)
  if (!data) notFound()

  const stats = await getPeripheralReviewsWithStats(data.id, { page: 1, limit: 20 })
  const fullName = buildPeripheralDisplayName(data.brand, data.name)

  return (
    <div className="mx-auto max-w-3xl px-2 py-4 sm:px-4 md:px-6 lg:px-8">
      <div className="mb-3">
        <BackButton />
      </div>
      <AllPeripheralReviewsContent
        peripheralId={data.id}
        peripheralName={fullName}
        peripheralHref={`/perifericos/${buildPeripheralSlug(data.name, data.id)}`}
        initialReviews={stats.reviews}
        initialHasMore={stats.hasMore}
        totalCount={stats.totalCount}
        average={stats.average}
      />
    </div>
  )
}
