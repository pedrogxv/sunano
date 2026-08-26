import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getForumPostsByCategorySlug } from "@/lib/server/repositories/forum-repository"
import type { PostCardData } from "@/components/forum/PostCard"
import { CategoryPostsList } from "./category-posts-list"
import { buildMetadata } from "@/lib/seo"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { cn } from "@/lib/utils"


// ISR: página de categoria é conteúdo público e estável — vale a pena ficar
// indexável e cacheada, igual à listagem principal do fórum.
export const revalidate = 120

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const result = await getForumPostsByCategorySlug(slug)
  if (!result) return { title: "Categoria não encontrada" }

  const { category } = result
  const label = category.parent ? `${category.parent.name} — ${category.name}` : category.name

  return buildMetadata({
    title: `Discussões sobre ${label}`,
    titleSuffix: " | Fórum Sunano",
    description: `Tópicos, dúvidas e opiniões da comunidade sobre ${label}: quem já usou, o que vale a pena e o que evitar, no fórum da Sunano.`,
    path: `/forum/categoria/${category.slug}`,
    eyebrow: "Fórum",
    subtitle: `Discussões da comunidade sobre ${label}`,
  })
}

export default async function ForumCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const result = await getForumPostsByCategorySlug(slug)
  if (!result) notFound()

  const { category, posts, hasMore } = result
  const label = category.parent ? `${category.parent.name} — ${category.name}` : category.name

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-2 py-8 sm:px-4 md:px-6">
      <Link
        href="/forum"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar ao fórum
      </Link>

      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          {label}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Tópicos da comunidade sobre {label.toLowerCase()}.
        </p>
      </div>

      {posts.length === 0 ? (
        <div className={cn("rounded-2xl p-12 text-center", CARD_SURFACE)}>
          <p className="text-sm text-muted-foreground">Nenhum tópico em {label} ainda.</p>
        </div>
      ) : (
        <CategoryPostsList
          categorySlug={category.slug}
          initialPosts={posts as PostCardData[]}
          initialHasMore={hasMore}
        />
      )}
    </div>
  )
}
