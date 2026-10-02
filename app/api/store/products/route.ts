import { NextRequest, NextResponse } from "next/server"

import { storeApiMaintenanceResponse } from "@/lib/server/auth/store-maintenance-gate"
import { listStoreProductsPaginated, type StoreCondition, type StoreProductListFilters } from "@/lib/server/repositories/store-repository"
import { isStoreSortKey, type CatalogSelection } from "@/lib/store-catalog"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * Listagem paginada de produtos da Loja, com filtros aplicados no
 * banco. Consumida por `/loja` (pública — sempre `is_active = true`).
 */

const CONDITIONS = ["new", "used", "opened"] as const
const SALE_TYPES = ["pre_order", "ready_stock", "normal"] as const

function parseCsv(value: string | null): string[] | undefined {
  const trimmed = value?.trim()
  if (!trimmed) return undefined
  const list = trimmed.split(",").map((v) => v.trim()).filter(Boolean)
  return list.length > 0 ? list : undefined
}

function parseEnumCsv<T extends string>(value: string | null, allowed: readonly T[]): T[] | undefined {
  const list = parseCsv(value)?.filter((v): v is T => (allowed as readonly string[]).includes(v))
  return list && list.length > 0 ? list : undefined
}

/** Chave/valor de catálogo: slug curto. Qualquer outra coisa é descartada antes de chegar ao filtro. */
const CATALOG_SLUG = /^[a-z0-9-]{1,40}$/

/**
 * Tipos (`tipo=ultraleves,magnesio`) e facetas (`f.peso=ate-45,45-55`) do
 * catálogo. Chave que a categoria não tem não casa com nada no repositório,
 * então aqui só se garante o formato.
 */
function parseCatalog(searchParams: URLSearchParams): CatalogSelection | undefined {
  const collections = (parseCsv(searchParams.get("tipo")) ?? []).filter((v) => CATALOG_SLUG.test(v)).slice(0, 10)
  const facets: Record<string, string[]> = {}
  for (const [name, value] of searchParams) {
    if (!name.startsWith("f.")) continue
    const key = name.slice(2)
    const values = (parseCsv(value) ?? []).filter((v) => CATALOG_SLUG.test(v)).slice(0, 10)
    if (CATALOG_SLUG.test(key) && values.length > 0) facets[key] = values
    if (Object.keys(facets).length >= 10) break
  }
  return collections.length > 0 || Object.keys(facets).length > 0 ? { collections, facets } : undefined
}

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

export async function GET(request: NextRequest) {
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  const { searchParams } = new URL(request.url)

  const conditionParam = searchParams.get("condition")?.trim()
  const condition = (CONDITIONS as readonly string[]).includes(conditionParam ?? "")
    ? (conditionParam as StoreCondition)
    : undefined

  // Facetas multi-seleção da vitrine: valores desconhecidos caem fora em vez
  // de virarem `in.(...)` inválido no banco.
  const conditions = parseEnumCsv(searchParams.get("conditions"), CONDITIONS)
  const saleTypes = parseEnumCsv(searchParams.get("saleTypes"), SALE_TYPES)

  const sortParam = searchParams.get("sort")?.trim()
  const sort = isStoreSortKey(sortParam) ? sortParam : undefined

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
    conditions,
    saleTypes,
    promoOnly: searchParams.get("promo") === "1" ? true : undefined,
    inStockOnly: searchParams.get("inStock") === "1" ? true : undefined,
    catalog: parseCatalog(searchParams),
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
