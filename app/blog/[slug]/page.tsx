import type { Metadata } from "next"

import { getPublishedPostBySlug } from "@/lib/server/repositories/blog-repository"
import { BlogPostContent, type BlogPost } from "./blog-post-content"
import { buildDescription, buildMetadata } from "@/lib/seo"


// ISR: o post é renderizado no servidor e revalidado em background,
// eliminando o fetch client-side (que mostrava um spinner a cada visita).
export const revalidate = 120

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = (await getPublishedPostBySlug(slug)) as BlogPost | null
  if (!post) return { title: "Artigo não encontrado" }

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
    authors: post.admin_profiles?.display_name ? [post.admin_profiles.display_name] : undefined,
  })
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = (await getPublishedPostBySlug(slug)) as BlogPost | null

  return <BlogPostContent post={post} />
}
