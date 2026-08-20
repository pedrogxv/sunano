import { NextRequest, NextResponse } from "next/server"

import { listStoreProductsPaginated, type StoreProductListFilters } from "@/lib/server/repositories/store-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Listagem paginada de produtos da Loja, com filtros aplicados no
 * banco. Consumida por `/loja` (pública — sempre `is_active = true`).
 */

const SORT_KEYS = ["recent", "name-asc", "name-desc", "price-asc", "price-desc"] as const
const CONDITIONS = ["new", "used", "opened"] as const

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

  const conditionParam = searchParams.get("condition")?.trim()
  const condition = (CONDITIONS as readonly string[]).includes(conditionParam ?? "")
    ? (conditionParam as "new" | "used" | "opened")
    : undefined

  const sortParam = searchParams.get("sort")?.trim()
  const sort = (SORT_KEYS as readonly string[]).includes(sortParam ?? "") ? (sortParam as StoreProductListFilters["sort"]) : undefined

  const filters: StoreProductListFilters = {
    type: "store",
    condition,
    categories: parseCsv(searchParams.get("categories")),
    brands: parseCsv(searchParams.get("brands")),
    search: searchParams.get("search")?.trim() || undefined,
    priceMinCents: parseNumber(searchParams.get("priceMin")),
    priceMaxCents: parseNumber(searchParams.get("priceMax")),
    productIds: parseCsv(searchParams.get("productIds")),
    featured: searchParams.get("featured") === "1" ? true : undefined,
    sort,
    page: parseNumber(searchParams.get("page")),
    pageSize: parseNumber(searchParams.get("pageSize")),
  }

  const { items, total } = await listStoreProductsPaginated(filters)
  return NextResponse.json({
    items,
    total,
    page: Math.max(1, filters.page ?? 1),
    pageSize: Math.min(60, Math.max(1, filters.pageSize ?? 24)),
  })
}
