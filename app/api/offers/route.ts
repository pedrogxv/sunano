import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import { getTelegramOffers, SCRAPE_LIMIT } from "@/lib/server/integrations/telegram-offers"
import { getOfferVoteSummary } from "@/lib/server/repositories/offers-repository"

/**
 * Lista as ofertas vindas do Telegram já combinadas com os votos da tabela
 * `offers_votes`. A consulta de votos vive no `offers-repository`. A leitura
 * é pública (visitante anônimo); só o voto em si exige login.
 */
export async function GET(request: NextRequest) {
  try {
    const result = await getTelegramOffers(SCRAPE_LIMIT)
    const offers = result.offers ?? []
    const offerIds = offers.map((offer) => offer.id)

    if (offerIds.length === 0) {
      return NextResponse.json({ ok: true, offers: [], warning: result.warning, source: result.source })
    }

    const user = await getRequestUser(request)
    const { workingCounts, userVoted } = await getOfferVoteSummary(offerIds, user?.id ?? null)

    const offersWithVotes = offers.map((offer) => ({
      ...offer,
      chatTitle: null,
      votes_working: workingCounts[offer.id] ?? 0,
      user_voted: userVoted.has(offer.id),
    }))

    return NextResponse.json({ ok: true, offers: offersWithVotes, warning: result.warning, source: result.source })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar ofertas do Telegram"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
