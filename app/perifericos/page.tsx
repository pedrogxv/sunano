import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import { CATEGORY_PLURAL_LABELS, isCategory, type Category } from "@/lib/tag-options"
import { PerifericosCategoryView, categoryPath } from "./category-view"

export const revalidate = 60

/**
 * Listagem genérica e compatibilidade com `?category=`.
 *
 * A variante com query string continua servindo a mesma lista, mas o canonical
 * dela aponta para `/perifericos/categoria/<slug>`: o Google trata parâmetro
 * como candidato fraco a canonical, então as 12 variantes competiam entre si e
 * com a listagem genérica em vez de cada uma ranquear para o próprio termo
 * ("melhores teclados", "mousepads gamer"). Links já compartilhados continuam
 * funcionando e passam a consolidar sinal na rota canônica.
 */
interface PerifericosPageProps {
  searchParams: Promise<{ category?: string }>
}

const DEFAULT_CATEGORY: Category = "mouse"

export async function generateMetadata({ searchParams }: PerifericosPageProps): Promise<Metadata> {
  const { category } = await searchParams

  if (!isCategory(category)) {
    return buildMetadata({
      title: "Periféricos",
      socialTitle: "Periféricos: a wiki completa",
      description: "Wiki completa de periféricos gamers: mouses, teclados, headsets e mais, com ficha técnica, tier e reviews da comunidade.",
      path: "/perifericos",
      eyebrow: "Wiki",
      subtitle: "Ficha técnica, tier e reviews",
    })
  }

  const label = CATEGORY_PLURAL_LABELS[category]

  return buildMetadata({
    title: label,
    socialTitle: `${label}: ficha técnica e tier`,
    description: `Os melhores ${label.toLowerCase()} avaliados pela comunidade: ficha técnica, tier, ranking e reviews de quem usa. Compare antes de comprar.`,
    // Canonical na rota própria, não em `?category=`.
    path: categoryPath(category),
    eyebrow: "Wiki",
    subtitle: "Ficha técnica, tier e reviews",
  })
}

export default async function PerifericosPage({ searchParams }: PerifericosPageProps) {
  const { category: categoryParam } = await searchParams
  const category = isCategory(categoryParam) ? categoryParam : DEFAULT_CATEGORY

  return <PerifericosCategoryView category={category} />
}
