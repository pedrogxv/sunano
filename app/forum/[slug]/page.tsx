import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getForumPostBySlug, getForumSidebarData } from "@/lib/server/repositories/forum-repository"
import { getProfileShowcase } from "@/lib/server/repositories/profile-showcase-repository"
import { createSupabaseServerClient } from "@/lib/server/supabase/server-client"
import { ForumPostContent } from "./forum-post-content"
import { buildDescription, buildMetadata, truncate } from "@/lib/seo"
import { SITE_URL } from "@/lib/site-url"


// ISR: o post e os comentários são renderizados no servidor — essencial para
// SEO, já que a busca por um periférico específico precisa encontrar o HTML
// da discussão, não um shell vazio esperando fetch client-side.
export const revalidate = 120

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const result = await getForumPostBySlug(slug, authData.user?.id ?? null)
  if (!result) return { title: "Post não encontrado" }

  const { post } = result
  const categoryName = post.category?.name
  const authorName = post.author_display_name || undefined

  return buildMetadata({
    title: post.title,
    titleSuffix: categoryName ? ` — ${categoryName} | Fórum` : " | Fórum Sunano",
    // O corpo é markdown: `buildDescription` limpa a marcação antes de cortar,
    // senão `##`/`**`/`![](...)` vazavam pro preview. O complemento entra só
    // quando o post é curto demais pra formar uma descrição informativa.
    description: buildDescription(post.body, post.title, {
      context: categoryName
        ? `Discussão sobre ${categoryName} no fórum da Sunano.`
        : "Discussão da comunidade no fórum da Sunano.",
      extraContext: "Veja as respostas da comunidade e participe.",
    }),
    path: `/forum/${post.slug}`,
    type: "article",
    eyebrow: categoryName ?? "Fórum",
    // Primeira imagem do post entra composta no card 1200×630; sem imagem, o
    // card tipográfico ainda sai completo.
    image: post.media_image_urls[0],
    imageVariant: "cover",
    publishedTime: post.created_at,
    authors: authorName ? [authorName] : undefined,
    // Oculto só é visível pro próprio dono (pra ele reativar) — não indexar.
    noIndex: post.is_hidden,
  })
}

export default async function ForumPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = await createSupabaseServerClient()
  const { data: authData } = await supabase.auth.getUser()
  const viewerId = authData.user?.id ?? null
  const result = await getForumPostBySlug(slug, viewerId)
  if (!result) notFound()

  const { post, comments, hasMoreComments } = result
  const url = `${SITE_URL}/forum/${post.slug}`
  const [sidebarData, authorProfile] = await Promise.all([
    getForumSidebarData({ postId: post.id, categoryId: post.category?.id ?? null }),
    post.user_id ? getProfileShowcase(post.user_id) : Promise.resolve(null),
  ])

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DiscussionForumPosting",
    "@id": url,
    headline: truncate(post.title, 110),
    text: post.body ?? post.title,
    url,
    datePublished: post.created_at,
    author: {
      "@type": "Person",
      name: post.author_display_name,
    },
    ...(post.category ? { about: post.category.name } : {}),
    ...(post.media_image_urls.length > 0 ? { image: post.media_image_urls } : {}),
    interactionStatistic: {
      "@type": "InteractionCounter",
      interactionType: "https://schema.org/CommentAction",
      userInteractionCount: post.comment_count,
    },
    comment: comments.slice(0, 20).map((c) => ({
      "@type": "Comment",
      text: c.body,
      dateCreated: c.created_at,
      author: { "@type": "Person", name: c.author_display_name },
    })),
  }

  return (
    <>
      {/* Post oculto só é renderizado pro próprio dono reativar — sem dado estruturado, não deve parecer indexável. */}
      {!post.is_hidden && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      )}
      <ForumPostContent
        post={post}
        initialComments={comments}
        initialHasMoreComments={hasMoreComments}
        sidebarData={sidebarData}
        authorProfile={authorProfile}
      />
    </>
  )
}
