import { getPublishedPostBySlug } from "@/lib/server/repositories/blog-repository"
import { BlogPostContent, type BlogPost } from "./blog-post-content"

// ISR: o post é renderizado no servidor e revalidado em background,
// eliminando o fetch client-side (que mostrava um spinner a cada visita).
export const revalidate = 30

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = (await getPublishedPostBySlug(slug)) as BlogPost | null

  return <BlogPostContent post={post} />
}
