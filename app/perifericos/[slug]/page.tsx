import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { buildMetadata } from "@/lib/seo"
import { buildPeripheralDisplayName, buildPeripheralSlug } from "@/lib/peripheral-slug"
import { SITE_URL } from "@/lib/site-url"

import { getPeripheralByIdOrSlug, listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { listProductsByPeripheral } from "@/lib/server/repositories/store-repository"
import { listPublishedPostsByPeripheral } from "@/lib/server/repositories/blog-repository"
import { getPeripheralReviewsWithStats } from "@/lib/server/repositories/peripheral-reviews-repository"
import { BackButton } from "@/components/ui/back-button"
import { PeripheralDetailView } from "@/components/peripherals/PeripheralDetailView"

interface PerifericoPageProps {
  params: Promise<{ slug: string }>
}

export const revalidate = 120

const CATEGORY_LABEL: Record<string, string> = {
  mouse: "Mouse",
  keyboard: "Teclado",
  headset: "Headset",
  mousepad: "Mousepad",
  monitor: "Monitor",
  switch: "Switch",
}

export async function generateMetadata({ params }: PerifericoPageProps): Promise<Metadata> {
  const resolvedParams = await params
  const slug = decodeURIComponent(resolvedParams.slug)
  const data = await getPeripheralByIdOrSlug(slug)
  if (!data) return { title: "Periférico não encontrado" }

  const categoryLabel = CATEGORY_LABEL[data.category] ?? data.category
  const fullName = buildPeripheralDisplayName(data.brand, data.name)
  const tierLabel = data.tier ? `Tier ${data.tier}` : null

  return buildMetadata({
    title: fullName,
    titleSuffix: ` — ${categoryLabel} | Sunano`,
    // Sem `generateMetadata` esta página herdava o card genérico do layout
    // raiz: TODO periférico era compartilhado com o mesmo título e a mesma
    // imagem, sem dizer qual produto era.
    description: [
      `Ficha técnica, tier e reviews do ${fullName}`,
      tierLabel ? `${tierLabel} na tierlist da Sunano` : `Avaliado pela comunidade da Sunano`,
      `Veja nota, specs e o que quem usa achou antes de comprar.`,
    ].join(". "),
    // Canonical no formato slug--id: é a URL que a navegação do site gera, e
    // sem isso um acesso por UUID viraria uma segunda URL do mesmo conteúdo.
    path: `/perifericos/${buildPeripheralSlug(data.name, data.id)}`,
    eyebrow: categoryLabel,
    subtitle: tierLabel ? `${tierLabel} · ${data.brand}` : data.brand,
    image: data.image_url,
    imageVariant: "product",
  })
}

export default async function PerifericoPage({ params }: PerifericoPageProps) {
  const resolvedParams = await params
  const slug = decodeURIComponent(resolvedParams.slug)

  const data = await getPeripheralByIdOrSlug(slug)

  if (!data) {
    notFound()
  }

  const details = ((data.specs as Record<string, unknown>)?.details ?? {}) as Record<string, unknown>

  // As quatro buscas abaixo só dependem de `data`/`details`, não umas das
  // outras — rodam em paralelo em vez de em série para não empilhar 4
  // round-trips sequenciais numa página com revalidate=30.
  const [linkedSwitch, linkedProducts, relatedPosts, allPeripherals, reviewStats] = await Promise.all([
    // Switch vinculado: se o admin apontou este teclado/mouse a um Switch
    // cadastrado, a linha "Switch" vira um link para a página daquele switch.
    details.switchPeripheralId
      ? getPeripheralByIdOrSlug(String(details.switchPeripheralId))
      : Promise.resolve(null),
    listProductsByPeripheral(data.id),
    listPublishedPostsByPeripheral(data.id),
    listAllPeripherals(),
    // Só as agregadas interessam aqui (média + total) para o `aggregateRating`
    // do JSON-LD; a lista paginada de reviews é carregada pelo próprio
    // componente de detalhe.
    getPeripheralReviewsWithStats(data.id, { limit: 1 }),
  ])

  const linkedStore = linkedProducts.find((p) => p.type === "store") ?? null
  const rankedInCategory = allPeripherals
    .filter((p) => p.category === data.category)
    .map((p) => {
      const pDetails = ((p.specs as Record<string, unknown>)?.details ?? {}) as Record<string, unknown>
      const pScore = pDetails.score != null ? Number(pDetails.score) : null
      return { id: p.id, score: pScore }
    })
    .filter((p): p is { id: string; score: number } => typeof p.score === "number" && p.score > 0)
    .sort((a, b) => b.score - a.score)

  const rankIndex = rankedInCategory.findIndex((p) => p.id === data.id)
  const rankBadge = rankIndex >= 0 ? { position: rankIndex + 1, total: rankedInCategory.length } : null

  // Um mesmo produto às vezes é cadastrado mais de uma vez em categorias
  // diferentes da tierlist (ex.: "ATK Duckbill" como mouse E como mousepad,
  // cada linha com seu próprio tier). Agrupa por nome+marca pra mostrar
  // todas as classificações desse produto na página, não só a da categoria
  // que originou esta URL.
  const classifications = allPeripherals
    .filter((p) => p.name.trim().toLowerCase() === data.name.trim().toLowerCase() && p.brandId === data.brandId)
    .map((p) => ({ id: p.id, name: p.name, category: p.category, tier: p.tier }))
    .sort((a, b) => a.category.localeCompare(b.category))

  /**
   * JSON-LD Product: a ficha de periférico competia na SERP como link de texto
   * puro contra lojas e agregadores que enviam esse schema. Com
   * `aggregateRating` o resultado passa a poder exibir estrelas, que é o que
   * separa um clique de uma impressão perdida numa busca por modelo.
   *
   * `aggregateRating` só entra quando existe review de verdade: o Google trata
   * rating vazio ou zerado como marcação inválida e pode desqualificar o rich
   * result da página inteira.
   */
  const canonicalUrl = `${SITE_URL}/perifericos/${buildPeripheralSlug(data.name, data.id)}`
  const fullProductName = buildPeripheralDisplayName(data.brand, data.name)

  const peripheralJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": canonicalUrl,
    name: fullProductName,
    ...(data.brand ? { brand: { "@type": "Brand", name: data.brand } } : {}),
    ...(data.image_url ? { image: [new URL(data.image_url, SITE_URL).toString()] } : {}),
    ...(CATEGORY_LABEL[data.category] ? { category: CATEGORY_LABEL[data.category] } : {}),
    description: `Ficha técnica, tier e reviews do ${fullProductName} na Sunano.`,
    ...(reviewStats.average != null && reviewStats.totalCount > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviewStats.average,
            reviewCount: reviewStats.totalCount,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
    ...(linkedStore ? { offers: { "@type": "Offer", url: `${SITE_URL}/loja/${linkedStore.slug}`, priceCurrency: "BRL", seller: { "@id": `${SITE_URL}/#organization` } } } : {}),
  }

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-4 sm:px-4 md:px-6 lg:px-8">
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{ __html: JSON.stringify(peripheralJsonLd) }}
      />
      <div className="mb-3">
        <BackButton />
      </div>
      <PeripheralDetailView
        data={data}
        rankBadge={rankBadge}
        relatedPosts={relatedPosts}
        linkedStore={linkedStore}
        linkedSwitch={linkedSwitch ? { id: linkedSwitch.id, name: linkedSwitch.name } : null}
        classifications={classifications}
      />
    </div>
  )
}
