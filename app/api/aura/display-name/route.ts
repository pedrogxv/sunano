import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { DISPLAY_NAME_MAX_LENGTH } from "@/lib/profile-name"
import { getUserAuraBalance } from "@/lib/server/repositories/aura-repository"
import {
  changeDisplayNameWithAura,
  getDisplayNameCooldown,
} from "@/lib/server/repositories/aura-store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const bodySchema = z.object({
  name: z.string().trim().min(1).max(DISPLAY_NAME_MAX_LENGTH),
})

/** GET /api/aura/display-name — saldo de Aura e cooldown de troca, para o modal se preparar ao abrir. */
export async function GET(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const [balance, cooldown] = await Promise.all([
    getUserAuraBalance(user.id),
    getDisplayNameCooldown(user.id),
  ])

  return NextResponse.json({ ok: true, balance, cooldown })
}

/** POST /api/aura/display-name — troca o nome de exibição pagando 100 de Aura, sujeito a cooldown de 3 dias. */
export async function POST(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: "Nome inválido." }, { status: 400 })
  }

  const result = await changeDisplayNameWithAura(user.id, parsed.data.name)

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, code: result.code, cooldownEndsAt: result.cooldownEndsAt ?? null },
      { status: result.status }
    )
  }

  return NextResponse.json({ ok: true, displayName: result.displayName, displaySlug: result.displaySlug })
}
