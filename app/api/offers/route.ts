import { NextResponse } from "next/server"

import { createSupabaseAdminClient } from "@/lib/supabase-admin"
import { getClientIdentifier } from "@/lib/rate-limit"
import { getTelegramOffers } from "@/lib/telegram-offers"

export async function GET(request: Request) {
  try {
    const result = await getTelegramOffers(30)
    const offers = result.offers ?? []
    const offerIds = offers.map((offer) => offer.id)

    if (offerIds.length === 0) {
      return NextResponse.json({ ok: true, offers: [], warning: result.warning, source: result.source })
    }

    const supabase = createSupabaseAdminClient()
    const identifier = getClientIdentifier(request)

    const { data: votes, error: votesError } = await supabase
      .from("offers_votes")
      .select("offer_id, is_working, voter_hash")
      .in("offer_id", offerIds)

    if (votesError) {
      return NextResponse.json({ error: votesError.message }, { status: 400 })
    }

    const workingCounts: Record<string, number> = {}
    const userVotes = new Set<string>()

    for (const vote of (votes ?? []) as any[]) {
      const v = vote as any
      if (v.is_working) {
        workingCounts[v.offer_id] = (workingCounts[v.offer_id] ?? 0) + 1
      }
      if (v.voter_hash === identifier) {
        userVotes.add(v.offer_id)
      }
    }

    const offersWithVotes = offers.map((offer) => ({
      ...offer,
      votes_working: workingCounts[offer.id] ?? 0,
      user_voted: userVotes.has(offer.id),
    }))

    return NextResponse.json({ ok: true, offers: offersWithVotes, warning: result.warning, source: result.source })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar ofertas do Telegram"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
