import { NextRequest, NextResponse } from "next/server"

import { getRequestUser } from "@/lib/server/auth/current-user"
import {
  getTelegramOffers,
  OFFER_AVATAR_PROXY_PATH,
  offerImageProxyPath,
  SCRAPE_LIMIT,
} from "@/lib/server/integrations/telegram-offers"
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
      // Nunca a URL gravada do CDN: ela expira em horas e a imagem de toda
      // oferta mais antiga que a última sincronização quebrava.
      // `getTelegramOffers` só devolve oferta com foto confirmada.
      image: offer.image ? { ...offer.image, url: offerImageProxyPath(offer.messageId) } : null,
      // Mesmo motivo: a foto do canal gravada em cada oferta também expira.
      authorAvatar: offer.authorAvatar ? { ...offer.authorAvatar, url: OFFER_AVATAR_PROXY_PATH } : null,
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
