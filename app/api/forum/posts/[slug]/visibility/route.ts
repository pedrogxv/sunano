import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { setOwnForumPostHidden } from "@/lib/server/repositories/forum-repository"

const bodySchema = z.object({ hidden: z.boolean() })

/**
 * Oculta ou reativa o próprio post — a checagem de autoria acontece dentro
 * do repositório, contra o post no banco, nunca a partir do que o cliente alega.
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

    const parsed = bodySchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: "Dados inválidos." }, { status: 400 })
    }

    const rateLimit = await checkRateLimit({
      action: "forum_post_visibility",
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

    const result = await setOwnForumPostHidden({ postSlug: slug, userId: user.id, hidden: parsed.data.hidden })
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao alterar visibilidade do post." }, { status: 500 })
  }
}
