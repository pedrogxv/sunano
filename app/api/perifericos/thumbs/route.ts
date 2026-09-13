import { NextRequest, NextResponse } from "next/server"

import { listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"

/** Teto de ids por chamada — o formulário nunca precisa de mais que isso. */
const MAX_IDS = 16

/**
 * Imagens de um punhado de periféricos, por id.
 *
 * O `/mention-catalog` deixou de mandar `image_url` porque as URLs custavam
 * ~15 KB gzip do payload e o formulário só exibe a imagem de quem virou chip —
 * normalmente um ou dois periféricos. Esta rota entrega exatamente essas.
 *
 * Sem custo de banco: lê do mesmo `listAllPeripherals` já cacheado.
 */
export async function GET(request: NextRequest) {
  try {
    const idsParam = request.nextUrl.searchParams.get("ids") ?? ""
    const ids = idsParam
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean)
      .slice(0, MAX_IDS)

    if (ids.length === 0) return NextResponse.json({ images: {} })

    const wanted = new Set(ids)
    const peripherals = await listAllPeripherals()
    const images: Record<string, string> = {}
    for (const peripheral of peripherals) {
      if (wanted.has(peripheral.id) && peripheral.image_url) {
        images[peripheral.id] = peripheral.image_url
      }
    }

    return NextResponse.json(
      { images },
      { headers: { "Cache-Control": "public, s-maxage=600, stale-while-revalidate=3600" } }
    )
  } catch (error) {
    console.error("[perifericos/thumbs]", error)
    return NextResponse.json({ images: {} }, { headers: { "Cache-Control": "no-store" } })
  }
}
