import type { Metadata } from "next"
import { buildMetadata } from "@/lib/seo"

import { VideosFeedContent } from "@/components/videos/videos-feed-content"

export const revalidate = 300

// Sem metadata própria a página herdava título e canonical da home, e o
// Google tratava as duas URLs como a mesma coisa.
export const metadata: Metadata = buildMetadata({
  title: "Vídeos",
  socialTitle: "Vídeos: reviews e unboxings no YouTube",
  description: "Reviews, unboxings e testes de periféricos gamers em vídeo, direto do canal da Sunano no YouTube, com veredito no final.",
  path: "/videos",
  eyebrow: "Vídeos",
  subtitle: "Reviews e unboxings do canal",
})

export default async function VideosPage() {
  return <VideosFeedContent />
}
