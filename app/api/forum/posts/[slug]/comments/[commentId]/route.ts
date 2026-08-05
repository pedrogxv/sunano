import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { updateForumComment } from "@/lib/server/repositories/forum-repository"

// Mesmos limites do POST de criação — o texto editado passa pelas mesmas
// regras do original, senão dava pra escapar do mínimo/máximo editando depois.
const editSchema = z.object({
  body: z.string().trim().min(4).max(2000),
})

/** Edita o próprio comentário, dentro da janela de 15 minutos (conferida no repositório). */
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ slug: string; commentId: string }> }
) {
  const { slug, commentId } = await context.params

  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para editar." }, { status: 401 })
    }

    const parsed = editSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const rateLimit = await checkRateLimit({
      action: "forum_comment_edit",
      identifier: user.id,
      maxAttempts: 30,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você editou comentários muitas vezes recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const result = await updateForumComment({
      postSlug: slug,
      commentId,
      userId: user.id,
      body: parsed.data.body,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao editar comentário." }, { status: 500 })
  }
}
