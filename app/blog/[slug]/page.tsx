import type { Metadata } from "next"

import { getPublishedPostBySlug } from "@/lib/server/repositories/blog-repository"
import { BlogPostContent, type BlogPost } from "./blog-post-content"
import { SITE_URL } from "@/lib/site-url"


// ISR: o post é renderizado no servidor e revalidado em background,
// eliminando o fetch client-side (que mostrava um spinner a cada visita).
export const revalidate = 30

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = (await getPublishedPostBySlug(slug)) as BlogPost | null
  if (!post) return { title: "Artigo não encontrado | Blog Sunano" }

  const title = `${post.title} | Blog Sunano`
  const description = post.excerpt ?? post.content.slice(0, 160)
  const url = `${SITE_URL}/blog/${post.slug}`

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "article",
      publishedTime: post.created_at,
      images: post.cover_image_url ? [{ url: post.cover_image_url }] : undefined,
    },
    twitter: {
      card: post.cover_image_url ? "summary_large_image" : "summary",
      title,
      description,
      images: post.cover_image_url ? [post.cover_image_url] : undefined,
    },
  }
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
