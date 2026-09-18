import { NextResponse } from "next/server"

import { fetchChannelAvatarUrl, fetchTelegramCdnImage } from "@/lib/server/integrations/telegram-offers"

/**
 * Foto do canal pro rodapé dos cards, com a URL do CDN renovada na hora.
 *
 * A URL gravada em cada oferta expira em horas (ver `fetchChannelAvatarUrl`).
 * Cache de um dia, não de uma semana como a imagem da oferta: a foto do canal
 * pode ser trocada, e a troca tem que aparecer.
 */
export async function GET() {
  try {
    const avatarUrl = await fetchChannelAvatarUrl()
    if (!avatarUrl) {
      return new NextResponse(null, { status: 404, headers: { "Cache-Control": "public, s-maxage=3600" } })
    }

    const { body, contentType } = await fetchTelegramCdnImage(avatarUrl)
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[offers/avatar] falha ao buscar a foto do canal:", error)
    return new NextResponse(null, { status: 502, headers: { "Cache-Control": "public, s-maxage=60" } })
  }
}
