import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getUserAuraGiven } from "@/lib/server/repositories/aura-repository"

export const dynamic = "force-dynamic"

/**
 * Retorna quais das notícias/comentários informados (`?postIds=a,b&commentIds=c,d`)
 * o usuário autenticado já curtiu/descurtiu — usado para hidratar o estado
 * inicial do `AuraButton` na página de notícia. Espelha `/api/forum/aura`.
 */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    const empty = { liked: [] as string[], disliked: [] as string[] }
    return NextResponse.json({ ok: true, posts: empty, comments: empty })
  }

  const { searchParams } = new URL(request.url)
  const postIds = (searchParams.get("postIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean)
  const commentIds = (searchParams.get("commentIds") ?? "").split(",").map((id) => id.trim()).filter(Boolean)

  const { blogPosts, blogComments } = await getUserAuraGiven(user.id, {
    postIds: [],
    commentIds: [],
    blogPostIds: postIds,
    blogCommentIds: commentIds,
  })
  return NextResponse.json({
    ok: true,
    posts: { liked: [...blogPosts.liked], disliked: [...blogPosts.disliked] },
    comments: { liked: [...blogComments.liked], disliked: [...blogComments.disliked] },
  })
}
