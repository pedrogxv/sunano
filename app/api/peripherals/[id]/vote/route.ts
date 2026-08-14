import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { peripheralsExist } from "@/lib/server/repositories/peripherals-repository"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"
import { getPeripheralVoteState, togglePeripheralVote, type ReactionKind } from "@/lib/server/repositories/aura-repository"

export const dynamic = "force-dynamic"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Contagem de votos "BOM OU BAGRE" + reação do usuário atual (se logado) — hidrata a caixa na página do periférico. */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Periférico inválido." }, { status: 400 })
  }

  const user = await getRequestUser(request)
  const state = await getPeripheralVoteState(id, user?.id ?? null)
  return NextResponse.json({ ok: true, ...state })
}

/** Dá, troca ou remove (toggle) o voto "BOM OU BAGRE" do usuário atual num periférico. */
export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Periférico inválido." }, { status: 400 })
  }

  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Você precisa estar logado para votar." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const kind: ReactionKind = body?.kind === "dislike" ? "dislike" : "like"

  const rateLimit = await checkRateLimit({
    action: "peripheral_vote",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Aguarde um pouco antes de votar novamente." }, { status: 429 })
  }

  const exists = await peripheralsExist([id])
  if (!exists) {
    return NextResponse.json({ error: "Periférico não encontrado." }, { status: 404 })
  }

  const result = await togglePeripheralVote(user.id, id, kind)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true, reaction: result.reaction, likes: result.likes, dislikes: result.dislikes })
}
