import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import { createForumReport } from "@/lib/server/repositories/forum-repository"

const reportSchema = z.object({
  targetType: z.enum(["post", "comment"]),
  postSlug: z.string().trim().min(1),
  commentId: z.string().uuid().nullable().optional(),
})

export async function POST(request: NextRequest) {
  try {
    const user = await getRequestUser(request)
    if (!user) {
      return NextResponse.json({ error: "Você precisa estar logado para denunciar." }, { status: 401 })
    }

    const parsed = reportSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
        { status: 400 }
      )
    }

    const rateLimit = await checkRateLimit({
      action: "forum_report_create",
      identifier: user.id,
      maxAttempts: 10,
      windowSeconds: 3600,
    })
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Você denunciou muitas vezes recentemente. Tente novamente mais tarde." },
        { status: 429 }
      )
    }

    const result = await createForumReport({
      targetType: parsed.data.targetType,
      postSlug: parsed.data.postSlug,
      commentId: parsed.data.commentId ?? null,
      reporterUserId: user.id,
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao enviar denúncia." }, { status: 500 })
  }
}
