import { NextRequest, NextResponse } from "next/server"

import { searchStoreProductsTop } from "@/lib/server/repositories/store-repository"
import { checkRateLimit, getClientIdentifier } from "@/lib/server/rate-limit"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Busca "em tempo real" pro dropdown da barra de pesquisa da Loja — poucos
 * resultados, sem paginação. A busca completa (com filtros) continua em
 * `/api/store/products`, consumida por `/loja?q=`.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")?.trim() ?? ""
  const limit = Math.min(Math.max(Number(searchParams.get("limit")) || 5, 1), 10)

  if (q.length < 2) {
    return NextResponse.json({ items: [] })
  }

  const rateLimit = await checkRateLimit({
    action: "store_search",
    identifier: getClientIdentifier(request),
    maxAttempts: 60,
    windowSeconds: 60,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Muitas buscas seguidas. Aguarde um instante." }, { status: 429 })
  }

  // Corta o termo pra evitar abuso via querystring gigante (ILIKE em texto
  // longo não ajuda relevância e só desperdiça CPU no banco).
  const items = await searchStoreProductsTop(q.slice(0, 80), limit)
  return NextResponse.json({ items })
}
