import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import { listPublishedPosts } from "@/lib/server/repositories/blog-repository"
import { BlogContent, type BlogPost } from "./blog-content"

// ISR: os posts são renderizados no servidor e revalidados em background,
// eliminando o fetch client-side (que mostrava um spinner a cada visita).
export const revalidate = 120

export const metadata: Metadata = buildMetadata({
  title: "Blog",
  socialTitle: "Blog: reviews e comparativos de periféricos",
  description: "Reviews, comparativos e novidades sobre periféricos gamers: mouses, teclados, headsets e mais, testados pelo Sunano.",
  path: "/blog",
  eyebrow: "Blog",
  subtitle: "Reviews e comparativos de periféricos",
})

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ peripheral?: string }>
}) {
  const { peripheral } = await searchParams
  // "Guias" mostra só reviews — posts do tipo "news" pertencem a /noticias.
  const posts = (await listPublishedPosts(peripheral?.trim() || null, "review")) as BlogPost[]

  return <BlogContent initialPosts={posts} />
}
