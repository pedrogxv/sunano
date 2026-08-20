import { NextResponse } from "next/server"

import { getStoreFilterOptions } from "@/lib/server/repositories/store-repository"

export const revalidate = 300

/**
 * Opções de filtro pré-computadas (categorias, marcas, faixa de preço,
 * contagem por tipo) da Loja. Cacheado 5min.
 */
export async function GET() {
  const options = await getStoreFilterOptions("store")
  return NextResponse.json(options)
}
