import {
  getPublishedPostBySlug,
  listBlogComments,
  listRelatedPosts,
} from "@/lib/server/repositories/blog-repository"
import { NoticiasPostContent, type NewsPost } from "./noticias-post-content"

// ISR: post, relacionados e comentários são renderizados no servidor e
// revalidados em background, eliminando o fetch client-side (que mostrava
// um spinner a cada visita).
export const revalidate = 120

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
