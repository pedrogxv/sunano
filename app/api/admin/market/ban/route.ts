import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { setMarketBan } from "@/lib/server/repositories/market-repository"

const banSchema = z.object({
  userId: z.string().uuid(),
  reason: z.string().trim().min(1).max(500),
})

const unbanSchema = z.object({
  userId: z.string().uuid(),
})

function getClientIp(request: NextRequest): string | null {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    null
  )
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "market_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const parsed = banSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const result = await setMarketBan(parsed.data.userId, parsed.data.reason, {
    actorId: auth.profile.id,
    ipAddress: getClientIp(request),
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "market_write")) {
    return NextResponse.json({ error: "Sem permissão." }, { status: 403 })
  }

  const parsed = unbanSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const result = await setMarketBan(parsed.data.userId, null, {
    actorId: auth.profile.id,
    ipAddress: getClientIp(request),
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ ok: true })
}
