import type { Metadata } from "next"
import { notFound } from "next/navigation"

import {
  getPublishedPostBySlug,
  listBlogComments,
  listRelatedPosts,
} from "@/lib/server/repositories/blog-repository"
import { NoticiasPostContent, type NewsPost } from "./noticias-post-content"
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd"
import { buildDescription, buildMetadata } from "@/lib/seo"

// ISR: post, relacionados e comentários são renderizados no servidor e
// revalidados em background, eliminando o fetch client-side (que mostrava
// um spinner a cada visita).
export const revalidate = 120

/** Descrição usada tanto no card social quanto no `description` do schema. */
function newsDescription(post: NewsPost) {
  return buildDescription(post.excerpt, post.content, {
    context: "Notícia do mundo dos periféricos, no Sunano.",
  })
}

/**
 * Resolve a notícia exigindo que ela seja do tipo desta rota.
 *
 * `/blog` e `/noticias` compartilham `getPublishedPostBySlug`, então sem esta
 * checagem `/noticias/<slug-de-review>` respondia 200 com o artigo do blog —
 * duplicata rastreável com canonical apontando para outro endereço.
 */
async function getNewsPost(slug: string): Promise<NewsPost | null> {
  const post = (await getPublishedPostBySlug(slug)) as NewsPost | null
  if (!post) return null
  if (post.post_type && post.post_type !== "news") return null
  return post
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getNewsPost(slug)
  // `noIndex` para o Google não guardar a página de erro como resultado
  // válido enquanto o `notFound()` não devolve o 404 de verdade.
  if (!post) return buildMetadata({
    title: "Notícia não encontrada",
    description: "A notícia que você procura não está mais disponível no Sunano.",
    path: `/noticias/${slug}`,
    noIndex: true,
  })

  // Sem `generateMetadata` a notícia caía no card genérico do layout raiz —
  // toda matéria compartilhada saía com o mesmo título e a mesma imagem.
  return buildMetadata({
    title: post.title,
    titleSuffix: " | Notícias Sunano",
    description: newsDescription(post),
    path: `/noticias/${post.slug}`,
    type: "article",
    eyebrow: "Notícias",
    image: post.cover_image_url,
    imageVariant: "cover",
    publishedTime: post.created_at,
    modifiedTime: post.updated_at ?? post.created_at,
  })
}

export default async function NoticiasSlugPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getNewsPost(slug)

  // 404 de verdade em vez do "não encontrado" renderizado com status 200: o
  // soft-404 fazia o Google indexar a página de erro como conteúdo válido.
  if (!post) notFound()

  const [related, commentsPage] = await Promise.all([
    listRelatedPosts({
      slug,
      peripheralId: post.peripheral_id ?? null,
      category: post.peripherals?.[0]?.category ?? null,
      limit: 6,
    }),
    listBlogComments(slug),
  ])

  return (
    <>
      <ArticleJsonLd
        type="NewsArticle"
        headline={post.title}
        description={newsDescription(post)}
        path={`/noticias/${post.slug}`}
        image={post.cover_image_url}
        datePublished={post.created_at}
        dateModified={post.updated_at ?? post.created_at}
        authorName={post.admin_profiles?.display_name}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Notícias", item: "/noticias" },
          { name: post.title, item: `/noticias/${post.slug}` },
        ]}
      />
      <NoticiasPostContent
        post={post as unknown as NewsPost}
        related={related}
        initialComments={commentsPage.comments}
        initialHasMore={commentsPage.hasMore}
      />
    </>
  )
}
