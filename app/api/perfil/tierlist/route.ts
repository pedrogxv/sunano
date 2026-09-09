import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { requireVipUser } from "@/lib/server/require-vip-user"
import { upsertTierlistItem, removeTierlistItem } from "@/lib/server/repositories/user-tierlist-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const upsertSchema = z.object({
  peripheralId: z.string().uuid(),
  tierId: z.string().uuid(),
  position: z.number().int().min(0).max(9999),
})

const removeSchema = z.object({
  peripheralId: z.string().uuid(),
})

/** POST — adiciona/move um item na tierlist pessoal. */
export async function POST(request: NextRequest) {
  const auth = await requireVipUser(request)
  if (auth.error) return auth.error

  const rawBody = await request.json().catch(() => null)
  const parsed = upsertSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    await upsertTierlistItem(auth.userId, parsed.data.peripheralId, parsed.data.tierId, parsed.data.position)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[perfil/tierlist] upsert:", err)
    return NextResponse.json({ error: "Não foi possível salvar o item." }, { status: 500 })
  }
}

/** DELETE — remove um item da tierlist pessoal. */
export async function DELETE(request: NextRequest) {
  const auth = await requireVipUser(request)
  if (auth.error) return auth.error

  const rawBody = await request.json().catch(() => null)
  const parsed = removeSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    await removeTierlistItem(auth.userId, parsed.data.peripheralId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[perfil/tierlist] remove:", err)
    return NextResponse.json({ error: "Não foi possível remover o item." }, { status: 500 })
  }
}
