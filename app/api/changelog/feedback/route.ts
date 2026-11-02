import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { CHANGELOG_REACTION_KEYS, EMPTY_FEEDBACK } from "@/lib/changelog-feedback"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { checkRateLimit } from "@/lib/server/rate-limit"
import {
  getChangelogFeedback,
  isKnownChangelogKey,
  setChangelogReaction,
  setChangelogVote,
} from "@/lib/server/repositories/changelog-feedback-repository"

export const dynamic = "force-dynamic"

// A resposta muda por pessoa (o que ELA marcou): nunca em cache compartilhado.
const PRIVATE = { "Cache-Control": "private, no-store" }

/** Totais de todas as versões + as marcações de quem está logado (se estiver). */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  try {
    const entries = await getChangelogFeedback(user?.id ?? null)
    return NextResponse.json({ entries, signedIn: !!user }, { headers: PRIVATE })
  } catch (error) {
    console.error("[api/changelog/feedback] GET:", error)
    return NextResponse.json({ error: "Não foi possível carregar as reações." }, { status: 500, headers: PRIVATE })
  }
}

// Estado desejado, não toggle: o cliente manda como quer que fique.
const bodySchema = z.union([
  z.object({ entry: z.string().max(64), vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }),
  z.object({ entry: z.string().max(64), reaction: z.enum(CHANGELOG_REACTION_KEYS), active: z.boolean() }),
])

export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Entre na sua conta para reagir.", code: "unauthenticated" }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !isKnownChangelogKey(parsed.data.entry)) {
    return NextResponse.json({ error: "Dados inválidos.", code: "invalid_body" }, { status: 400 })
  }

  // Balde por CONTA, não por IP+navegador: o voto é da pessoa, e trocar o
  // User-Agent não pode render um balde novo.
  const rateLimit = await checkRateLimit({
    action: "changelog_feedback",
    identifier: `user:${user.id}`,
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Calma aí, tente de novo em instantes.", code: "rate_limited" }, { status: 429 })
  }

  const body = parsed.data
  try {
    if ("vote" in body) await setChangelogVote(user.id, body.entry, body.vote)
    else await setChangelogReaction(user.id, body.entry, body.reaction, body.active)

    // Devolve a versão inteira atualizada: o cliente troca o otimista pelos
    // números reais, que incluem o que outras pessoas fizeram no meio-tempo.
    const entries = await getChangelogFeedback(user.id)
    return NextResponse.json({ entry: body.entry, feedback: entries[body.entry] ?? EMPTY_FEEDBACK }, { headers: PRIVATE })
  } catch (error) {
    console.error("[api/changelog/feedback] POST:", error)
    return NextResponse.json({ error: "Não foi possível salvar. Tente de novo." }, { status: 500 })
  }
}
