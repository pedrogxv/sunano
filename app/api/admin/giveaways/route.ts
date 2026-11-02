import { NextRequest, NextResponse } from "next/server"

import { dbErrorResponse } from "@/lib/db-errors"
import type { GiveawayRarity } from "@/lib/giveaways"
import { requireWebMaster } from "@/lib/server/auth/admin-auth"
import { createGiveaway, listAdminGiveaways } from "@/lib/server/repositories/giveaways-repository"

import { giveawayPayload } from "./schema"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Sorteios no painel. Só WEB MASTER enquanto a feature está em lançamento
 * (flag `giveaways`): abrir para outro cargo é trocar o guard daqui e da
 * rota `[id]`, não criar permissão nova às pressas.
 */
export async function GET() {
  const guard = await requireWebMaster()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  try {
    return NextResponse.json({ giveaways: await listAdminGiveaways() })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao carregar sorteios.")
    return NextResponse.json(body, { status })
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireWebMaster()
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status })

  const parsed = giveawayPayload.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    const result = await createGiveaway(
      { ...parsed.data, rarity: parsed.data.rarity as GiveawayRarity },
      guard.profile.id
    )
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (error) {
    const { body, status } = dbErrorResponse(error, "Erro ao criar sorteio.")
    return NextResponse.json(body, { status })
  }
}
