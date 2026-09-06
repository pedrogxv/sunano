import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { isVipActive } from "@/lib/account-tier"
import { checkContent, CONTENT_FILTER_MESSAGE } from "@/lib/content-filter"
import {
  saveUserTierlistNote,
  TIERLIST_NOTE_MAX_LENGTH,
} from "@/lib/server/repositories/user-tierlist-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const noteSchema = z.object({
  note: z
    .string()
    .max(TIERLIST_NOTE_MAX_LENGTH, `O recado pode ter no máximo ${TIERLIST_NOTE_MAX_LENGTH} caracteres.`)
    .nullable(),
})

/**
 * PUT /api/perfil/tierlist/nota — salva o mini comentário do dono na própria
 * tierlist. Recado em branco apaga a linha de texto (grava `null`).
 *
 * Mesmo gate de VIP das rotas de item: a RLS já barra, isto barra antes.
 */
export async function PUT(request: NextRequest) {
  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Você precisa estar logado." }, { status: 401 })

  const db = createSupabaseAdminClient()
  const { data: profile } = await db
    .from("user_profiles")
    .select("account_tier, vip_expires_at")
    .eq("id", user.id)
    .maybeSingle()

  if (!isVipActive(profile?.account_tier, profile?.vip_expires_at)) {
    return NextResponse.json({ error: "Recurso exclusivo VIP." }, { status: 403 })
  }

  const rawBody = await request.json().catch(() => null)
  const parsed = noteSchema.safeParse(rawBody)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const note = parsed.data.note?.trim() || null
  if (note && checkContent(note).blocked) {
    return NextResponse.json({ error: CONTENT_FILTER_MESSAGE }, { status: 400 })
  }

  try {
    await saveUserTierlistNote(user.id, note)
    return NextResponse.json({ ok: true, note })
  } catch (err) {
    console.error("[perfil/tierlist/nota] save:", err)
    return NextResponse.json({ error: "Não foi possível salvar o recado." }, { status: 500 })
  }
}
