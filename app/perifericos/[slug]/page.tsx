import { notFound } from "next/navigation"

import { getPeripheralByIdOrSlug, listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { listProductsByPeripheral } from "@/lib/server/repositories/store-repository"
import { listPublishedPostsByPeripheral } from "@/lib/server/repositories/blog-repository"
import { BackButton } from "@/components/ui/back-button"
import { PeripheralDetailView } from "@/components/peripherals/PeripheralDetailView"

interface PerifericoPageProps {
  params: Promise<{ slug: string }>
}

export const revalidate = 120

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
  const [linkedSwitch, linkedProducts, relatedPosts, allPeripherals] = await Promise.all([
    // Switch vinculado: se o admin apontou este teclado/mouse a um Switch
    // cadastrado, a linha "Switch" vira um link para a página daquele switch.
    details.switchPeripheralId
      ? getPeripheralByIdOrSlug(String(details.switchPeripheralId))
      : Promise.resolve(null),
    listProductsByPeripheral(data.id),
    listPublishedPostsByPeripheral(data.id),
    listAllPeripherals(),
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

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-4 sm:px-4 md:px-6 lg:px-8">
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
