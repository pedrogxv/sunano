import { NextRequest, NextResponse } from "next/server"

import { dbErrorResponse } from "@/lib/db-errors"
import type { GiveawayRarity } from "@/lib/giveaways"
import { requireWebMaster } from "@/lib/server/auth/admin-auth"
import { deleteGiveaway, updateGiveaway } from "@/lib/server/repositories/giveaways-repository"

import { giveawayPayload, UUID_RE } from "../schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireWebMaster()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Sorteio inválido." }, { status: 400 })

  const parsed = giveawayPayload.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    const result = await updateGiveaway(id, { ...parsed.data, rarity: parsed.data.rarity as GiveawayRarity })
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao salvar sorteio.")
    return NextResponse.json(body, { status })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireWebMaster()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const { id } = await params
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "Sorteio inválido." }, { status: 400 })

  try {
    const result = await deleteGiveaway(id)
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao apagar sorteio.")
    return NextResponse.json(body, { status })
  }
}
