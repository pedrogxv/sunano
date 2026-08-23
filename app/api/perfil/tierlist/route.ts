import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { isVipActive } from "@/lib/account-tier"
import { upsertTierlistItem, removeTierlistItem } from "@/lib/server/repositories/user-tierlist-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const tierSchema = z.enum(["S", "A", "B", "C", "D"])

const upsertSchema = z.object({
  peripheralId: z.string().uuid(),
  tier: tierSchema,
  position: z.number().int().min(0).max(9999),
})

const removeSchema = z.object({
  peripheralId: z.string().uuid(),
})

async function requireVipUser(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return { error: NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 }) }

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("account_tier, vip_expires_at")
    .eq("id", user.id)
    .maybeSingle()

  if (!isVipActive(profile?.account_tier, profile?.vip_expires_at)) {
    return { error: NextResponse.json({ error: "Recurso exclusivo VIP." }, { status: 403 }) }
  }

  return { userId: user.id }
}

/** POST — adiciona/move um item na tierlist pessoal. Defesa em profundidade: a RLS já bloqueia não-VIP, isto barra antes de tentar. */
export async function POST(request: NextRequest) {
  const auth = await requireVipUser(request)
  if (auth.error) return auth.error

  const rawBody = await request.json().catch(() => null)
  const parsed = upsertSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  try {
    await upsertTierlistItem(auth.userId, parsed.data.peripheralId, parsed.data.tier, parsed.data.position)
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
