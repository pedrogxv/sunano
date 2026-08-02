import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { createEvent, listEventsForAdmin } from "@/lib/server/repositories/events-repository"

const createEventSchema = z
  .object({
    name: z.string().trim().min(1).max(100),
    description: z.string().trim().max(500).optional().nullable(),
    imageUrl: z.string().url().optional().nullable(),
    rarity: z.enum(["common", "rare", "epic", "legendary"]).optional().default("legendary"),
    maxParticipants: z.number().int().positive().optional().nullable(),
    criteriaType: z
      .enum(["first_n_signups", "manual_opt_in", "aura_redeem"])
      .optional()
      .default("first_n_signups"),
    auraCost: z.number().int().positive().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.criteriaType !== "aura_redeem" && !data.maxParticipants) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxParticipants"],
        message: "Informe o número de vagas.",
      })
    }
    if (data.criteriaType === "aura_redeem" && !data.auraCost) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["auraCost"],
        message: "Informe o custo em Aura.",
      })
    }
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
      maxParticipants: parsed.data.maxParticipants ?? null,
      criteriaType: parsed.data.criteriaType,
      auraCost: parsed.data.auraCost ?? null,
    })
    return NextResponse.json({ event })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao criar evento."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
