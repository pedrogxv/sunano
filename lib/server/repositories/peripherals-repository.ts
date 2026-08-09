import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { coercePeripheralId, slugToSearchPattern } from "@/lib/peripheral-slug"

/**
 * Repositório de Periféricos — única porta de acesso à tabela `peripherals`
 * para leitura. Toda consulta vive aqui; nenhuma página ou componente fala
 * com o Supabase diretamente.
 */

export type PeripheralRecord = {
  id: string
  name: string
  brand: string
  brandId: string
  image_url: string | null
  category: string
  tier: string | null
  price: number
  tags: string[]
  specs: Record<string, unknown>
}

export type PeripheralSummary = {
  id: string
  name: string
  brand: string
  brandId: string
  category: string
  image_url: string | null
  tier?: string | null
  price?: number
  tags?: string[]
  specs?: Record<string, unknown>
}

const FULL_COLUMNS = "id, name, brand_id, brands(name), image_url, category, tier, price, tags, specs"
const SHORT_COLUMNS = "id, name, brand_id, brands(name), category, image_url"

/** Achata o embed `brands(name)` do PostgREST em `brand`/`brandId` planos. */
function mapBrandFields<T extends { brand_id: string; brands: { name: string } | { name: string }[] | null }>(
  row: T
): Omit<T, "brand_id" | "brands"> & { brand: string; brandId: string } {
  const { brand_id, brands, ...rest } = row
  const brandRow = Array.isArray(brands) ? brands[0] : brands
  return { ...rest, brand: brandRow?.name ?? "", brandId: brand_id }
}

/** Lista todos os periféricos (tierlist, página de periféricos, admin). */
export async function listAllPeripherals(): Promise<PeripheralRecord[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("peripherals")
    .select(FULL_COLUMNS)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[peripherals-repository] listAllPeripherals:", error)
    return []
  }
  return ((data ?? []) as unknown as Array<Parameters<typeof mapBrandFields>[0]>).map(mapBrandFields) as PeripheralRecord[]
}

export type RankedPeripheral = {
  id: string
  name: string
  category: string
  score: number
  image_url: string | null
}

/** Periféricos com score > 0, para a página de ranking (pública e admin). */
export async function getRankedPeripherals(): Promise<RankedPeripheral[]> {
  const all = await listAllPeripherals()

  return all
    .map((p) => {
      const details = ((p.specs as Record<string, unknown>)?.details ?? {}) as Record<string, unknown>
      const score = details.score != null ? Number(details.score) : null
      return { id: p.id, name: p.name, category: p.category, score, image_url: p.image_url }
    })
    .filter((p): p is RankedPeripheral => typeof p.score === "number" && p.score > 0)
}

/** Busca um periférico por id embutido no slug ou, em fallback, por nome. */
export async function getPeripheralByIdOrSlug(slug: string): Promise<PeripheralRecord | null> {
  const db = createSupabaseAdminClient()
  const idFromSlug = coercePeripheralId(slug)
  const baseSlug = slug.split("--")[0]

  if (idFromSlug) {
    const { data, error } = await db
      .from("peripherals")
      .select(FULL_COLUMNS)
      .eq("id", idFromSlug)
      .maybeSingle()
    if (error) console.error("[peripherals-repository] getByIdOrSlug (id):", error)
    if (data) return mapBrandFields(data as unknown as Parameters<typeof mapBrandFields>[0]) as PeripheralRecord
  }

  const { data, error } = await db
    .from("peripherals")
    .select(FULL_COLUMNS)
    .ilike("name", slugToSearchPattern(baseSlug))
    .limit(1)
  if (error) console.error("[peripherals-repository] getByIdOrSlug (name):", error)
  const row = data?.[0]
  return row ? (mapBrandFields(row as unknown as Parameters<typeof mapBrandFields>[0]) as PeripheralRecord) : null
}

export type PeripheralQueryOptions = {
  search?: string
  ids?: string[]
  excludeIds?: string[]
  category?: string
  limit?: number
  full?: boolean
}

/** Consulta flexível usada pelo endpoint `/api/peripherals` (busca/comparador). */
export async function queryPeripherals(options: PeripheralQueryOptions): Promise<PeripheralSummary[]> {
  const db = createSupabaseAdminClient()
  const limit = Math.min(options.limit ?? 200, 1000)

  let query = db
    .from("peripherals")
    .select(options.full ? FULL_COLUMNS : SHORT_COLUMNS)
    .order("name", { ascending: true })
    .limit(limit)

  if (options.ids && options.ids.length > 0) {
    query = query.in("id", options.ids)
  }
  if (options.category) {
    query = query.eq("category", options.category as never)
  }
  if (options.search && options.search.trim().length >= 2) {
    query = query.ilike("name", `%${options.search.trim()}%`)
  }
  const validExcludeIds = options.excludeIds?.filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
  if (validExcludeIds && validExcludeIds.length > 0) {
    query = query.not("id", "in", `(${validExcludeIds.join(",")})`)
  }

  const { data, error } = await query
  if (error) {
    console.error("[peripherals-repository] queryPeripherals:", error)
    throw error
  }
  return ((data ?? []) as unknown as Array<Parameters<typeof mapBrandFields>[0]>).map(mapBrandFields) as PeripheralSummary[]
}

/** Valida que todos os ids informados existem na tabela de periféricos. */
export async function peripheralsExist(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  const db = createSupabaseAdminClient()
  const { data } = await db.from("peripherals").select("id").in("id", ids)
  return (data ?? []).length === ids.length
}
