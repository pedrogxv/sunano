import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { CATEGORY_PLURAL_LABELS, isCategory } from "@/lib/tag-options"
import { BreadcrumbJsonLd } from "@/components/seo/JsonLd"
import { buildMetadata } from "@/lib/seo"
import { PerifericosCategoryView, categoryPath } from "../../category-view"

export const revalidate = 60

interface CategoriaPageProps {
  params: Promise<{ slug: string }>
}

/**
 * Rota real por categoria, no lugar de `/perifericos?category=`.
 *
 * A listagem por query string funcionava, mas o Google trata parâmetro como
 * candidato fraco a canonical: as 12 variantes competiam entre si e com a
 * listagem genérica em vez de cada uma ranquear para o termo que as pessoas
 * buscam ("melhores teclados", "mousepads gamer"). Um caminho próprio é uma
 * página legítima — e é onde está a busca de cauda longa da wiki.
 *
 * A rota antiga continua funcionando e aponta o canonical para cá, então
 * nenhum link já compartilhado quebra.
 */
export async function generateMetadata({ params }: CategoriaPageProps): Promise<Metadata> {
  const { slug } = await params
  // `noIndex` explícito: sem ele a metadata herdava o `index, follow` do
  // layout raiz, que saía no HTML antes do `noindex` injetado pelo `notFound()`
  // — dois `<meta name="robots">` contraditórios na mesma página.
  if (!isCategory(slug)) {
    return buildMetadata({
      title: "Categoria não encontrada",
      description: "Essa categoria de periférico não existe na wiki da Sunano.",
      path: `/perifericos/categoria/${slug}`,
      noIndex: true,
    })
  }

  const label = CATEGORY_PLURAL_LABELS[slug]

  return buildMetadata({
    title: label,
    socialTitle: `${label}: ficha técnica e tier`,
    description: `Os melhores ${label.toLowerCase()} avaliados pela comunidade: ficha técnica, tier, ranking e reviews de quem usa. Compare antes de comprar.`,
    path: categoryPath(slug),
    eyebrow: "Wiki",
    subtitle: "Ficha técnica, tier e reviews",
  })
}

export default async function PerifericosCategoriaPage({ params }: CategoriaPageProps) {
  const { slug } = await params
  // Slug inválido responde 200 (e não 404) porque `app/perifericos/loading.tsx`
  // é um Suspense boundary: o corpo já começou a ser transmitido quando o
  // `notFound()` roda, e o status não muda depois disso. O Next injeta
  // `<meta name="robots" content="noindex">` no HTML da página de erro, que é
  // o que impede a indexação — ver docs de `loading.tsx`, "Status codes".
  if (!isCategory(slug)) notFound()

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Periféricos", item: "/perifericos" },
          { name: CATEGORY_PLURAL_LABELS[slug], item: categoryPath(slug) },
        ]}
      />
      <PerifericosCategoryView category={slug} />
    </>
  )
}
