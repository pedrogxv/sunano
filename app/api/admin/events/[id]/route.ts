import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { deleteEvent, getEventForAdmin, updateEvent } from "@/lib/server/repositories/events-repository"

const updateEventSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  rarity: z.enum(["common", "rare", "epic", "legendary"]).optional(),
  maxParticipants: z.number().int().positive().optional(),
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
  const event = await getEventForAdmin(id)
  if (!event) {
    return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 })
  }
  return NextResponse.json({ event })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const parsed = updateEventSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const { id } = await params
  try {
    const event = await updateEvent(id, parsed.data)
    if (!event) {
      return NextResponse.json({ error: "Evento não encontrado." }, { status: 404 })
    }
    return NextResponse.json({ event })
  } catch {
    return NextResponse.json({ error: "Erro ao atualizar evento." }, { status: 500 })
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
  await deleteEvent(id)
  return NextResponse.json({ ok: true })
}
