import "server-only"

import { cache } from "react"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { clampPage, clampPageSize, escapeOrFilterValue, rangeFor } from "@/lib/server/repositories/_shared"
import { getPeripheralRankById, type PeripheralRank } from "@/lib/server/repositories/peripherals-repository"

/**
 * Repositório da Loja — única porta de acesso à tabela `store_products`
 * para leitura. Páginas e endpoints delegam aqui.
 */

export type StoreProductCard = {
  id: string
  slug: string
  name: string
  price_cents: number
  promo_price_cents: number | null
  /** `null` = sem controle de estoque (nunca esgota). */
  stock: number | null
  images: string[]
  category: string | null
  brand: string | null
  type: "store"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  sale_type: "pre_order" | "ready_stock" | "normal"
  has_variants: boolean
  /** Subconjunto leve das variantes, pra seleção direto no card — sem specs/imagens extras. */
  variants: StoreCardVariant[]
  is_active: boolean
  is_sold_out: boolean
  is_featured: boolean
  /** Fixado manualmente na seção "Mais vendidos" da Home, à frente do ranking de vendas. */
  pin_best_seller: boolean
  /** Ordem manual entre os fixados (menor = mais à frente). `null` se não fixado. */
  best_seller_position: number | null
  created_at: string
}

export type StoreCardVariant = {
  id: string
  label: string
  price_cents_override: number | null
  promo_price_cents: number | null
  stock: number | null
  color: string | null
  icon: string | null
  image_url: string | null
  is_sold_out: boolean
}

export type StoreProductVariant = {
  id: string
  label: string
  price_cents_override: number | null
  promo_price_cents: number | null
  /** `null` = sem controle de estoque (nunca esgota). */
  stock: number | null
  position: number
  color: string | null
  icon: string | null
  image_url: string | null
  images: string[]
  /** Toggle manual, independente de `stock === 0` — ver 20260921000014. */
  is_sold_out: boolean
}

export type StoreProductVariantGroupOption = {
  id: string
  label: string
  price_cents_override: number | null
  is_sold_out: boolean
  position: number
}

export type StoreProductVariantGroup = {
  id: string
  name: string
  position: number
  options: StoreProductVariantGroupOption[]
}

export type FeaturedProduct = {
  id: string
  slug: string
  name: string
  price_cents: number
  images: string[]
  type: "store"
  condition: "new" | "used" | "opened"
}

export type LinkedProduct = {
  id: string
  slug: string
  name: string
  type: "store"
  price_cents: number
  /** Menor preço entre as variantes ativas (ou `price_cents` se não houver variantes). */
  price_cents_min: number
  /** Maior preço entre as variantes ativas (ou `price_cents` se não houver variantes). */
  price_cents_max: number
  images: string[]
  /** `null` = sem controle de estoque (nunca esgota). */
  stock: number | null
  is_active: boolean
  is_sold_out: boolean
}

const CARD_COLUMNS =
  "id, slug, name, price_cents, promo_price_cents, stock, images, category, brand, type, condition, condition_notes, sale_type, is_active, is_sold_out, is_featured, pin_best_seller, best_seller_position, created_at, variants:store_product_variants(id, label, price_cents_override, promo_price_cents, stock, color, icon, image_url, is_sold_out, position)"

type RawCardRow = Omit<StoreProductCard, "has_variants" | "variants"> & {
  variants: (StoreCardVariant & { position: number })[] | null
}

/** Converte a linha crua (com variantes embutidas) para StoreProductCard. */
function mapCardRow(row: RawCardRow): StoreProductCard {
  const { variants: rawVariants, ...rest } = row
  const variants = [...(rawVariants ?? [])].sort((a, b) => a.position - b.position)
  return {
    ...rest,
    has_variants: variants.length > 0,
    variants: variants.map(({ position: _position, ...v }) => v),
  }
}

/** Lista produtos ativos do tipo "store". */
export async function listActiveProductsByType(
  type: "store"
): Promise<StoreProductCard[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_products")
    .select(CARD_COLUMNS)
    .eq("type", type)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[store-repository] listActiveProductsByType:", error)
    return []
  }
  return ((data ?? []) as unknown as RawCardRow[]).map(mapCardRow)
}

/** Lista todos os produtos ativos, para a página unificada. */
export async function listActiveProducts(): Promise<StoreProductCard[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_products")
    .select(CARD_COLUMNS)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[store-repository] listActiveProducts:", error)
    return []
  }
  return ((data ?? []) as unknown as RawCardRow[]).map(mapCardRow)
}

export type StoreCondition = "new" | "used" | "opened"
export type StoreSaleType = "pre_order" | "ready_stock" | "normal"

export type StoreProductListFilters = {
  type?: "store"
  condition?: StoreCondition
  /** Multi-seleção da vitrine (o singular acima continua para chamadas antigas). */
  conditions?: StoreCondition[]
  categories?: string[]
  brands?: string[]
  search?: string
  priceMinCents?: number
  priceMaxCents?: number
  productIds?: string[]
  /** Usado pelo admin para achar produtos zerados sem trazer o catálogo inteiro. */
  outOfStockOnly?: boolean
  /** Filtra só produtos marcados como destaque (`is_featured`). */
  featured?: boolean
  /** Filtra só produtos fixados em "Mais vendidos" (`pin_best_seller`), ordenados por `best_seller_position`. */
  pinnedBestSellersOnly?: boolean
  saleType?: StoreSaleType
  /** Multi-seleção da vitrine (o singular acima continua para chamadas antigas). */
  saleTypes?: StoreSaleType[]
  /** Só produtos com preço promocional ativo. */
  promoOnly?: boolean
  /** Esconde esgotados (marcados na mão ou com estoque zerado). */
  inStockOnly?: boolean
  sort?: "recent" | "name-asc" | "name-desc" | "price-asc" | "price-desc"
  page?: number
  pageSize?: number
  /** true na versão admin — a pública sempre restringe a `is_active = true`. */
  includeInactive?: boolean
}

export type StoreProductListResult = {
  items: StoreProductCard[]
  total: number
}

/**
 * Preço que o cliente realmente paga: promocional quando existe, senão o cheio.
 * PostgREST não compara duas colunas, então a faixa vira uma árvore
 * `or(and(...),and(...))` — sem isso um produto de R$400 em promo por R$280
 * sumia do filtro "até R$300".
 */
function effectivePriceOr(op: "gte" | "lte", cents: number): string {
  return `and(promo_price_cents.not.is.null,promo_price_cents.${op}.${cents}),and(promo_price_cents.is.null,price_cents.${op}.${cents})`
}

/**
 * Listagem paginada de produtos da Loja, com filtros aplicados no
 * banco (mesmo padrão de `listOrdersForAdmin` em orders-repository.ts).
 * Usada por `/loja` e `/admin/store` — substitui `listActiveProducts()` +
 * filtro em memória no client, e o `select("*")` cru que a API admin fazia
 * fora da camada de repository.
 */
export async function listStoreProductsPaginated(
  filters: StoreProductListFilters
): Promise<StoreProductListResult> {
  const db = createSupabaseAdminClient()
  let query = db.from("store_products").select(CARD_COLUMNS, { count: "exact" })

  if (!filters.includeInactive) query = query.eq("is_active", true)
  if (filters.type) query = query.eq("type", filters.type)
  if (filters.condition) query = query.eq("condition", filters.condition)
  if (filters.categories?.length) query = query.in("category", filters.categories)
  if (filters.brands?.length) query = query.in("brand", filters.brands)
  if (filters.search?.trim()) {
    const term = escapeOrFilterValue(filters.search.trim())
    query = query.or(`name.ilike."%${term}%",brand.ilike."%${term}%"`)
  }
  if (filters.priceMinCents != null) query = query.or(effectivePriceOr("gte", filters.priceMinCents))
  if (filters.priceMaxCents != null) query = query.or(effectivePriceOr("lte", filters.priceMaxCents))
  if (filters.outOfStockOnly) query = query.eq("stock", 0)
  if (filters.featured) query = query.eq("is_featured", true)
  if (filters.pinnedBestSellersOnly) query = query.eq("pin_best_seller", true)
  if (filters.saleType) query = query.eq("sale_type", filters.saleType)
  if (filters.saleTypes?.length) query = query.in("sale_type", filters.saleTypes)
  if (filters.conditions?.length) query = query.in("condition", filters.conditions)
  if (filters.promoOnly) query = query.not("promo_price_cents", "is", null)
  if (filters.inStockOnly) query = query.eq("is_sold_out", false).or("stock.is.null,stock.gt.0")
  if (filters.productIds) {
    if (filters.productIds.length === 0) return { items: [], total: 0 }
    query = query.in("id", filters.productIds)
  }

  if (filters.pinnedBestSellersOnly) {
    query = query.order("best_seller_position", { ascending: true, nullsFirst: false })
  }

  switch (filters.sort) {
    case "name-asc":
      query = query.order("name", { ascending: true })
      break
    case "name-desc":
      query = query.order("name", { ascending: false })
      break
    case "price-asc":
      query = query.order("price_cents", { ascending: true })
      break
    case "price-desc":
      query = query.order("price_cents", { ascending: false })
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
    console.error("[store-repository] listStoreProductsPaginated:", error)
    return { items: [], total: 0 }
  }
  return { items: ((data ?? []) as unknown as RawCardRow[]).map(mapCardRow), total: count ?? 0 }
}

/**
 * Produtos mais vendidos nos últimos 90 dias, pela mesma RPC do card
 * "Produtos mais vendidos" do dashboard admin (get_top_selling_products,
 * ver dashboard-revenue-repository.ts) — soma unidades vendidas a partir de
 * `store_orders.items` (jsonb). A RPC pode devolver ids de itens de bazar
 * (cart-context também aceita type "bazaar"); como `listStoreProductsPaginated`
 * já filtra `type: "store"` e `is_active: true`, esses ids somem sozinhos.
 *
 * Produtos marcados com `pin_best_seller` (toggle manual em /admin/store)
 * entram na frente do ranking de vendas, na ordem definida em
 * `best_seller_position` (arrastar-e-soltar no painel "Mais vendidos" do
 * admin) — dá pro admin garantir que um produto específico apareça aqui
 * mesmo sem vendas suficientes nos últimos 90 dias, e na ordem que quiser.
 */
export async function listBestSellingProducts(limit = 12): Promise<StoreProductCard[]> {
  const db = createSupabaseAdminClient()
  const from = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  const [{ data: pinnedRows, error: pinnedError }, { data: rankedRows, error: rankedError }] = await Promise.all([
    db
      .from("store_products")
      .select("id")
      .eq("type", "store")
      .eq("pin_best_seller", true)
      .order("best_seller_position", { ascending: true, nullsFirst: false }),
    db.rpc("get_top_selling_products", {
      p_from: from.toISOString(),
      p_to: new Date().toISOString(),
      p_limit: limit,
    }),
  ])
  if (pinnedError) console.error("[store-repository] listBestSellingProducts (pinned):", pinnedError)
  if (rankedError) console.error("[store-repository] listBestSellingProducts (rpc):", rankedError)

  const pinnedIds = ((pinnedRows ?? []) as { id: string }[]).map((row) => row.id)
  const rankedIds = ((rankedRows ?? []) as { product_id: string }[]).map((row) => row.product_id)
  const orderedIds = [...pinnedIds, ...rankedIds.filter((id) => !pinnedIds.includes(id))].slice(0, limit)
  if (orderedIds.length === 0) return []

  const { items } = await listStoreProductsPaginated({ type: "store", productIds: orderedIds, pageSize: orderedIds.length })
  const rank = new Map(orderedIds.map((id, index) => [id, index]))
  return items
    .filter((item) => rank.has(item.id))
    .sort((a, b) => rank.get(a.id)! - rank.get(b.id)!)
}

/**
 * Regrava `best_seller_position` (0, 1, 2...) pra cada id na ordem recebida —
 * arrastar-e-soltar no painel "Mais vendidos" do admin. Mesmo padrão de
 * `reorderBanners` em store-banners-repository.ts. O filtro `pin_best_seller`
 * é só uma trava extra: a lista de ids já vem restrita aos fixados.
 */
export async function reorderPinnedBestSellers(orderedIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db.from("store_products").update({ best_seller_position: index }).eq("id", id).eq("pin_best_seller", true)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[store-repository] reorderPinnedBestSellers:", failed.error)
    throw failed.error
  }
}

/**
 * Busca leve pro dropdown "em tempo real" da barra de pesquisa — sem
 * `count: "exact"` (custo extra que o typeahead não precisa) e limitada a
 * poucos itens. Mesma lógica de match (`name`/`brand` ILIKE) de
 * `listStoreProductsPaginated`, só que sem paginação.
 */
export async function searchStoreProductsTop(
  searchTerm: string,
  limit = 5
): Promise<StoreProductCard[]> {
  const trimmed = searchTerm.trim()
  if (trimmed.length < 2) return []

  const db = createSupabaseAdminClient()
  const term = escapeOrFilterValue(trimmed)
  const { data, error } = await db
    .from("store_products")
    .select(CARD_COLUMNS)
    .eq("is_active", true)
    .or(`name.ilike."%${term}%",brand.ilike."%${term}%"`)
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[store-repository] searchStoreProductsTop:", error)
    return []
  }
  return ((data ?? []) as unknown as RawCardRow[]).map(mapCardRow)
}

/**
 * Contagem por opção de filtro, usada pra mostrar "(12)" ao lado de cada
 * faceta e pra esconder opção que não existe naquele recorte. Cada recorte
 * (catálogo inteiro / uma categoria / uma marca) tem o seu.
 */
export type StoreFacetCounts = {
  total: number
  brands: { brand: string; count: number }[]
  categories: { category: string; count: number }[]
  conditions: Record<StoreCondition, number>
  saleTypes: Record<StoreSaleType, number>
  promoCount: number
  inStockCount: number
  /** Preço efetivo (promo quando existe) — é o que o filtro de faixa compara. */
  priceMinCents: number
  priceMaxCents: number
}

export type StoreFilterOptions = {
  categories: string[]
  categoryCounts: Record<string, number>
  brands: string[]
  /**
   * Marcas por categoria, já ordenadas da mais frequente pra menos — alimenta
   * a coluna "Marcas" do mega menu da Loja. Sai da mesma query das outras
   * opções (cada linha já traz category + brand), sem custo extra.
   */
  brandsByCategory: Record<string, { brand: string; count: number }[]>
  /** Facetas do catálogo inteiro. */
  facets: StoreFacetCounts
  /** Facetas recortadas por categoria — landing de categoria só oferece o que existe ali. */
  facetsByCategory: Record<string, StoreFacetCounts>
  /** Facetas recortadas por marca — mesma ideia, para a landing de marca. */
  facetsByBrand: Record<string, StoreFacetCounts>
  priceMinCents: number
  priceMaxCents: number
  countByType: { store: number; all: number }
}

/**
 * Opções de filtro disponíveis (categorias, marcas, faixa de preço,
 * contagem por tipo) para a Loja. Query leve, pensada para ser
 * chamada por trás de cache (`revalidate` na página/rota chamadora).
 */
export async function getStoreFilterOptions(type?: "store"): Promise<StoreFilterOptions> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("store_products")
    .select("category, brand, price_cents, promo_price_cents, condition, sale_type, is_sold_out, stock, type")
    .eq("is_active", true)
  if (type) query = query.eq("type", type)

  const { data, error } = await query
  if (error) {
    console.error("[store-repository] getStoreFilterOptions:", error)
    return {
      categories: [],
      categoryCounts: {},
      brands: [],
      brandsByCategory: {},
      facets: emptyFacets(),
      facetsByCategory: {},
      facetsByBrand: {},
      priceMinCents: 0,
      priceMaxCents: 0,
      countByType: { store: 0, all: 0 },
    }
  }

  type FacetRow = {
    category: string | null
    brand: string | null
    price_cents: number
    promo_price_cents: number | null
    condition: StoreCondition
    sale_type: StoreSaleType | null
    is_sold_out: boolean
    stock: number | null
    type: "store"
  }
  const rows = (data ?? []) as unknown as FacetRow[]
  const categories = new Set<string>()
  const categoryCounts: Record<string, number> = {}
  const brands = new Set<string>()
  const countByType = { store: 0, all: 0 }

  const all = createFacetAccumulator()
  const byCategory = new Map<string, FacetAccumulator>()
  const byBrand = new Map<string, FacetAccumulator>()

  for (const row of rows) {
    if (row.category) {
      categories.add(row.category)
      categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1
    }
    if (row.brand) brands.add(row.brand)
    countByType[row.type] += 1
    countByType.all += 1

    accumulateFacet(all, row)
    if (row.category) {
      let acc = byCategory.get(row.category)
      if (!acc) byCategory.set(row.category, (acc = createFacetAccumulator()))
      accumulateFacet(acc, row)
    }
    if (row.brand) {
      let acc = byBrand.get(row.brand)
      if (!acc) byBrand.set(row.brand, (acc = createFacetAccumulator()))
      accumulateFacet(acc, row)
    }
  }

  const facets = finalizeFacets(all)
  const facetsByCategory: Record<string, StoreFacetCounts> = {}
  for (const [category, acc] of byCategory) facetsByCategory[category] = finalizeFacets(acc)
  const facetsByBrand: Record<string, StoreFacetCounts> = {}
  for (const [brand, acc] of byBrand) facetsByBrand[brand] = finalizeFacets(acc)

  // O mega menu já consumia essa forma antes das facetas existirem — sai delas
  // agora em vez de um segundo acumulador com a mesma contagem.
  const brandsByCategory: Record<string, { brand: string; count: number }[]> = {}
  for (const [category, categoryFacets] of Object.entries(facetsByCategory)) {
    brandsByCategory[category] = categoryFacets.brands
  }

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    categoryCounts,
    brands: [...brands].sort((a, b) => a.localeCompare(b)),
    brandsByCategory,
    facets,
    facetsByCategory,
    facetsByBrand,
    priceMinCents: facets.priceMinCents,
    priceMaxCents: facets.priceMaxCents,
    countByType,
  }
}

type FacetAccumulator = {
  total: number
  brands: Record<string, number>
  categories: Record<string, number>
  conditions: Record<StoreCondition, number>
  saleTypes: Record<StoreSaleType, number>
  promoCount: number
  inStockCount: number
  priceMinCents: number
  priceMaxCents: number
}

function createFacetAccumulator(): FacetAccumulator {
  return {
    total: 0,
    brands: {},
    categories: {},
    conditions: { new: 0, opened: 0, used: 0 },
    saleTypes: { ready_stock: 0, pre_order: 0, normal: 0 },
    promoCount: 0,
    inStockCount: 0,
    priceMinCents: Infinity,
    priceMaxCents: 0,
  }
}

function accumulateFacet(
  acc: FacetAccumulator,
  row: {
    category: string | null
    brand: string | null
    price_cents: number
    promo_price_cents: number | null
    condition: StoreCondition
    sale_type: StoreSaleType | null
    is_sold_out: boolean
    stock: number | null
  }
): void {
  acc.total += 1
  if (row.brand) acc.brands[row.brand] = (acc.brands[row.brand] ?? 0) + 1
  if (row.category) acc.categories[row.category] = (acc.categories[row.category] ?? 0) + 1
  if (row.condition in acc.conditions) acc.conditions[row.condition] += 1
  const saleType = row.sale_type ?? "normal"
  if (saleType in acc.saleTypes) acc.saleTypes[saleType] += 1
  const hasPromo = row.promo_price_cents != null && row.promo_price_cents < row.price_cents
  if (hasPromo) acc.promoCount += 1
  if (!row.is_sold_out && (row.stock == null || row.stock > 0)) acc.inStockCount += 1
  const effective = hasPromo ? row.promo_price_cents! : row.price_cents
  acc.priceMinCents = Math.min(acc.priceMinCents, effective)
  acc.priceMaxCents = Math.max(acc.priceMaxCents, effective)
}

function finalizeFacets(acc: FacetAccumulator): StoreFacetCounts {
  return {
    total: acc.total,
    brands: Object.entries(acc.brands)
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand)),
    categories: Object.entries(acc.categories)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category)),
    conditions: acc.conditions,
    saleTypes: acc.saleTypes,
    promoCount: acc.promoCount,
    inStockCount: acc.inStockCount,
    priceMinCents: Number.isFinite(acc.priceMinCents) ? acc.priceMinCents : 0,
    priceMaxCents: acc.priceMaxCents,
  }
}

function emptyFacets(): StoreFacetCounts {
  return finalizeFacets(createFacetAccumulator())
}

/**
 * Produtos em destaque para a home (ativos e com estoque, ou sem controle de
 * estoque). Prioriza os marcados manualmente pelo admin (`is_featured`) e
 * completa o restante das vagas com os mais recentes.
 */
export async function listFeaturedProducts(limit = 6): Promise<FeaturedProduct[]> {
  const db = createSupabaseAdminClient()
  const FEATURED_COLUMNS = "id, slug, name, price_cents, images, type, condition"

  const { data: featuredData, error: featuredError } = await db
    .from("store_products")
    .select(FEATURED_COLUMNS)
    .eq("type", "store")
    .eq("is_active", true)
    .eq("is_sold_out", false)
    .eq("is_featured", true)
    .or("stock.is.null,stock.gt.0")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (featuredError) {
    console.error("[store-repository] listFeaturedProducts (featured):", featuredError)
    return []
  }

  const featured = (featuredData ?? []) as unknown as FeaturedProduct[]
  if (featured.length >= limit) return featured

  let recentQuery = db
    .from("store_products")
    .select(FEATURED_COLUMNS)
    .eq("type", "store")
    .eq("is_active", true)
    .eq("is_sold_out", false)
    .or("stock.is.null,stock.gt.0")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (featured.length > 0) {
    recentQuery = recentQuery.not("id", "in", `(${featured.map((p) => p.id).join(",")})`)
  }

  const { data: recentData, error: recentError } = await recentQuery
  if (recentError) {
    console.error("[store-repository] listFeaturedProducts (recent):", recentError)
    return featured
  }

  const recent = (recentData ?? []) as unknown as FeaturedProduct[]
  return [...featured, ...recent].slice(0, limit)
}

type RawLinkedProductRow = Omit<LinkedProduct, "price_cents_min" | "price_cents_max"> & {
  promo_price_cents: number | null
  variants: { price_cents_override: number | null; promo_price_cents: number | null }[] | null
}

type RawLinkedProductJoinRow = {
  store_products: RawLinkedProductRow | RawLinkedProductRow[] | null
}

/** Menor preço "efetivo" entre base e promo — a promo só vale se for de fato mais barata. */
function effectivePriceCents(priceCents: number, promoPriceCents: number | null): number {
  return promoPriceCents != null && promoPriceCents < priceCents ? promoPriceCents : priceCents
}

function mapLinkedProductRow({ variants, promo_price_cents, ...rest }: RawLinkedProductRow): LinkedProduct {
  const basePrice = effectivePriceCents(rest.price_cents, promo_price_cents)
  const variantPrices = (variants ?? []).map((v) =>
    effectivePriceCents(v.price_cents_override ?? rest.price_cents, v.promo_price_cents)
  )
  const allPrices = variantPrices.length > 0 ? variantPrices : [basePrice]
  return {
    ...rest,
    price_cents_min: Math.min(...allPrices),
    price_cents_max: Math.max(...allPrices),
  }
}

/** Produtos ativos vinculados a um periférico (página de detalhe). */
export async function listProductsByPeripheral(peripheralId: string): Promise<LinkedProduct[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_peripherals")
    .select(
      "store_products!inner(id, slug, name, type, price_cents, promo_price_cents, images, stock, is_active, is_sold_out, variants:store_product_variants(price_cents_override, promo_price_cents))"
    )
    .eq("peripheral_id", peripheralId)
    .eq("store_products.is_active", true)
    .order("position", { ascending: true })

  if (error) {
    console.error("[store-repository] listProductsByPeripheral:", error)
    return []
  }

  return ((data ?? []) as unknown as RawLinkedProductJoinRow[])
    .map((row) => (Array.isArray(row.store_products) ? row.store_products[0] : row.store_products))
    .filter((product): product is RawLinkedProductRow => product != null)
    .map(mapLinkedProductRow)
}

export type StoreProductDetail = {
  id: string
  slug: string
  name: string
  description: string | null
  price_cents: number
  promo_price_cents: number | null
  /** `null` = sem controle de estoque (nunca esgota). */
  stock: number | null
  images: string[]
  category: string | null
  brand: string | null
  type: "store"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  sale_type: "pre_order" | "ready_stock" | "normal"
  is_sold_out: boolean
  peripheral_id: string | null
  features: string[]
  video_url: string | null
}

export type StoreProductSpec = {
  id: string
  label: string
  value: string
  position: number
}

export type LinkedPeripheralRef = {
  id: string
  name: string
  brand: string
  image_url: string | null
  rank: PeripheralRank | null
}

export type StoreProductDetailResult = {
  product: StoreProductDetail
  linkedPeripheral: LinkedPeripheralRef | null
  linkedPeripherals: LinkedPeripheralRef[]
  specs: StoreProductSpec[]
  variants: StoreProductVariant[]
  variantGroups: StoreProductVariantGroup[]
  /** Pares (cor, opção) esgotados — só relevante quando o produto tem Cor e Variante juntos. */
  combinations: StoreProductVariantCombination[]
}

/**
 * Detalhe de um produto da Loja pelo slug, já com o periférico relacionado.
 * Consome a página de detalhe.
 *
 * `React.cache`: dispara 6 queries; `generateMetadata` e a página chamam com
 * o mesmo slug na mesma requisição — sem isso, dobra tudo por visita.
 */
/**
 * Slugs dos produtos ativos da Loja, para o sitemap.
 *
 * Mesmos filtros de `getStoreProductDetail` (`type=store` + `is_active`):
 * enviar ao Google uma URL que responde 404 gasta orçamento de rastreio e
 * derruba a confiança no sitemap inteiro.
 */
export async function listAllStoreSlugsForSitemap(): Promise<{ slug: string; updated_at: string | null }[]> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("store_products")
    .select("slug, updated_at")
    .eq("type", "store")
    .eq("is_active", true)

  if (error) {
    console.error("[store-repository] listAllStoreSlugsForSitemap:", error)
    return []
  }

  return (data ?? []).map((p) => ({ slug: p.slug, updated_at: p.updated_at ?? null }))
}

export const getStoreProductDetail = cache(async (
  slug: string
): Promise<StoreProductDetailResult | null> => {
  const db = createSupabaseAdminClient()

  const { data: product, error } = await db
    .from("store_products")
    .select(
      "id, slug, name, description, price_cents, promo_price_cents, stock, images, category, brand, type, condition, condition_notes, sale_type, is_sold_out, peripheral_id, features, video_url"
    )
    .eq("slug", slug)
    .eq("type", "store")
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    console.error("[store-repository] getStoreProductDetail:", error)
    return null
  }
  if (!product) return null

  const detail = product as unknown as StoreProductDetail
  let linkedPeripheral: LinkedPeripheralRef | null = null

  const [specsResult, variantsResult, variantGroupsResult, combinationsResult, peripheralsResult, peripheralResult] =
    await Promise.all([
    db
      .from("store_product_specs")
      .select("id, label, value, position")
      .eq("product_id", detail.id)
      .order("position", { ascending: true }),
    db
      .from("store_product_variants")
      .select(
        "id, label, price_cents_override, promo_price_cents, stock, position, color, icon, image_url, is_sold_out, variant_images:store_product_variant_images(url, position)"
      )
      .eq("product_id", detail.id)
      .eq("is_active", true)
      // `id` como desempate: variantes soft-deletadas guardam a posição antiga
      // e podem empatar com uma ativa reindexada (ver replaceProductVariants).
      // Sem critério estável, o Postgres devolve empates em ordem arbitrária e
      // as cores trocam de lugar entre requisições.
      .order("position", { ascending: true })
      .order("id", { ascending: true }),
    db
      .from("store_product_variant_groups")
      .select(
        "id, name, position, options:store_product_variant_group_options(id, label, price_cents_override, is_sold_out, position)"
      )
      .eq("product_id", detail.id)
      .order("position", { ascending: true }),
    db
      .from("store_product_variant_combinations")
      .select("variant_id, option_id")
      .eq("product_id", detail.id),
    db
      .from("store_product_peripherals")
      .select("position, peripherals(id, name, brand_id, brands(name), image_url)")
      .eq("product_id", detail.id)
      .order("position", { ascending: true }),
    detail.peripheral_id
      ? db
          .from("peripherals")
          .select("id, name, brand_id, brands(name), image_url")
          .eq("id", detail.peripheral_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const specs = (specsResult.data ?? []) as unknown as StoreProductSpec[]
  type RawVariantRow = Omit<StoreProductVariant, "images"> & {
    variant_images: { url: string; position: number }[] | null
  }
  const variants = ((variantsResult.data ?? []) as unknown as RawVariantRow[]).map(
    ({ variant_images, ...rest }): StoreProductVariant => ({
      ...rest,
      images: [...(variant_images ?? [])].sort((a, b) => a.position - b.position).map((img) => img.url),
    })
  )

  const variantGroups = ((variantGroupsResult.data ?? []) as unknown as StoreProductVariantGroup[]).map((g) => ({
    ...g,
    options: [...(g.options ?? [])].sort((a, b) => a.position - b.position),
  }))

  const combinations = (combinationsResult.data ?? []) as unknown as StoreProductVariantCombination[]

  type PeripheralJoinRow = {
    peripherals: { id: string; name: string; brand_id: string; brands: { name: string } | { name: string }[] | null; image_url: string | null } | null
  }
  const linkedPeripheralRows = ((peripheralsResult.data ?? []) as unknown as PeripheralJoinRow[])
    .map((row) => row.peripherals)
    .filter((p): p is NonNullable<PeripheralJoinRow["peripherals"]> => p !== null)

  const peripheralRow = (peripheralResult?.data ?? null) as unknown as
    | { id: string; name: string; brand_id: string; brands: { name: string } | { name: string }[] | null; image_url: string | null }
    | null

  // Ranking de cada periférico vinculado (M:N + o FK único, se houver e não
  // duplicar um já presente na lista M:N) buscados em paralelo.
  const idsToRank = Array.from(
    new Set([...linkedPeripheralRows.map((p) => p.id), ...(peripheralRow ? [peripheralRow.id] : [])])
  )
  const ranks = new Map<string, PeripheralRank | null>(
    await Promise.all(idsToRank.map(async (id) => [id, await getPeripheralRankById(id)] as const))
  )

  const linkedPeripherals = linkedPeripheralRows.map((p) => ({
    id: p.id,
    name: p.name,
    brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands)?.name ?? "",
    image_url: p.image_url,
    rank: ranks.get(p.id) ?? null,
  }))

  linkedPeripheral = peripheralRow
    ? {
        id: peripheralRow.id,
        name: peripheralRow.name,
        brand: (Array.isArray(peripheralRow.brands) ? peripheralRow.brands[0] : peripheralRow.brands)?.name ?? "",
        image_url: peripheralRow.image_url,
        rank: ranks.get(peripheralRow.id) ?? null,
      }
    : null

  return { product: detail, linkedPeripheral, linkedPeripherals, specs, variants, variantGroups, combinations }
})

/** Lista variantes de um produto (usado pela API admin ao editar). */
export async function listProductVariants(
  productId: string,
  opts?: { includeInactive?: boolean }
): Promise<StoreProductVariant[]> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("store_product_variants")
    .select(
      "id, label, price_cents_override, promo_price_cents, stock, position, color, icon, image_url, is_sold_out, variant_images:store_product_variant_images(url, position)"
    )
    .eq("product_id", productId)
    // Mesmo desempate de getStoreProductDetail: posição pode empatar entre uma
    // ativa e uma soft-deletada antiga.
    .order("position", { ascending: true })
    .order("id", { ascending: true })

  if (!opts?.includeInactive) {
    query = query.eq("is_active", true)
  }

  const { data, error } = await query
  if (error) {
    console.error("[store-repository] listProductVariants:", error)
    return []
  }
  type RawVariantRow = Omit<StoreProductVariant, "images"> & {
    variant_images: { url: string; position: number }[] | null
  }
  return ((data ?? []) as unknown as RawVariantRow[]).map(
    ({ variant_images, ...rest }): StoreProductVariant => ({
      ...rest,
      images: [...(variant_images ?? [])].sort((a, b) => a.position - b.position).map((img) => img.url),
    })
  )
}

/** Lista grupos de variantes (Switch, Voltagem...) de um produto, usado pela API admin ao editar. */
export async function listProductVariantGroups(productId: string): Promise<StoreProductVariantGroup[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_variant_groups")
    .select(
      "id, name, position, options:store_product_variant_group_options(id, label, price_cents_override, is_sold_out, position)"
    )
    .eq("product_id", productId)
    .order("position", { ascending: true })

  if (error) {
    console.error("[store-repository] listProductVariantGroups:", error)
    return []
  }
  return ((data ?? []) as unknown as StoreProductVariantGroup[]).map((g) => ({
    ...g,
    options: [...(g.options ?? [])].sort((a, b) => a.position - b.position),
  }))
}

export type StoreProductVariantCombination = {
  variant_id: string
  option_id: string
}

/** Lista as combinações Cor × Variante marcadas como esgotadas de um produto, usado pela API admin ao editar. */
export async function listProductVariantCombinations(productId: string): Promise<StoreProductVariantCombination[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_variant_combinations")
    .select("variant_id, option_id")
    .eq("product_id", productId)

  if (error) {
    console.error("[store-repository] listProductVariantCombinations:", error)
    return []
  }
  return (data ?? []) as unknown as StoreProductVariantCombination[]
}

/**
 * Substitui as combinações Cor × Variante esgotadas de um produto — usado
 * pela API admin ao salvar. A existência da linha já significa "esgotado"
 * (sem coluna booleana), então é delete-then-insert escopado por produto,
 * igual replaceProductSpecs. Filtra os pares recebidos contra as
 * variantes/opções que de fato pertencem ao produto, evitando referenciar
 * ids de outro produto.
 */
export async function replaceProductVariantCombinations(
  productId: string,
  pairs: Array<{ variant_id: string; option_id: string }>
): Promise<void> {
  const db = createSupabaseAdminClient()

  const [{ data: productVariants, error: variantsError }, { data: productGroups, error: groupsError }] =
    await Promise.all([
      db.from("store_product_variants").select("id").eq("product_id", productId).eq("is_active", true),
      db.from("store_product_variant_groups").select("id").eq("product_id", productId),
    ])
  if (variantsError || groupsError) {
    console.error("[store-repository] replaceProductVariantCombinations list:", variantsError ?? groupsError)
    throw new Error("Erro ao atualizar combinações.")
  }

  const groupIds = (productGroups ?? []).map((row) => row.id as string)
  let productOptionIds = new Set<string>()
  if (groupIds.length > 0) {
    const { data: productOptions, error: optionsError } = await db
      .from("store_product_variant_group_options")
      .select("id")
      .in("group_id", groupIds)
    if (optionsError) {
      console.error("[store-repository] replaceProductVariantCombinations list options:", optionsError)
      throw new Error("Erro ao atualizar combinações.")
    }
    productOptionIds = new Set((productOptions ?? []).map((row) => row.id as string))
  }

  const productVariantIds = new Set((productVariants ?? []).map((row) => row.id as string))
  const validPairs = pairs.filter((p) => productVariantIds.has(p.variant_id) && productOptionIds.has(p.option_id))

  const { error: deleteError } = await db
    .from("store_product_variant_combinations")
    .delete()
    .eq("product_id", productId)
  if (deleteError) {
    console.error("[store-repository] replaceProductVariantCombinations delete:", deleteError)
    throw new Error("Erro ao atualizar combinações.")
  }

  if (validPairs.length === 0) return

  const { error: insertError } = await db.from("store_product_variant_combinations").insert(
    validPairs.map((p) => ({ product_id: productId, variant_id: p.variant_id, option_id: p.option_id }))
  )
  if (insertError) {
    console.error("[store-repository] replaceProductVariantCombinations insert:", insertError)
    throw new Error("Erro ao atualizar combinações.")
  }
}

/** Busca combinações Cor × Variante esgotadas entre os ids informados, para validar no checkout. */
export async function getSoldOutCombinations(
  variantIds: string[],
  optionIds: string[]
): Promise<StoreProductVariantCombination[]> {
  if (variantIds.length === 0 || optionIds.length === 0) return []
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_variant_combinations")
    .select("variant_id, option_id")
    .in("variant_id", variantIds)
    .in("option_id", optionIds)

  if (error) {
    console.error("[store-repository] getSoldOutCombinations:", error)
    return []
  }
  return (data ?? []) as unknown as StoreProductVariantCombination[]
}

export type CheckoutVariant = {
  id: string
  product_id: string
  label: string
  price_cents_override: number | null
  /** `null` = sem controle de estoque (nunca esgota). */
  stock: number | null
  is_active: boolean
  is_sold_out: boolean
}

/** Busca variantes por id, para validação de estoque/preço no checkout. */
export async function getVariantsForCheckout(variantIds: string[]): Promise<CheckoutVariant[]> {
  if (variantIds.length === 0) return []
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_variants")
    .select("id, product_id, label, price_cents_override, stock, is_active, is_sold_out")
    .in("id", variantIds)

  if (error) {
    console.error("[store-repository] getVariantsForCheckout:", error)
    return []
  }
  return (data ?? []) as unknown as CheckoutVariant[]
}

export type CheckoutVariantOption = {
  id: string
  label: string
  price_cents_override: number | null
  is_sold_out: boolean
  group: { id: string; name: string; position: number; product_id: string }
}

/** Busca opções de grupos de variante por id, para validar/precificar no checkout. */
export async function getVariantOptionsForCheckout(optionIds: string[]): Promise<CheckoutVariantOption[]> {
  if (optionIds.length === 0) return []
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_variant_group_options")
    .select(
      "id, label, price_cents_override, is_sold_out, group:store_product_variant_groups(id, name, position, product_id)"
    )
    .in("id", optionIds)

  if (error) {
    console.error("[store-repository] getVariantOptionsForCheckout:", error)
    return []
  }
  type RawRow = Omit<CheckoutVariantOption, "group"> & {
    group: CheckoutVariantOption["group"] | CheckoutVariantOption["group"][] | null
  }
  return ((data ?? []) as unknown as RawRow[])
    .map((row) => ({ ...row, group: Array.isArray(row.group) ? row.group[0] : row.group }))
    .filter((row): row is CheckoutVariantOption => row.group != null)
}

const MAX_VARIANT_GROUPS_PER_PRODUCT = 6
const MAX_OPTIONS_PER_VARIANT_GROUP = 12

/**
 * Substitui os grupos de variantes (e suas opções) de um produto — usado
 * pela API admin ao salvar. Upsert-com-diff (mesmo padrão de
 * replaceProductVariants): preserva o id de grupos/opções já existentes,
 * porque agora store_product_variant_combinations referencia option_id por
 * FK — um delete-then-insert total apagaria (cascade) a matriz de
 * combinações a cada save do produto, mesmo sem mudança real. Grupos/opções
 * removidos são hard-deleted (nada mais referencia essas linhas, e o cascade
 * cuida de limpar combinações associadas).
 */
export async function replaceProductVariantGroups(
  productId: string,
  groups: Array<{
    id?: string
    name: string
    options: Array<{ id?: string; label: string; price_cents_override: number | null; is_sold_out: boolean }>
  }>
): Promise<Array<{ id: string; position: number; options: Array<{ id: string; position: number }> }>> {
  if (groups.length > MAX_VARIANT_GROUPS_PER_PRODUCT) {
    throw new Error(`Cada produto pode ter no máximo ${MAX_VARIANT_GROUPS_PER_PRODUCT} grupos de variantes.`)
  }
  for (const g of groups) {
    if (g.options.length > MAX_OPTIONS_PER_VARIANT_GROUP) {
      throw new Error(`Cada grupo de variantes pode ter no máximo ${MAX_OPTIONS_PER_VARIANT_GROUP} opções.`)
    }
  }

  const db = createSupabaseAdminClient()

  const { data: existingGroups, error: existingError } = await db
    .from("store_product_variant_groups")
    .select("id")
    .eq("product_id", productId)
  if (existingError) {
    console.error("[store-repository] replaceProductVariantGroups list:", existingError)
    throw new Error("Erro ao atualizar variantes.")
  }

  const existingGroupIds = new Set((existingGroups ?? []).map((row) => row.id as string))
  const incomingGroupIds = new Set(
    groups.filter((g) => g.id && existingGroupIds.has(g.id)).map((g) => g.id as string)
  )
  const groupsToDelete = [...existingGroupIds].filter((id) => !incomingGroupIds.has(id))

  if (groupsToDelete.length > 0) {
    const { error } = await db.from("store_product_variant_groups").delete().in("id", groupsToDelete)
    if (error) {
      console.error("[store-repository] replaceProductVariantGroups delete groups:", error)
      throw new Error("Erro ao atualizar variantes.")
    }
  }

  const result: Array<{ id: string; position: number; options: Array<{ id: string; position: number }> }> = []

  for (let position = 0; position < groups.length; position++) {
    const g = groups[position]
    let groupId = g.id && existingGroupIds.has(g.id) ? g.id : null

    if (groupId) {
      const { error } = await db
        .from("store_product_variant_groups")
        .update({ name: g.name, position })
        .eq("id", groupId)
      if (error) {
        console.error("[store-repository] replaceProductVariantGroups update group:", error)
        throw new Error("Erro ao atualizar variantes.")
      }
    } else {
      const { data: inserted, error } = await db
        .from("store_product_variant_groups")
        .insert({ product_id: productId, name: g.name, position })
        .select("id")
        .single()
      if (error || !inserted) {
        console.error("[store-repository] replaceProductVariantGroups insert group:", error)
        throw new Error("Erro ao atualizar variantes.")
      }
      groupId = inserted.id as string
    }

    const { data: existingOptions, error: existingOptionsError } = await db
      .from("store_product_variant_group_options")
      .select("id")
      .eq("group_id", groupId)
    if (existingOptionsError) {
      console.error("[store-repository] replaceProductVariantGroups list options:", existingOptionsError)
      throw new Error("Erro ao atualizar variantes.")
    }

    const existingOptionIds = new Set((existingOptions ?? []).map((row) => row.id as string))
    const incomingOptionIds = new Set(
      g.options.filter((o) => o.id && existingOptionIds.has(o.id)).map((o) => o.id as string)
    )
    const optionsToDelete = [...existingOptionIds].filter((id) => !incomingOptionIds.has(id))
    if (optionsToDelete.length > 0) {
      const { error } = await db.from("store_product_variant_group_options").delete().in("id", optionsToDelete)
      if (error) {
        console.error("[store-repository] replaceProductVariantGroups delete options:", error)
        throw new Error("Erro ao atualizar variantes.")
      }
    }

    const groupOptions: Array<{ id: string; position: number }> = []
    for (let optionPosition = 0; optionPosition < g.options.length; optionPosition++) {
      const o = g.options[optionPosition]
      const optionId = o.id && existingOptionIds.has(o.id) ? o.id : null

      if (optionId) {
        const { error } = await db
          .from("store_product_variant_group_options")
          .update({
            label: o.label,
            price_cents_override: o.price_cents_override,
            is_sold_out: o.is_sold_out,
            position: optionPosition,
          })
          .eq("id", optionId)
        if (error) {
          console.error("[store-repository] replaceProductVariantGroups update option:", error)
          throw new Error("Erro ao atualizar variantes.")
        }
        groupOptions.push({ id: optionId, position: optionPosition })
      } else {
        const { data: inserted, error } = await db
          .from("store_product_variant_group_options")
          .insert({
            group_id: groupId,
            label: o.label,
            price_cents_override: o.price_cents_override,
            is_sold_out: o.is_sold_out,
            position: optionPosition,
          })
          .select("id")
          .single()
        if (error || !inserted) {
          console.error("[store-repository] replaceProductVariantGroups insert option:", error)
          throw new Error("Erro ao atualizar variantes.")
        }
        groupOptions.push({ id: inserted.id as string, position: optionPosition })
      }
    }

    result.push({ id: groupId, position, options: groupOptions })
  }

  return result
}

/** Limite diário (janela de 24h corridas) de unidades por produto e por usuário,
 * aplicado só a produtos sem controle de estoque (ver checkout/route.ts). */
export const DAILY_PURCHASE_LIMIT_NO_STOCK = 15

/**
 * Quantidade já comprada por um usuário de um produto específico nas
 * últimas 24h, via RPC (soma o campo `quantity` dentro de `store_orders.items`,
 * ignorando pedidos cancelados/expirados — ver
 * 20260921000009_store_daily_purchase_limit.sql). Usada pelo checkout só
 * para produtos sem estoque cadastrado, onde não há outro teto natural.
 */
export async function getRecentProductPurchaseQuantity(userId: string, productId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { data, error } = await db.rpc("get_recent_product_purchase_quantity", {
    p_user_id: userId,
    p_product_id: productId,
    p_since: since,
  })

  if (error) {
    console.error("[store-repository] getRecentProductPurchaseQuantity:", error)
    return 0
  }
  return data ?? 0
}

export type PriceHistoryPoint = {
  id: string
  variant_id: string | null
  price_cents: number
  promo_price_cents: number | null
  final_price_cents: number
  created_at: string
}

/**
 * Grava um snapshot no histórico de preço (produto ou variante, conforme
 * `variantId`) só quando o preço final (`promoPriceCents ?? priceCents`)
 * difere do último snapshot gravado — evita duplicar linha idêntica a cada
 * save do admin que não mexeu em preço. Usada tanto pela rota PATCH do
 * produto (variantId null) quanto por `replaceProductVariants` (por variante).
 */
export async function recordPriceHistoryIfChanged(
  productId: string,
  variantId: string | null,
  priceCents: number,
  promoPriceCents: number | null,
  adminId: string | null = null
): Promise<void> {
  const db = createSupabaseAdminClient()
  const finalPriceCents = promoPriceCents ?? priceCents

  let lastQuery = db
    .from("store_product_price_history")
    .select("final_price_cents")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })
    .limit(1)
  lastQuery = variantId ? lastQuery.eq("variant_id", variantId) : lastQuery.is("variant_id", null)

  const { data: last, error: lastError } = await lastQuery.maybeSingle()
  if (lastError) {
    console.error("[store-repository] recordPriceHistoryIfChanged read:", lastError)
    return
  }
  if (last && last.final_price_cents === finalPriceCents) return

  const { error: insertError } = await db.from("store_product_price_history").insert({
    product_id: productId,
    variant_id: variantId,
    price_cents: priceCents,
    promo_price_cents: promoPriceCents,
    final_price_cents: finalPriceCents,
    changed_by: adminId,
  })
  if (insertError) {
    console.error("[store-repository] recordPriceHistoryIfChanged insert:", insertError)
  }
}

/** Histórico de preço de um produto (base + variantes), para o gráfico admin. */
export async function getPriceHistory(productId: string): Promise<PriceHistoryPoint[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_price_history")
    .select("id, variant_id, price_cents, promo_price_cents, final_price_cents, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[store-repository] getPriceHistory:", error)
    return []
  }
  return (data ?? []) as unknown as PriceHistoryPoint[]
}

const MAX_VARIANTS_PER_PRODUCT = 12
const MAX_IMAGES_PER_VARIANT = 3

/**
 * Substitui as variantes de um produto (usado pela API admin ao salvar).
 * Diferente de replaceProductSpecs: faz upsert-com-diff (não delete-then-
 * insert) para preservar o id das variantes já existentes — pedidos
 * guardam variant_id, e trocar o id a cada save orfanaria essa referência.
 * Variantes removidas da lista são soft-deleted (is_active = false), nunca
 * apagadas de fato. Ao final, mantém store_products.stock como a soma dos
 * estoques das variantes ativas (fallback usado por telas que só conhecem
 * o produto, ex. listagem/dashboard admin) — ou null se QUALQUER variante
 * ativa estiver sem controle de estoque, já que nesse caso o total deixa de
 * ser um número confiável.
 */
export async function replaceProductVariants(
  productId: string,
  variants: Array<{
    id?: string
    label: string
    price_cents_override: number | null
    promo_price_cents: number | null
    stock: number | null
    color: string | null
    icon: string | null
    image_url: string | null
    images: string[]
    is_sold_out: boolean
  }>,
  adminId: string | null = null
): Promise<Array<{ id: string; position: number }>> {
  if (variants.length > MAX_VARIANTS_PER_PRODUCT) {
    throw new Error(`Cada produto pode ter no máximo ${MAX_VARIANTS_PER_PRODUCT} variantes.`)
  }
  for (const v of variants) {
    if (v.images.length > MAX_IMAGES_PER_VARIANT) {
      throw new Error(`Cada variante pode ter no máximo ${MAX_IMAGES_PER_VARIANT} imagens.`)
    }
  }

  const db = createSupabaseAdminClient()

  const { data: existing, error: existingError } = await db
    .from("store_product_variants")
    .select("id")
    .eq("product_id", productId)
  if (existingError) {
    console.error("[store-repository] replaceProductVariants list:", existingError)
    throw new Error("Erro ao atualizar variantes.")
  }

  const existingIds = new Set((existing ?? []).map((row) => row.id as string))
  const incomingIds = new Set(variants.filter((v) => v.id && existingIds.has(v.id)).map((v) => v.id as string))

  const toUpdate = variants
    .map((v, index) => ({ ...v, position: index }))
    .filter((v): v is typeof v & { id: string } => Boolean(v.id) && existingIds.has(v.id as string))
  const toInsert = variants
    .map((v, index) => ({ ...v, position: index }))
    .filter((v) => !v.id || !existingIds.has(v.id))
  const toDeactivate = [...existingIds].filter((id) => !incomingIds.has(id))

  for (const v of toUpdate) {
    const { error } = await db
      .from("store_product_variants")
      .update({
        label: v.label,
        price_cents_override: v.price_cents_override,
        promo_price_cents: v.promo_price_cents,
        stock: v.stock,
        position: v.position,
        is_active: true,
        color: v.color,
        icon: v.icon,
        image_url: v.image_url,
        is_sold_out: v.is_sold_out,
      })
      .eq("id", v.id)
    if (error) {
      console.error("[store-repository] replaceProductVariants update:", error)
      throw new Error("Erro ao atualizar variantes.")
    }
  }

  let insertedIds: string[] = []
  if (toInsert.length > 0) {
    const rows = toInsert.map((v) => ({
      product_id: productId,
      label: v.label,
      price_cents_override: v.price_cents_override,
      promo_price_cents: v.promo_price_cents,
      stock: v.stock,
      position: v.position,
      color: v.color,
      icon: v.icon,
      image_url: v.image_url,
      is_sold_out: v.is_sold_out,
    }))
    const { data: inserted, error } = await db.from("store_product_variants").insert(rows).select("id")
    if (error) {
      console.error("[store-repository] replaceProductVariants insert:", error)
      throw new Error("Erro ao atualizar variantes.")
    }
    insertedIds = (inserted ?? []).map((row) => row.id as string)
  }

  if (toDeactivate.length > 0) {
    // `position` das ativas é reatribuído por índice (0..n-1) a cada save, mas
    // a variante desativada mantinha a posição antiga — duas linhas do mesmo
    // produto acabavam com a mesma posição e o empate embaralhava a ordem das
    // cores na página. Jogar as inativas para fora da faixa das ativas mantém
    // `position` único entre as que aparecem.
    const { error } = await db
      .from("store_product_variants")
      .update({ is_active: false, position: MAX_VARIANTS_PER_PRODUCT + 1 })
      .in("id", toDeactivate)
    if (error) {
      console.error("[store-repository] replaceProductVariants deactivate:", error)
      throw new Error("Erro ao atualizar variantes.")
    }
  }

  // Sincroniza as imagens extras (galeria) de cada variante com id conhecido
  // — delete-then-insert por variante, mesmo padrão de replaceProductSpecs.
  // Variantes novas (sem id ainda no momento do update acima) usam o id
  // recém-inserido, na mesma ordem de toInsert.
  const variantsWithImages = [
    ...toUpdate,
    ...toInsert.map((v, i) => ({ ...v, id: insertedIds[i] as string | undefined })),
  ].filter((v): v is typeof v & { id: string } => Boolean(v.id))

  for (const v of variantsWithImages) {
    const { error: deleteImagesError } = await db
      .from("store_product_variant_images")
      .delete()
      .eq("variant_id", v.id)
    if (deleteImagesError) {
      console.error("[store-repository] replaceProductVariants delete images:", deleteImagesError)
      throw new Error("Erro ao atualizar imagens da variante.")
    }
    if (v.images.length > 0) {
      const { error: insertImagesError } = await db.from("store_product_variant_images").insert(
        v.images.map((url, position) => ({ variant_id: v.id, url, position }))
      )
      if (insertImagesError) {
        console.error("[store-repository] replaceProductVariants insert images:", insertImagesError)
        throw new Error("Erro ao atualizar imagens da variante.")
      }
    }
  }

  const { data: activeVariants, error: sumError } = await db
    .from("store_product_variants")
    .select("stock")
    .eq("product_id", productId)
    .eq("is_active", true)
  if (sumError) {
    console.error("[store-repository] replaceProductVariants sum:", sumError)
    throw new Error("Erro ao atualizar variantes.")
  }

  if ((activeVariants ?? []).length > 0) {
    const hasUnlimitedVariant = (activeVariants ?? []).some((row) => row.stock === null)
    const totalStock = hasUnlimitedVariant
      ? null
      : (activeVariants ?? []).reduce((sum, row) => sum + (row.stock as number), 0)
    const { error: stockError } = await db
      .from("store_products")
      .update({ stock: totalStock })
      .eq("id", productId)
    if (stockError) {
      console.error("[store-repository] replaceProductVariants sync stock:", stockError)
      throw new Error("Erro ao atualizar variantes.")
    }
  }

  // Histórico de preço por variante — grava só se o preço final mudou (ver
  // recordPriceHistoryIfChanged). "De" de uma variante é o override, se
  // houver, senão o price_cents base do produto.
  const variantsWithId = [
    ...toUpdate,
    ...toInsert.map((v, i) => ({ ...v, id: insertedIds[i] as string | undefined })),
  ].filter((v): v is typeof v & { id: string } => Boolean(v.id))

  if (variantsWithId.length > 0) {
    const { data: product } = await db
      .from("store_products")
      .select("price_cents")
      .eq("id", productId)
      .maybeSingle()
    const basePriceCents = (product?.price_cents as number | undefined) ?? 0

    await Promise.all(
      variantsWithId.map((v) =>
        recordPriceHistoryIfChanged(
          productId,
          v.id,
          v.price_cents_override ?? basePriceCents,
          v.promo_price_cents,
          adminId
        )
      )
    )
  }

  return variantsWithId.map((v) => ({ id: v.id, position: v.position }))
}

/** Substitui todas as specs de um produto (usado pela API admin ao salvar). */
export async function replaceProductSpecs(
  productId: string,
  specs: Array<{ label: string; value: string }>
): Promise<void> {
  const db = createSupabaseAdminClient()

  const { error: deleteError } = await db.from("store_product_specs").delete().eq("product_id", productId)
  if (deleteError) {
    console.error("[store-repository] replaceProductSpecs delete:", deleteError)
    throw new Error("Erro ao atualizar especificações.")
  }

  if (specs.length === 0) return

  const rows = specs.map((spec, index) => ({
    product_id: productId,
    label: spec.label,
    value: spec.value,
    position: index,
  }))

  const { error: insertError } = await db.from("store_product_specs").insert(rows)
  if (insertError) {
    console.error("[store-repository] replaceProductSpecs insert:", insertError)
    throw new Error("Erro ao atualizar especificações.")
  }
}

/** Ids dos periféricos vinculados a um produto, em ordem (usado pela API admin ao editar). */
export async function listProductPeripheralIds(productId: string): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_peripherals")
    .select("peripheral_id")
    .eq("product_id", productId)
    .order("position", { ascending: true })

  if (error) {
    console.error("[store-repository] listProductPeripheralIds:", error)
    return []
  }
  return (data ?? []).map((row) => row.peripheral_id as string)
}

/** Substitui os periféricos vinculados a um produto (usado pela API admin ao salvar). */
export async function replaceProductPeripherals(productId: string, peripheralIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const { error: deleteError } = await db
    .from("store_product_peripherals")
    .delete()
    .eq("product_id", productId)
  if (deleteError) {
    console.error("[store-repository] replaceProductPeripherals delete:", deleteError)
    throw new Error("Erro ao atualizar periféricos vinculados.")
  }

  if (peripheralIds.length === 0) return

  const rows = peripheralIds.map((peripheralId, index) => ({
    product_id: productId,
    peripheral_id: peripheralId,
    position: index,
  }))

  const { error: insertError } = await db.from("store_product_peripherals").insert(rows)
  if (insertError) {
    console.error("[store-repository] replaceProductPeripherals insert:", insertError)
    throw new Error("Erro ao atualizar periféricos vinculados.")
  }
}
