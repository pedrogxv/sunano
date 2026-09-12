import type { Metadata } from "next"
import { notFound, permanentRedirect } from "next/navigation"

import { getPublishedPostBySlug } from "@/lib/server/repositories/blog-repository"
import { BlogPostContent, type BlogPost } from "./blog-post-content"
import { ArticleJsonLd, BreadcrumbJsonLd } from "@/components/seo/JsonLd"
import { profilePath } from "@/lib/profile-name"
import { buildDescription, buildMetadata } from "@/lib/seo"


// ISR: o post é renderizado no servidor e revalidado em background,
// eliminando o fetch client-side (que mostrava um spinner a cada visita).
export const revalidate = 120

/**
 * Resolve o post exigindo que ele seja do tipo desta rota.
 *
 * `/blog` e `/noticias` resolvem pelo mesmo `getPublishedPostBySlug`, então
 * sem esta checagem `/blog/<slug-de-noticia>` respondia 200 com o conteúdo da
 * notícia — uma duplicata rastreável cujo canonical apontava para outro lugar.
 * Posts antigos sem `post_type` (migração legada) continuam abrindo no blog,
 * que é onde estavam antes da separação.
 */
async function getReviewPost(slug: string): Promise<BlogPost | null> {
  const post = (await getPublishedPostBySlug(slug)) as BlogPost | null
  if (!post) return null
  if (post.post_type === "news") return null
  return post
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = await getReviewPost(slug)
  // `noIndex` para o Google não guardar a página de erro como resultado
  // válido enquanto o `notFound()` não devolve o 404 de verdade.
  if (!post) return buildMetadata({
    title: "Artigo não encontrado",
    description: "O artigo que você procura não está mais disponível no blog da Sunano.",
    path: `/blog/${slug}`,
    noIndex: true,
  })

  return buildMetadata({
    title: post.title,
    titleSuffix: " | Blog Sunano",
    // O conteúdo é markdown: sem `buildDescription` o corte cru levava `##` e
    // `**` pro preview. O complemento entra só se o excerpt for curto demais.
    description: buildDescription(post.excerpt, post.content, {
      context: "Review e análise no blog da Sunano.",
    }),
    path: `/blog/${post.slug}`,
    type: "article",
    eyebrow: "Blog",
    image: post.cover_image_url,
    imageVariant: "cover",
    publishedTime: post.created_at,
    modifiedTime: post.updated_at ?? post.created_at,
    authors: post.admin_profiles?.display_name ? [post.admin_profiles.display_name] : undefined,
  })
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = await getReviewPost(slug)

  // Notícia acessada pela URL antiga de blog: até o commit 8325a2c o sitemap
  // anunciava TODA notícia como `/blog/<slug>`, então o Google guardou essas
  // URLs e hoje elas batem em 404 ("O URL não está disponível para o Google").
  // O conteúdo existe — só mudou de rota —, então o certo é 301 para a URL
  // canônica em vez de 404: preserva o sinal que a URL antiga acumulou e
  // transfere para `/noticias/<slug>`.
  if (!post) {
    const anyPost = (await getPublishedPostBySlug(slug)) as BlogPost | null
    if (anyPost?.post_type === "news") permanentRedirect(`/noticias/${anyPost.slug}`)
  }

  // 404 de verdade em vez do "não encontrado" renderizado com status 200: o
  // soft-404 fazia o Google indexar a página de erro como conteúdo válido.
  if (!post) notFound()

  return (
    <>
      <ArticleJsonLd
        type="BlogPosting"
        headline={post.title}
        description={buildDescription(post.excerpt, post.content, {
          context: "Review e análise no blog da Sunano.",
        })}
        path={`/blog/${post.slug}`}
        image={post.cover_image_url}
        datePublished={post.created_at}
        dateModified={post.updated_at ?? post.created_at}
        authorName={post.admin_profiles?.display_name}
        authorPath={post.author_profile?.display_slug ? profilePath(post.author_profile.display_slug) : null}
      />
      <BreadcrumbJsonLd
        items={[
          { name: "Blog", item: "/blog" },
          { name: post.title, item: `/blog/${post.slug}` },
        ]}
      />
      <BlogPostContent post={post} />
    </>
  )
}
