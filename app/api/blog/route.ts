import { NextRequest, NextResponse } from "next/server"

import { listPublishedPosts } from "@/lib/server/repositories/blog-repository"

export const revalidate = 120

/**
 * Endpoint público de listagem do blog.
 *
 * O componente cliente (`app/blog/page.tsx`) consome este endpoint em vez de
 * falar com o Supabase diretamente. A consulta vive no repositório.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const peripheral = searchParams.get("peripheral")?.trim() || null
  const typeParam = searchParams.get("type")
  const postType = typeParam === "news" || typeParam === "review" ? typeParam : null

  try {
    const posts = await listPublishedPosts(peripheral, postType)
    return NextResponse.json({ ok: true, posts })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar posts do blog." }, { status: 500 })
  }
}
