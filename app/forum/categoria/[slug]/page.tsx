import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { getForumPostsByCategorySlug } from "@/lib/server/repositories/forum-repository"
import { PostCard, type PostCardData } from "@/components/forum/PostCard"

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://sunano.com.br"

// ISR: página de categoria é conteúdo público e estável — vale a pena ficar
// indexável e cacheada, igual à listagem principal do fórum.
export const revalidate = 30

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const result = await getForumPostsByCategorySlug(slug)
  if (!result) return { title: "Categoria não encontrada | Fórum Sunano" }

  const { category } = result
  const label = category.parent ? `${category.parent.name} — ${category.name}` : category.name
  const title = `Discussões sobre ${label} | Fórum Sunano`
  const description = `Veja tópicos, dúvidas e opiniões da comunidade sobre ${label} no fórum da Sunano.`
  const url = `${SITE_URL}/forum/categoria/${category.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
  }
}

export default async function ForumCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const result = await getForumPostsByCategorySlug(slug)
  if (!result) notFound()

  const { category, posts } = result
  const label = category.parent ? `${category.parent.name} — ${category.name}` : category.name

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8 md:px-6">
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
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">Nenhum tópico em {label} ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <PostCard key={post.id} post={post as PostCardData} />
          ))}
        </div>
      )}
    </div>
  )
}
