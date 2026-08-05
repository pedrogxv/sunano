import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { toggleAura, type ReactionKind } from "@/lib/server/repositories/aura-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/** Dá, troca ou remove (toggle) a reação (like/dislike) do usuário atual num comentário. */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; commentId: string }> }
) {
  const { commentId } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado para reagir.", code: "unauthenticated" }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const kind: ReactionKind = body?.kind === "dislike" ? "dislike" : "like"

  const rateLimit = await checkRateLimit({
    action: "forum_aura",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de reagir novamente.", code: "rate_limited" }, { status: 429 })
  }

  const db = createSupabaseAdminClient()
  const { data: comment } = await db
    .from("forum_comments")
    .select("id, is_hidden")
    .eq("id", commentId)
    .maybeSingle()

  if (!comment || comment.is_hidden) {
    return NextResponse.json({ error: "Comentário não encontrado.", code: "not_found" }, { status: 404 })
  }

  const result = await toggleAura({ giverId: user.id, targetType: "comment", targetId: comment.id, kind })
  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: result.status })
  }
  return NextResponse.json({ ok: true, reaction: result.reaction, aura_count: result.auraCount })
}
