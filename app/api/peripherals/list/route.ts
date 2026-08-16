import { NextRequest, NextResponse } from "next/server"

import { listPeripheralsPaginated, type PeripheralListFilters } from "@/lib/server/repositories/peripherals-repository"
import { ALL_CATEGORIES, type Category } from "@/lib/tag-options"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Listagem paginada de periféricos, com filtros aplicados no banco.
 * Consumida por `/perifericos` e `/admin/perifericos`.
 */

const SORT_KEYS = ["recent", "rank", "name-asc", "name-desc", "price-asc", "price-desc"] as const

function parseCsv(value: string | null): string[] | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const list = trimmed.split(",").map((v) => v.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const categoryParams = (parseCsv(searchParams.get("category")) ?? []).filter((c): c is Category =>
    (ALL_CATEGORIES as string[]).includes(c)
  )
  const category = categoryParams.length === 1 ? categoryParams[0] : undefined
  const categories = categoryParams.length > 1 ? categoryParams : undefined

  const sortParam = searchParams.get("sort")?.trim()
  const sort = (SORT_KEYS as readonly string[]).includes(sortParam ?? "") ? (sortParam as PeripheralListFilters["sort"]) : undefined

  const filters: PeripheralListFilters = {
    category,
    categories,
    search: searchParams.get("search")?.trim() || undefined,
    brandIds: parseCsv(searchParams.get("brandIds")),
    priceMin: parseNumber(searchParams.get("priceMin")),
    priceMax: parseNumber(searchParams.get("priceMax")),
    connectivity: searchParams.get("connectivity")?.trim() || undefined,
    mouseShape: searchParams.get("mouseShape")?.trim() || undefined,
    weightMinG: parseNumber(searchParams.get("weightMin")),
    weightMaxG: parseNumber(searchParams.get("weightMax")),
    keyboardLayout: searchParams.get("keyboardLayout")?.trim() || undefined,
    surface: searchParams.get("surface")?.trim() || undefined,
    profile: searchParams.get("profile")?.trim() || undefined,
    refreshRate: parseNumber(searchParams.get("refreshRate")),
    panelType: searchParams.get("panelType")?.trim() || undefined,
    tags: parseCsv(searchParams.get("tags")),
    sort,
    page: parseNumber(searchParams.get("page")),
    pageSize: parseNumber(searchParams.get("pageSize")),
  }

  try {
    const { items, total } = await listPeripheralsPaginated(filters)
    return NextResponse.json({
      items,
      total,
      page: Math.max(1, filters.page ?? 1),
      pageSize: Math.min(60, Math.max(1, filters.pageSize ?? 24)),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro ao carregar periféricos."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
