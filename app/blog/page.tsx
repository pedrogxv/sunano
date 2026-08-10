import type { Metadata } from "next"

import { listPublishedPosts } from "@/lib/server/repositories/blog-repository"
import { BlogContent, type BlogPost } from "./blog-content"

// ISR: os posts são renderizados no servidor e revalidados em background,
// eliminando o fetch client-side (que mostrava um spinner a cada visita).
export const revalidate = 30

export const metadata: Metadata = {
  // Sem o sufixo "| Sunano": o `title.template` do layout raiz já o acrescenta,
  // e repetir aqui gerava "Blog | Sunano | Sunano" na SERP.
  title: "Blog",
  description: "Reviews, comparativos e novidades sobre periféricos gamers: mouses, teclados, headsets e mais.",
  alternates: { canonical: "/blog" },
  openGraph: {
    title: "Blog Sunano",
    description: "Reviews, comparativos e novidades sobre periféricos gamers: mouses, teclados, headsets e mais.",
    url: "/blog",
    type: "website",
  },
}

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
