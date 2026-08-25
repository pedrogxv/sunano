import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { togglePeripheralReviewVote } from "@/lib/server/repositories/peripheral-reviews-repository"

const voteSchema = z.object({
  kind: z.enum(["like", "dislike"]),
})

/** Dá, troca ou remove (toggle) o upvote/downvote do usuário atual numa review — estilo Reddit. */
export async function POST(request: NextRequest, context: { params: Promise<{ reviewId: string }> }) {
  const { reviewId } = await context.params

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado para votar.", code: "unauthenticated" }, { status: 401 })
  }

  const parsed = voteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos.", code: "invalid_body" },
      { status: 400 }
    )
  }

  const rateLimit = await checkRateLimit({
    action: "peripheral_review_vote",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de votar novamente.", code: "rate_limited" }, { status: 429 })
  }

  const result = await togglePeripheralReviewVote(user.id, reviewId, parsed.data.kind)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, reaction: result.reaction, score: result.score })
}
