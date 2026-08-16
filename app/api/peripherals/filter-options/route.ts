import { NextRequest, NextResponse } from "next/server"

import { getPeripheralFilterOptions } from "@/lib/server/repositories/peripherals-repository"
import { ALL_CATEGORIES, type Category } from "@/lib/tag-options"

export const revalidate = 300

/**
 * Opções de filtro pré-computadas (marcas, faixa de preço, tags, specs
 * disponíveis) para uma categoria de periféricos. Cacheado 5min — precisão
 * "boa o suficiente", não recalculado por keystroke.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const categoryParam = searchParams.get("category")?.trim()
  const category = categoryParam && (ALL_CATEGORIES as string[]).includes(categoryParam) ? (categoryParam as Category) : undefined

  const options = await getPeripheralFilterOptions(category)
  return NextResponse.json(options)
}
