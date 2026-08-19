import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { getUserSavedPostState, toggleSavedPost } from "@/lib/server/repositories/forum-saved-posts-repository"

export const dynamic = "force-dynamic"

/** Se o usuário atual já salvou este post — hidrata o estado inicial do botão no card. */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ ok: true, saved: false })
  }

  const saved = await getUserSavedPostState(user.id, slug)
  return NextResponse.json({ ok: true, saved })
}

/** Salva ou remove (toggle) um post da lista de salvos do usuário atual. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> }
) {
  const { slug } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado para salvar.", code: "unauthenticated" }, { status: 401 })
  }

  const rateLimit = await checkRateLimit({
    action: "forum_post_save",
    identifier: user.id,
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de tentar de novo.", code: "rate_limited" }, { status: 429 })
  }

  const result = await toggleSavedPost(user.id, slug)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, saved: result.saved, savedCount: result.savedCount })
}
