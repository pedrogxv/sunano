import { NextResponse } from "next/server"

import {
  getPublishedPostBySlug,
  listRelatedPosts,
} from "@/lib/server/repositories/blog-repository"

export const dynamic = "force-dynamic"

/** Endpoint público de detalhe de um post do blog, com notícias relacionadas. */
export async function GET(_request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params

  try {
    const post = await getPublishedPostBySlug(slug)
    if (!post) {
      return NextResponse.json({ error: "Artigo não encontrado." }, { status: 404 })
    }

    const related = await listRelatedPosts({
      slug,
      peripheralId: post.peripheral_id,
      category: post.peripherals?.[0]?.category ?? null,
      limit: 6,
    })

    return NextResponse.json({ ok: true, post, related })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar o artigo." }, { status: 500 })
  }
}
