import "server-only"

import { unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { coercePeripheralId, slugToSearchPattern } from "@/lib/peripheral-slug"
import { clampPage, clampPageSize, rangeFor } from "@/lib/server/repositories/_shared"
import type { Category } from "@/lib/tag-options"

/**
 * Repositório de Periféricos — única porta de acesso à tabela `peripherals`
 * para leitura. Toda consulta vive aqui; nenhuma página ou componente fala
 * com o Supabase diretamente.
 */

/** Campos migrados de `specs` (jsonb) para colunas reais — ver migration
 * 20260917000001_peripherals_columns_and_indexes.sql. `specs` continua
 * existindo como fonte legada (dual-write no form admin) para o período de
 * transição; ler com fallback `coluna ?? specs.campo` enquanto isso. */
export type PeripheralColumnFields = {
  weightG: number | null
  connectivity: string | null
  mouseShape: string | null
  keyboardLayout: string | null
  surface: string | null
  profile: string | null
  panelType: string | null
  refreshRate: number | null
  tierRank: number | null
}

export type PeripheralRecord = PeripheralColumnFields & {
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

export type PeripheralSummary = Partial<PeripheralColumnFields> & {
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

const FULL_COLUMNS =
  "id, name, brand_id, brands(name), image_url, category, tier, price, tags, specs, weight_g, connectivity, mouse_shape, keyboard_layout, surface, profile, panel_type, refresh_rate, tier_rank"
const SHORT_COLUMNS = "id, name, brand_id, brands(name), category, image_url"

type RawPeripheralRow = {
  brand_id: string
  brands: { name: string } | { name: string }[] | null
  weight_g?: number | null
  connectivity?: string | null
  mouse_shape?: string | null
  keyboard_layout?: string | null
  surface?: string | null
  profile?: string | null
  panel_type?: string | null
  refresh_rate?: number | null
  tier_rank?: number | null
}

/** Achata o embed `brands(name)` do PostgREST em `brand`/`brandId` planos e
 * converte as colunas snake_case migradas de `specs` para camelCase. */
function mapBrandFields<T extends RawPeripheralRow>(
  row: T
): Omit<T, "brand_id" | "brands" | "weight_g" | "connectivity" | "mouse_shape" | "keyboard_layout" | "surface" | "profile" | "panel_type" | "refresh_rate" | "tier_rank"> &
  { brand: string; brandId: string } & PeripheralColumnFields {
  const {
    brand_id, brands, weight_g, connectivity, mouse_shape, keyboard_layout,
    surface, profile, panel_type, refresh_rate, tier_rank, ...rest
  } = row
  const brandRow = Array.isArray(brands) ? brands[0] : brands
  return {
    ...rest,
    brand: brandRow?.name ?? "",
    brandId: brand_id,
    weightG: weight_g ?? null,
    connectivity: connectivity ?? null,
    mouseShape: mouse_shape ?? null,
    keyboardLayout: keyboard_layout ?? null,
    surface: surface ?? null,
    profile: profile ?? null,
    panelType: panel_type ?? null,
    refreshRate: refresh_rate ?? null,
    tierRank: tier_rank ?? null,
  }
}

/**
 * Lista todos os periféricos (tierlist, ranking, admin/ranking, e cada
 * página de detalhe de periférico para calcular a posição na categoria).
 *
 * `unstable_cache` (2 min): sem filtro nem limite de propósito — a tierlist e
 * o ranking precisam do catálogo inteiro para agrupar por tier/pontuação, o
 * que não dá pra paginar. Sem cache, isso era um full-table scan repetido a
 * cada visita de `/tierlist`, `/ranking`, `/admin/ranking` e de QUALQUER
 * `/perifericos/[slug]` (usado só para achar os concorrentes da categoria).
 * `specs` (jsonb) inclui `details.score`, então o TTL cobre o caso de edição
 * no admin/tierlist não aparecer instantaneamente — 2 min é aceitável aqui,
 * mesmo padrão de tolerância já usado em `getStoreFilterOptions`/`getPeripheralFilterOptions`.
 */
export const listAllPeripherals = unstable_cache(
  async (): Promise<PeripheralRecord[]> => {
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
  },
  ["peripherals-repository:listAllPeripherals"],
  { revalidate: 120 }
)

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

export type PeripheralRank = { position: number; total: number }

/**
 * Posição de um periférico no ranking da própria categoria (mesma lógica de
 * `/perifericos/[slug]`, reaproveitada para exibir o ranking em outras
 * seções do site, como a Loja, quando um produto tem um periférico vinculado).
 */
export async function getPeripheralRankById(peripheralId: string): Promise<PeripheralRank | null> {
  const all = await listAllPeripherals()
  const target = all.find((p) => p.id === peripheralId)
  if (!target) return null

  const rankedInCategory = all
    .filter((p) => p.category === target.category)
    .map((p) => {
      const details = ((p.specs as Record<string, unknown>)?.details ?? {}) as Record<string, unknown>
      const score = details.score != null ? Number(details.score) : null
      return { id: p.id, score }
    })
    .filter((p): p is { id: string; score: number } => typeof p.score === "number" && p.score > 0)
    .sort((a, b) => b.score - a.score)

  const rankIndex = rankedInCategory.findIndex((p) => p.id === peripheralId)
  return rankIndex >= 0 ? { position: rankIndex + 1, total: rankedInCategory.length } : null
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

export type PeripheralListFilters = {
  category?: Category
  categories?: Category[]
  search?: string
  brandIds?: string[]
  priceMin?: number
  priceMax?: number
  connectivity?: string
  mouseShape?: string
  weightMinG?: number
  weightMaxG?: number
  keyboardLayout?: string
  surface?: string
  profile?: string
  refreshRate?: number
  panelType?: string
  tags?: string[]
  sort?: "recent" | "rank" | "name-asc" | "name-desc" | "price-asc" | "price-desc"
  page?: number
  pageSize?: number
}

export type PeripheralListResult = {
  items: PeripheralRecord[]
  total: number
}

/**
 * Listagem paginada de periféricos, com filtros aplicados no banco (mesmo
 * padrão de `listOrdersForAdmin` em orders-repository.ts). Usada por
 * `/perifericos` e `/admin/perifericos` — substitui o antigo padrão de
 * `listAllPeripherals()` + filtro em memória no client.
 */
export async function listPeripheralsPaginated(
  filters: PeripheralListFilters
): Promise<PeripheralListResult> {
  const db = createSupabaseAdminClient()
  let query = db.from("peripherals").select(FULL_COLUMNS, { count: "exact" })

  if (filters.category) query = query.eq("category", filters.category)
  if (filters.categories?.length) query = query.in("category", filters.categories)
  if (filters.search?.trim()) query = query.ilike("name", `%${filters.search.trim()}%`)
  if (filters.brandIds?.length) query = query.in("brand_id", filters.brandIds)
  if (filters.priceMin != null) query = query.gte("price", filters.priceMin)
  if (filters.priceMax != null) query = query.lte("price", filters.priceMax)
  if (filters.connectivity) query = query.eq("connectivity", filters.connectivity)
  if (filters.mouseShape) query = query.eq("mouse_shape", filters.mouseShape)
  if (filters.weightMinG != null) query = query.gte("weight_g", filters.weightMinG)
  if (filters.weightMaxG != null) query = query.lte("weight_g", filters.weightMaxG)
  if (filters.keyboardLayout) query = query.eq("keyboard_layout", filters.keyboardLayout)
  if (filters.surface) query = query.eq("surface", filters.surface)
  if (filters.profile) query = query.eq("profile", filters.profile)
  if (filters.refreshRate != null) query = query.eq("refresh_rate", filters.refreshRate)
  if (filters.panelType) query = query.eq("panel_type", filters.panelType)
  if (filters.tags?.length) query = query.overlaps("tags", filters.tags)

  switch (filters.sort) {
    case "rank":
      query = query.order("tier_rank", { ascending: true, nullsFirst: false }).order("name", { ascending: true })
      break
    case "name-asc":
      query = query.order("name", { ascending: true })
      break
    case "name-desc":
      query = query.order("name", { ascending: false })
      break
    case "price-asc":
      query = query.order("price", { ascending: true })
      break
    case "price-desc":
      query = query.order("price", { ascending: false })
      break
    default:
      query = query.order("created_at", { ascending: false })
  }

  const page = clampPage(filters.page)
  const pageSize = clampPageSize(filters.pageSize)
  const [from, to] = rangeFor(page, pageSize)
  query = query.range(from, to)

  const { data, error, count } = await query
  if (error) {
    console.error("[peripherals-repository] listPeripheralsPaginated:", error)
    return { items: [], total: 0 }
  }
  const items = ((data ?? []) as unknown as Array<Parameters<typeof mapBrandFields>[0]>).map(mapBrandFields) as PeripheralRecord[]
  return { items, total: count ?? items.length }
}

export type PeripheralFilterOptions = {
  brands: { id: string; name: string }[]
  priceMin: number
  priceMax: number
  tags: string[]
  mouseShapes: string[]
  keyboardLayouts: string[]
  surfaces: string[]
  profiles: string[]
  refreshRates: number[]
  panelTypes: string[]
  categoryCounts: Record<string, number>
}

const EMPTY_FILTER_OPTIONS: PeripheralFilterOptions = {
  brands: [],
  priceMin: 0,
  priceMax: 0,
  tags: [],
  mouseShapes: [],
  keyboardLayouts: [],
  surfaces: [],
  profiles: [],
  refreshRates: [],
  panelTypes: [],
  categoryCounts: {},
}

type FilterOptionsRow = {
  brand_id: string
  brands: { name: string } | { name: string }[] | null
  price: number
  tags: string[] | null
  category: string
  connectivity: string | null
  mouse_shape: string | null
  keyboard_layout: string | null
  surface: string | null
  profile: string | null
  refresh_rate: number | null
  panel_type: string | null
}

/**
 * Opções de filtro disponíveis (marcas, faixa de preço, tags, specs) para
 * uma categoria (ou geral, sem `category`). Query leve — sem `specs`
 * completo — pensada para ser chamada por trás de cache (`revalidate` do
 * Next na página/rota chamadora), não recalculada por keystroke. Precisão
 * "boa o suficiente": aceita ficar levemente desatualizada entre janelas de
 * cache em troca de não escanear o dataset inteiro a cada filtro.
 */
export async function getPeripheralFilterOptions(category?: Category): Promise<PeripheralFilterOptions> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("peripherals")
    .select("brand_id, brands(name), price, tags, category, connectivity, mouse_shape, keyboard_layout, surface, profile, refresh_rate, panel_type")

  if (category) query = query.eq("category", category)

  const { data, error } = await query
  if (error) {
    console.error("[peripherals-repository] getPeripheralFilterOptions:", error)
    return EMPTY_FILTER_OPTIONS
  }

  const rows = (data ?? []) as unknown as FilterOptionsRow[]
  const brandsById = new Map<string, string>()
  const tags = new Set<string>()
  const mouseShapes = new Set<string>()
  const keyboardLayouts = new Set<string>()
  const surfaces = new Set<string>()
  const profiles = new Set<string>()
  const refreshRates = new Set<number>()
  const panelTypes = new Set<string>()
  const categoryCounts: Record<string, number> = {}
  let priceMin = Infinity
  let priceMax = 0

  for (const row of rows) {
    const brandRow = Array.isArray(row.brands) ? row.brands[0] : row.brands
    if (row.brand_id && brandRow?.name) brandsById.set(row.brand_id, brandRow.name)
    row.tags?.forEach((tag) => tags.add(tag))
    if (row.mouse_shape) mouseShapes.add(row.mouse_shape)
    if (row.keyboard_layout) keyboardLayouts.add(row.keyboard_layout)
    if (row.surface) surfaces.add(row.surface)
    if (row.profile) profiles.add(row.profile)
    if (row.refresh_rate != null) refreshRates.add(row.refresh_rate)
    if (row.panel_type) panelTypes.add(row.panel_type)
    if (row.category) categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1
    if (typeof row.price === "number") {
      priceMin = Math.min(priceMin, row.price)
      priceMax = Math.max(priceMax, row.price)
    }
  }

  return {
    brands: [...brandsById.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name)),
    priceMin: Number.isFinite(priceMin) ? priceMin : 0,
    priceMax,
    tags: [...tags].sort(),
    mouseShapes: [...mouseShapes].sort(),
    keyboardLayouts: [...keyboardLayouts].sort(),
    surfaces: [...surfaces].sort(),
    profiles: [...profiles].sort(),
    refreshRates: [...refreshRates].sort((a, b) => a - b),
    panelTypes: [...panelTypes].sort(),
    categoryCounts,
  }
}

/**
 * Top N periféricos por score numa categoria, para a seção de ranking.
 * Reaproveita a mesma fonte de `getRankedPeripherals()` (score vive em
 * `specs.details.score`, não migrado para coluna — tabela é pequena o
 * bastante para não justificar a coluna extra só para isso), mas com select
 * restrito à categoria pedida em vez do dataset inteiro.
 */
export async function getTopRankedPeripherals(category: Category, limit = 3): Promise<RankedPeripheral[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("peripherals")
    .select("id, name, category, image_url, specs")
    .eq("category", category)
    // Defesa contra categoria com catálogo muito grande — o corte por score
    // acontece em memória (score vive em `specs.details`, não é coluna), mas
    // não precisamos de mais que umas poucas centenas de linhas pra achar o
    // top N com folga.
    .limit(300)

  if (error) {
    console.error("[peripherals-repository] getTopRankedPeripherals:", error)
    return []
  }

  return ((data ?? []) as unknown as Array<{ id: string; name: string; category: string; image_url: string | null; specs: Record<string, unknown> }>)
    .map((p) => {
      const details = (p.specs?.details ?? {}) as Record<string, unknown>
      const score = details.score != null ? Number(details.score) : null
      return { id: p.id, name: p.name, category: p.category, score, image_url: p.image_url }
    })
    .filter((p): p is RankedPeripheral => typeof p.score === "number" && p.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

/** Valida que todos os ids informados existem na tabela de periféricos. */
export async function peripheralsExist(ids: string[]): Promise<boolean> {
  if (ids.length === 0) return true
  const db = createSupabaseAdminClient()
  const { data } = await db.from("peripherals").select("id").in("id", ids)
  return (data ?? []).length === ids.length
}

/**
 * Ids de periféricos com review em vídeo do Sunano publicado. Não há coluna
 * de review no próprio periférico — o vínculo é indireto via
 * `store_products.peripheral_id` -> `store_product_sunano_reviews`.
 */
export async function listPeripheralIdsWithYoutubeReview(): Promise<Set<string>> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_products")
    .select("peripheral_id, store_product_sunano_reviews!inner(video_url, published)")
    .not("peripheral_id", "is", null)
    .eq("store_product_sunano_reviews.published", true)
    .not("store_product_sunano_reviews.video_url", "is", null)

  if (error) {
    console.error("[peripherals-repository] listPeripheralIdsWithYoutubeReview:", error)
    return new Set()
  }
  return new Set((data ?? []).map((row) => row.peripheral_id as string))
}
