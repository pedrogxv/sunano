import { NextRequest, NextResponse } from "next/server"

import { fetchOfferImageUrl, fetchTelegramCdnImage } from "@/lib/server/integrations/telegram-offers"

/**
 * Imagem de uma oferta do canal, sempre com a URL do CDN renovada na hora.
 *
 * A URL gravada no scraping expira em poucas horas (ver `fetchOfferImageUrl`),
 * então a grade não pode usá-la direto. Aqui a imagem é baixada e devolvida
 * com cache longo: a foto de uma mensagem não muda, e o CDN da Vercel segura
 * a resposta, então o Telegram só é consultado uma vez por imagem.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const { messageId } = await params
  if (!/^\d{1,10}$/.test(messageId)) {
    return new NextResponse(null, { status: 400 })
  }

  try {
    const imageUrl = await fetchOfferImageUrl(Number(messageId))
    if (!imageUrl) return notFound()

    const { body, contentType } = await fetchTelegramCdnImage(imageUrl)
    return new NextResponse(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
        "X-Content-Type-Options": "nosniff",
      },
    })
  } catch (error) {
    console.error("[offers/image] falha ao buscar imagem:", error)
    // Cache curto: falha do Telegram é passageira, não pode ficar presa na CDN.
    return new NextResponse(null, { status: 502, headers: { "Cache-Control": "public, s-maxage=60" } })
  }
}

/**
 * Mensagem sem foto nem vídeo. Isso não muda, então pode ficar em cache por um
 * dia: é o que segura o custo da sonda (`imageProbe`) dos cards só de texto.
 */
function notFound() {
  return new NextResponse(null, {
    status: 404,
    headers: { "Cache-Control": "public, max-age=86400, s-maxage=86400" },
  })
}
