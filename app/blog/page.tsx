import { listPublishedPosts } from "@/lib/server/repositories/blog-repository"
import { BlogContent, type BlogPost } from "./blog-content"

// ISR: os posts são renderizados no servidor e revalidados em background,
// eliminando o fetch client-side (que mostrava um spinner a cada visita).
export const revalidate = 30

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ peripheral?: string }>
}) {
  const { peripheral } = await searchParams
  const posts = (await listPublishedPosts(peripheral?.trim() || null)) as BlogPost[]

  return <BlogContent initialPosts={posts} />
}
