import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { deleteOwnForumPost } from "@/lib/server/repositories/forum-repository"

/**
 * Exclui o próprio post — a checagem de autoria acontece dentro do
 * repositório, contra o post no banco, nunca a partir do que o cliente alega.
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })
    }

    const rateLimit = await checkRateLimit({
      action: "forum_post_delete",
      identifier: user.id,
      maxAttempts: 20,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Muitas tentativas recentes. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const result = await deleteOwnForumPost({ postSlug: slug, userId: user.id })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao excluir post." }, { status: 500 })
  }
}
