import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  deleteAuraItem,
  getAuraItemForAdmin,
  updateAuraItem,
} from "@/lib/server/repositories/aura-store-repository"

const updateAuraItemSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  frameAssetUrl: z.string().url().optional(),
  auraCost: z.number().int().positive().optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
})

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await params
  const item = await getAuraItemForAdmin(id)
  if (!item) {
    return NextResponse.json({ error: "Item não encontrado." }, { status: 404 })
  }
  return NextResponse.json({ item })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const parsed = updateAuraItemSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const { id } = await params
  try {
    const item = await updateAuraItem(id, parsed.data)
    if (!item) {
      return NextResponse.json({ error: "Item não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ item })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao atualizar item de Aura."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const { id } = await params
  await deleteAuraItem(id)
  return NextResponse.json({ ok: true })
}
