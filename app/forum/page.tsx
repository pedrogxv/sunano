import type { Metadata } from "next"

import { listForumPosts } from "@/lib/server/repositories/forum-repository"
import { ForumContent, type ForumPost } from "./forum-content"

// ISR: os posts da aba padrão ("recent") são renderizados no servidor,
// eliminando o spinner que aparecia a cada visita enquanto o client
// buscava os dados via /api/forum/posts.
export const revalidate = 30

export const metadata: Metadata = {
  title: "Fórum | Sunano",
  description:
    "Discussões, dúvidas e opiniões da comunidade sobre mouses, teclados, headsets e outros periféricos gamers.",
  alternates: { canonical: "/forum" },
  openGraph: {
    title: "Fórum Sunano",
    description:
      "Discussões, dúvidas e opiniões da comunidade sobre mouses, teclados, headsets e outros periféricos gamers.",
    url: "/forum",
    type: "website",
  },
}

export default async function ForumPage() {
  const initialPosts = (await listForumPosts({ tab: "recent" })) as ForumPost[]

  return <ForumContent initialPosts={initialPosts} />
}
