import { NextRequest, NextResponse } from "next/server"

import { getStoreFilterOptions } from "@/lib/server/repositories/store-repository"

export const revalidate = 300

const TYPES = ["store", "bazaar"] as const

/**
 * Opções de filtro pré-computadas (categorias, marcas, faixa de preço,
 * contagem por tipo) da Loja/Bazar. Cacheado 5min.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const typeParam = searchParams.get("type")?.trim()
  const type = (TYPES as readonly string[]).includes(typeParam ?? "") ? (typeParam as "store" | "bazaar") : undefined

  const options = await getStoreFilterOptions(type)
  return NextResponse.json(options)
}
