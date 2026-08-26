import type { Metadata } from "next"

import {
  getPublishedPostBySlug,
  listBlogComments,
  listRelatedPosts,
} from "@/lib/server/repositories/blog-repository"
import { NoticiasPostContent, type NewsPost } from "./noticias-post-content"
import { buildDescription, buildMetadata } from "@/lib/seo"

// ISR: post, relacionados e comentários são renderizados no servidor e
// revalidados em background, eliminando o fetch client-side (que mostrava
// um spinner a cada visita).
export const revalidate = 120

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = (await getPublishedPostBySlug(slug)) as NewsPost | null
  if (!post) return { title: "Notícia não encontrada" }

  // Sem `generateMetadata` a notícia caía no card genérico do layout raiz —
  // toda matéria compartilhada saía com o mesmo título e a mesma imagem.
  return buildMetadata({
    title: post.title,
    titleSuffix: " | Notícias Sunano",
    description: buildDescription(post.excerpt, post.content, {
      context: "Notícia do mundo dos periféricos, no Sunano.",
    }),
    path: `/noticias/${post.slug}`,
    type: "article",
    eyebrow: "Notícias",
    image: post.cover_image_url,
    imageVariant: "cover",
    publishedTime: post.created_at,
  })
}

export default async function NoticiasSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getPublishedPostBySlug(slug)

  if (!post) {
    return (
      <NoticiasPostContent post={null} related={[]} initialComments={[]} initialHasMore={false} />
    )
  }

  const [related, commentsPage] = await Promise.all([
    listRelatedPosts({
      slug,
      peripheralId: post.peripheral_id,
      category: post.peripherals?.[0]?.category ?? null,
      limit: 6,
    }),
    listBlogComments(slug),
  ])

  return (
    <NoticiasPostContent
      post={post as unknown as NewsPost}
      related={related}
      initialComments={commentsPage.comments}
      initialHasMore={commentsPage.hasMore}
    />
  )
}
