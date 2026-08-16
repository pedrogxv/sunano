import { NextRequest, NextResponse } from "next/server"

import { listForumCommentsByUser } from "@/lib/server/repositories/forum-repository"

/**
 * Comentários de um autor específico — modal "Comentários" na vitrine
 * pública do perfil dele. Mesma regra de `tab=user` em `/api/forum/posts`:
 * não exige sessão, é a mesma listagem que qualquer visitante já vê
 * espalhada pelo fórum, só filtrada por autor.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url)
    const userId = url.searchParams.get("userId")
    if (!userId) {
      return NextResponse.json({ error: "Usuário não informado." }, { status: 400 })
    }
    const pageParam = Number(url.searchParams.get("page") ?? "1")
    const page = Number.isInteger(pageParam) && pageParam > 0 ? pageParam : 1

    const { comments, hasMore } = await listForumCommentsByUser(userId, page)
    return NextResponse.json({ ok: true, comments, hasMore })
  } catch {
    return NextResponse.json({ error: "Erro ao carregar comentários do usuário." }, { status: 500 })
  }
}
