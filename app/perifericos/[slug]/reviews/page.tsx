import { cache } from "react"
import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"

import { buildMetadata } from "@/lib/seo"
import { buildPeripheralDisplayName, buildPeripheralSlug } from "@/lib/peripheral-slug"
import { REVIEW_CATEGORY_GROUPS, reviewCategoryKeyFor } from "@/lib/peripheral-review-categories"
import { REVIEW_LIST_PAGE_SIZE } from "@/lib/peripheral-review-list"
import { SITE_URL } from "@/lib/site-url"
import { CATEGORY_PLURAL_LABELS, isCategory } from "@/lib/tag-options"

import { getPeripheralByIdOrSlug } from "@/lib/server/repositories/peripherals-repository"
import {
  countPeripheralReviews,
  getPeripheralReviewsWithStats,
} from "@/lib/server/repositories/peripheral-reviews-repository"
import { AllPeripheralReviewsContent } from "@/components/peripherals/AllPeripheralReviewsContent"
import { BreadcrumbJsonLd, JsonLd } from "@/components/seo/JsonLd"

interface PeripheralReviewsPageProps {
  params: Promise<{ slug: string }>
}

export const revalidate = 120

/**
 * `generateMetadata` e a página pedem o mesmo periférico: deduplicado na
 * requisição, senão cada regeração ISR consultava o banco duas vezes.
 */
const getPeripheral = cache(getPeripheralByIdOrSlug)

/** `%` solto no segmento (nome com "100%") faz `decodeURIComponent` lançar e a página virar 500. */
function decodeSlug(raw: string): string {
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function generateMetadata({ params }: PeripheralReviewsPageProps): Promise<Metadata> {
  const { slug: rawSlug } = await params
  const data = await getPeripheral(decodeSlug(rawSlug))
  if (!data) return { title: "Periférico não encontrado" }

  const fullName = buildPeripheralDisplayName(data.brand, data.name)
  const reviewCount = await countPeripheralReviews(data.id)

  return buildMetadata({
    // Sem nenhuma review a página é só um convite para avaliar: fica fora do
    // índice (mantendo `follow`) e volta sozinha com a primeira review.
    thinContent: reviewCount === 0,
    title: `Reviews do ${fullName}`,
    titleSuffix: " | Sunano",
    description:
      reviewCount > 0
        ? `${reviewCount} ${reviewCount === 1 ? "avaliação" : "avaliações"} da comunidade sobre o ${fullName}: notas, prós e contras de quem usa.`
        : `Avaliações da comunidade sobre o ${fullName}: notas, prós e contras de quem usa.`,
    path: `/perifericos/${buildPeripheralSlug(data.name, data.id)}/reviews`,
    eyebrow: "Reviews",
    subtitle: fullName,
    image: data.image_url,
    imageVariant: "product",
  })
}

/**
 * Todas as reviews de um periférico: resumo com distribuição por nota (que
 * também filtra), ordenação, busca no texto e o destaque positiva × crítica.
 * O carrossel de flashcards da ficha mostra uma por vez em ordem aleatória e
 * linka pra cá quem quiser ler tudo.
 */
export default async function PeripheralReviewsPage({ params }: PeripheralReviewsPageProps) {
  const { slug: rawSlug } = await params
  const slug = decodeSlug(rawSlug)

  const data = await getPeripheral(slug)
  if (!data) notFound()

  // Uma URL por página. O fallback por nome de `getPeripheralByIdOrSlug`
  // aceita qualquer trecho do nome (links antigos), e cada variação virava
  // outra URL servindo o mesmo conteúdo; o `canonical` só avisava o Google.
  const canonicalSlug = buildPeripheralSlug(data.name, data.id)
  if (slug !== canonicalSlug) permanentRedirect(`/perifericos/${canonicalSlug}/reviews`)

  const stats = await getPeripheralReviewsWithStats(data.id, {
    page: 1,
    limit: REVIEW_LIST_PAGE_SIZE,
    includeSpotlight: true,
  })

  const fullName = buildPeripheralDisplayName(data.brand, data.name)
  const productPath = `/perifericos/${canonicalSlug}`
  const reviewsPath = `${productPath}/reviews`
  const categoryKey = reviewCategoryKeyFor(data.category)
  const categoryLabel = REVIEW_CATEGORY_GROUPS.find((g) => g.key === categoryKey)?.label ?? null

  /**
   * As reviews desta página no JSON-LD do MESMO `Product` da ficha (mesmo
   * `@id`): o Google junta as duas marcações numa entidade só em vez de ver
   * dois produtos. Só sai com review de verdade — rating vazio invalida o
   * rich result da página inteira (ver comentário na ficha).
   */
  const productJsonLd =
    stats.totalCount > 0 && stats.average != null
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          "@id": `${SITE_URL}${productPath}`,
          name: fullName,
          ...(data.brand ? { brand: { "@type": "Brand", name: data.brand } } : {}),
          ...(data.image_url ? { image: [new URL(data.image_url, SITE_URL).toString()] } : {}),
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: stats.average,
            reviewCount: stats.totalCount,
            bestRating: 5,
            worstRating: 1,
          },
          review: stats.reviews
            .filter((r) => r.body)
            .map((r) => ({
              "@type": "Review",
              author: { "@type": "Person", name: r.author_display_name },
              datePublished: r.created_at.slice(0, 10),
              reviewBody: r.body,
              reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            })),
        }
      : null

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-4 md:px-6 lg:px-8">
      {productJsonLd && <JsonLd data={productJsonLd} />}
      <BreadcrumbJsonLd
        items={[
          { name: "Periféricos", item: "/perifericos" },
          ...(isCategory(data.category) && CATEGORY_PLURAL_LABELS[data.category]
            ? [{ name: CATEGORY_PLURAL_LABELS[data.category], item: `/perifericos/categoria/${data.category}` }]
            : []),
          { name: fullName, item: productPath },
          { name: "Reviews", item: reviewsPath },
        ]}
      />
      <AllPeripheralReviewsContent
        peripheral={{
          id: data.id,
          displayName: fullName,
          eyebrow: [categoryLabel, data.brand].filter(Boolean).join(" · ") || null,
          imageUrl: data.image_url,
          href: productPath,
          reviewsPath,
          categoryKey,
          formPeripheral: { id: data.id, name: data.name, brand: data.brand, image_url: data.image_url },
        }}
        initial={stats}
      />
    </div>
  )
}
