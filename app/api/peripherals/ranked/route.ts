import { NextRequest, NextResponse } from "next/server"

import { getTopRankedPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { ALL_CATEGORIES, type Category } from "@/lib/tag-options"

export const revalidate = 120

/** Top N periféricos por score numa categoria, para a seção de ranking. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const categoryParam = searchParams.get("category")?.trim()
  if (!categoryParam || !(ALL_CATEGORIES as string[]).includes(categoryParam)) {
    return NextResponse.json({ error: "Categoria inválida." }, { status: 400 })
  }
  const category = categoryParam as Category

  const limitParam = Number(searchParams.get("limit"))
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 10) : 3

  const items = await getTopRankedPeripherals(category, limit)
  return NextResponse.json({ items })
}
