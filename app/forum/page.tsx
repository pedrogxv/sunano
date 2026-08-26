import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import { listForumPosts } from "@/lib/server/repositories/forum-repository"
import {
  getForumModeratorProfiles,
  getMostActiveProfiles,
} from "@/lib/server/repositories/users-repository"
import { ForumContent, type ForumPost } from "./forum-content"

// ISR: os posts da aba padrão ("recent") são renderizados no servidor,
// eliminando o spinner que aparecia a cada visita enquanto o client
// buscava os dados via /api/forum/posts.
export const revalidate = 120

export const metadata: Metadata = buildMetadata({
  title: "Fórum",
  socialTitle: "Fórum: a comunidade de periféricos",
  description: "Discussões, dúvidas e opiniões da comunidade sobre mouses, teclados, headsets e outros periféricos gamers.",
  path: "/forum",
  eyebrow: "Fórum",
  subtitle: "Discussões da comunidade",
})

export default async function ForumPage() {
  const [{ posts: initialPosts, hasMore: initialHasMore }, topActive, moderators] = await Promise.all([
    listForumPosts({ tab: "recent", page: 1 }),
    getMostActiveProfiles(3),
    getForumModeratorProfiles(),
  ])

  return (
    <ForumContent
      initialPosts={initialPosts as ForumPost[]}
      initialHasMore={initialHasMore}
      topActive={topActive}
      moderators={moderators}
    />
  )
}
