import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { listSavedPosts } from "@/lib/server/repositories/forum-saved-posts-repository"

export const dynamic = "force-dynamic"

/** Lista paginada (numerada) dos posts salvos do usuário atual. Usada pela navegação de página em /forum/salvos. */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado.", code: "unauthenticated" }, { status: 401 })
  }

  const url = new URL(request.url)
  const pageParam = Number(url.searchParams.get("page") ?? "1")
  const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1

  const { posts, total, totalPages } = await listSavedPosts(user.id, page)
  return NextResponse.json({ ok: true, posts, total, totalPages })
}
