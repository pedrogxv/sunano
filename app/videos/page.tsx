import type { Metadata } from "next"

import { VideosFeedContent } from "@/components/videos/videos-feed-content"

export const revalidate = 300

// Sem metadata própria a página herdava título e canonical da home, e o
// Google tratava as duas URLs como a mesma coisa.
export const metadata: Metadata = {
  title: "Vídeos",
  description: "Reviews, unboxings e testes de periféricos gamers em vídeo, direto do canal da Sunano.",
  alternates: { canonical: "/videos" },
  openGraph: {
    title: "Vídeos Sunano",
    description: "Reviews, unboxings e testes de periféricos gamers em vídeo, direto do canal da Sunano.",
    url: "/videos",
    type: "website",
  },
}

export default async function VideosPage() {
  return <VideosFeedContent />
}
