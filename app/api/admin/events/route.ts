import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createEvent, listEventsForAdmin } from "@/lib/server/repositories/events-repository"

const createEventSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().nullable(),
  rarity: z.enum(["common", "rare", "epic", "legendary"]).optional().default("legendary"),
  maxParticipants: z.number().int().positive(),
  criteriaType: z.enum(["first_n_signups", "manual_opt_in"]).optional().default("first_n_signups"),
})

export async function GET() {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_read")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const events = await listEventsForAdmin()
  return NextResponse.json({ events })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthorizedProfile()
  if (auth.error || !auth.profile) {
    return NextResponse.json({ error: auth.error }, { status: auth.status })
  }
  if (!hasAdminPermission(auth.profile, "events_write")) {
    return NextResponse.json({ error: "Acesso negado" }, { status: 403 })
  }

  const parsed = createEventSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  try {
    const event = await createEvent({
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      imageUrl: parsed.data.imageUrl ?? null,
      rarity: parsed.data.rarity,
      maxParticipants: parsed.data.maxParticipants,
      criteriaType: parsed.data.criteriaType,
    })
    return NextResponse.json({ event })
  } catch {
    return NextResponse.json({ error: "Erro ao criar evento." }, { status: 500 })
  }
}
