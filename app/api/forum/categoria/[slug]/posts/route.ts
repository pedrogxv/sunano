import { NextRequest, NextResponse } from "next/server"

import { getForumPostsByCategorySlug } from "@/lib/server/repositories/forum-repository"

/** Páginas seguintes (load-more) de /forum/categoria/[slug] — a primeira página é SSR. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params
    const url = new URL(request.url)
    const pageParam = Number(url.searchParams.get("page") ?? "1")
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1

    const result = await getForumPostsByCategorySlug(slug, page)
    if (!result) return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 })

    return NextResponse.json({ ok: true, posts: result.posts, hasMore: result.hasMore })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar posts da categoria." }, { status: 500 })
  }
}
