import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { buildMetadata } from "@/lib/seo"
import { buildPeripheralDisplayName, buildPeripheralSlug } from "@/lib/peripheral-slug"
import { SITE_URL } from "@/lib/site-url"

import { getPeripheralByIdOrSlug, listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { listProductsByPeripheral } from "@/lib/server/repositories/store-repository"
import { listPublishedPostsByPeripheral } from "@/lib/server/repositories/blog-repository"
import { getPostsForPeripheral } from "@/lib/server/repositories/forum-peripherals-repository"
import {
  countPeripheralReviews,
  getPeripheralReviewsWithStats,
} from "@/lib/server/repositories/peripheral-reviews-repository"
import { isPeripheralRecordIndexable } from "@/lib/indexability"
import { BreadcrumbJsonLd, JsonLd } from "@/components/seo/JsonLd"
import { CATEGORY_PLURAL_LABELS, isCategory } from "@/lib/tag-options"
import { BackButton } from "@/components/ui/back-button"
import { PeripheralDetailView } from "@/components/peripherals/PeripheralDetailView"

/**
 * SEM `loading.tsx` nesta pasta — de propósito.
 *
 * Um `loading.tsx` no segmento dinâmico é um Suspense boundary: o Next começa
 * a streamar a resposta e se compromete com `200 OK` antes de o componente
 * chegar ao `notFound()`. Dali em diante o status não pode mais mudar para
 * 404 — o Next só injeta `<meta robots="noindex">` no HTML já enviado (ver
 * node_modules/next/dist/docs/01-app/02-guides/streaming.md, "The HTTP
 * contract"). O efeito era soft-404: `/perifericos/<qualquer-coisa>` respondia
 * 200 com a tela "não encontrado", e o Search Console contava a URL como
 * rastreada sem conteúdo.
 *
 * Verificado empiricamente: com o arquivo presente, 200; sem ele, 404 — e as
 * rotas que nunca o tiveram (`/blog`, `/noticias`) sempre devolveram 404.
 * Atenção ao testar: `next dev` rodando em paralelo recria o cache de
 * `.next` e falseia o resultado — use `rm -rf .next && next build && next start`.
 *
 * O custo é não ter skeleton nesta rota (o conteúdo aparece de uma vez, após
 * o servidor resolver). Se um dia o skeleton for necessário aqui, ele precisa
 * vir de um `<Suspense>` DENTRO do componente, depois do `notFound()`, nunca
 * de um `loading.tsx` neste nível.
 */

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

  // Ficha ainda sem specs nem review sai do índice (mas mantém `follow`): é a
  // mesma decisão que o `app/sitemap.ts` toma via `lib/indexability.ts`, e os
  // dois lados precisam concordar — anunciar no sitemap uma URL marcada
  // `noindex` é sinal contraditório. Preenchida a ficha, ela volta ao índice
  // sozinha. `count` com `head: true`, deduplicado pelo `cache` do React com
  // a leitura de reviews do corpo da página.
  const reviewCount = await countPeripheralReviews(data.id)

  return buildMetadata({
    thinContent: !isPeripheralRecordIndexable({ ...data, reviewCount }),
    title: fullName,
    titleSuffix: ` - ${categoryLabel} | Sunano`,
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
  const [linkedSwitch, linkedProducts, relatedPosts, allPeripherals, reviewStats, forumPosts] = await Promise.all([
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
    // Tópicos do fórum que citam este periférico — o link reverso do vínculo
    // criado ao publicar/editar um post.
    getPostsForPeripheral(data.id),
  ])

  // Todos os anúncios ativos deste periférico (venda normal primeiro — ver
  // `listProductsByPeripheral`). `linkedStore` é o principal, usado no botão de
  // destaque e no JSON-LD; a lista inteira vai para o bloco "Onde comprar".
  const linkedStores = linkedProducts.filter((p) => p.type === "store")
  const linkedStore = linkedStores[0] ?? null
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

  const hasRating = reviewStats.average != null && reviewStats.totalCount > 0

  /**
   * O Google exige que um `Product` traga ao menos UM entre `offers`,
   * `review` e `aggregateRating` — sem nenhum deles o item é reprovado com
   * "Especifique offers, review ou aggregateRating" (erro crítico no relatório
   * de Itens detectados), e o erro se propaga para a página inteira.
   *
   * Era o caso de 509 das 576 fichas: sem review (só 49 têm) e sem produto
   * na loja (22), sobrava um `Product` com nome, marca e imagem — exatamente
   * os campos que NÃO satisfazem a exigência.
   *
   * Então `Product` só é emitido quando há de fato oferta ou nota. Sem isso a
   * ficha declara `ItemPage`, que descreve a página honestamente (é uma ficha
   * técnica, não um produto à venda) e não pede rich result nenhum — melhor
   * que marcação reprovada, que só gera ruído no Search Console.
   */
  const peripheralJsonLd = hasRating || linkedStore
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": canonicalUrl,
        name: fullProductName,
        ...(data.brand ? { brand: { "@type": "Brand", name: data.brand } } : {}),
        ...(data.image_url ? { image: [new URL(data.image_url, SITE_URL).toString()] } : {}),
        ...(CATEGORY_LABEL[data.category] ? { category: CATEGORY_LABEL[data.category] } : {}),
        description: `Ficha técnica, tier e reviews do ${fullProductName} na Sunano.`,
        ...(hasRating
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
    : {
        "@context": "https://schema.org",
        "@type": "ItemPage",
        "@id": canonicalUrl,
        url: canonicalUrl,
        name: fullProductName,
        description: `Ficha técnica, tier e reviews do ${fullProductName} na Sunano.`,
        ...(data.image_url ? { primaryImageOfPage: new URL(data.image_url, SITE_URL).toString() } : {}),
        isPartOf: { "@id": `${SITE_URL}/#website` },
      }

  return (
    <div className="mx-auto max-w-[1600px] px-2 py-4 sm:px-4 md:px-6 lg:px-8">
      <JsonLd data={peripheralJsonLd} />
      {/* A trilha só existia na loja; sem ela o Google mostra a URL crua no
          lugar de "Periféricos > Categoria > Modelo". */}
      <BreadcrumbJsonLd
        items={[
          { name: "Periféricos", item: "/perifericos" },
          ...(isCategory(data.category) && CATEGORY_PLURAL_LABELS[data.category]
            ? [
                {
                  name: CATEGORY_PLURAL_LABELS[data.category],
                  item: `/perifericos/categoria/${data.category}`,
                },
              ]
            : []),
          { name: fullProductName, item: `/perifericos/${slug}` },
        ]}
      />
      <div className="mb-3">
        <BackButton />
      </div>
      <PeripheralDetailView
        data={data}
        rankBadge={rankBadge}
        relatedPosts={relatedPosts}
        forumPosts={forumPosts}
        linkedStore={linkedStore}
        linkedStores={linkedStores}
        linkedSwitch={linkedSwitch ? { id: linkedSwitch.id, name: linkedSwitch.name } : null}
        classifications={classifications}
      />
    </div>
  )
}
