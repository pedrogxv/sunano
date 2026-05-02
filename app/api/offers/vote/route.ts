import { NextResponse } from "next/server"
import * as z from "zod"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { checkRateLimit, getClientIdentifier } from "@/lib/rate-limit"

const voteSchema = z.object({
  offerId: z.string().trim().min(1),
  is_working: z.boolean().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = voteSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos." }, { status: 400 })
    }

    const supabase = createSupabaseAdminClient()
    const identifier = getClientIdentifier(request)

    const rateLimit = await checkRateLimit({
      supabase,
      action: "offer_vote",
      identifier,
      maxAttempts: 8,
      windowSeconds: 3600,
    })

    if (!rateLimit.allowed) {
      return NextResponse.json({ error: "Aguarde alguns minutos antes de votar novamente." }, { status: 429 })
    }

    const payload = {
      offer_id: parsed.data.offerId,
      voter_hash: identifier,
      is_working: parsed.data.is_working ?? true,
    }

    const { error } = await (supabase
      .from("offers_votes")
      .upsert(payload as any, { onConflict: "offer_id,voter_hash" }) as any)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: "Erro ao registrar voto." }, { status: 500 })
  }
}
