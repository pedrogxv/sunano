import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { rateSupportTicket } from "@/lib/server/repositories/support-repository"

/** Avaliação de satisfação, disponível só depois do chamado encerrado. */
const rateTicketSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(500).nullish(),
})

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getRequestUser(request)
  if (!user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 })
  }

  const json = await request.json().catch(() => null)
  const parsed = rateTicketSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
  }

  const { id } = await params
  const result = await rateSupportTicket({
    ticketId: id,
    userId: user.id,
    rating: parsed.data.rating,
    comment: parsed.data.comment,
  })

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  return NextResponse.json({ ok: true })
}
