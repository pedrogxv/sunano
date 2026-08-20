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
  "id, slug, name, price_cents, promo_price_cents, stock, images, category, brand, type, condition, condition_notes, sale_type, is_active, is_sold_out, is_featured, created_at, variants:store_product_variants(id, label, price_cents_override, promo_price_cents, stock, color, icon, image_url, is_sold_out, position)"

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

export type StoreProductListFilters = {
  type?: "store"
  condition?: "new" | "used" | "opened"
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
  saleType?: "pre_order" | "ready_stock" | "normal"
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
  if (filters.priceMinCents != null) query = query.gte("price_cents", filters.priceMinCents)
  if (filters.priceMaxCents != null) query = query.lte("price_cents", filters.priceMaxCents)
  if (filters.outOfStockOnly) query = query.eq("stock", 0)
  if (filters.featured) query = query.eq("is_featured", true)
  if (filters.saleType) query = query.eq("sale_type", filters.saleType)
  if (filters.productIds) {
    if (filters.productIds.length === 0) return { items: [], total: 0 }
    query = query.in("id", filters.productIds)
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
  let query = db.from("store_products").select("category, brand, price_cents, type").eq("is_active", true)
  if (type) query = query.eq("type", type)

  const { data, error } = await query
  if (error) {
    console.error("[store-repository] getStoreFilterOptions:", error)
    return { categories: [], categoryCounts: {}, brands: [], brandsByCategory: {}, priceMinCents: 0, priceMaxCents: 0, countByType: { store: 0, all: 0 } }
  }

  const rows = (data ?? []) as unknown as { category: string | null; brand: string | null; price_cents: number; type: "store" }[]
  const categories = new Set<string>()
  const categoryCounts: Record<string, number> = {}
  const brands = new Set<string>()
  const brandCountsByCategory: Record<string, Record<string, number>> = {}
  const countByType = { store: 0, all: 0 }
  let priceMinCents = Infinity
  let priceMaxCents = 0

  for (const row of rows) {
    if (row.category) {
      categories.add(row.category)
      categoryCounts[row.category] = (categoryCounts[row.category] ?? 0) + 1
      if (row.brand) {
        const perCategory = (brandCountsByCategory[row.category] ??= {})
        perCategory[row.brand] = (perCategory[row.brand] ?? 0) + 1
      }
    }
    if (row.brand) brands.add(row.brand)
    countByType[row.type] += 1
    countByType.all += 1
    priceMinCents = Math.min(priceMinCents, row.price_cents)
    priceMaxCents = Math.max(priceMaxCents, row.price_cents)
  }

  const brandsByCategory: Record<string, { brand: string; count: number }[]> = {}
  for (const [category, counts] of Object.entries(brandCountsByCategory)) {
    brandsByCategory[category] = Object.entries(counts)
      .map(([brand, count]) => ({ brand, count }))
      .sort((a, b) => b.count - a.count || a.brand.localeCompare(b.brand))
  }

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    categoryCounts,
    brands: [...brands].sort((a, b) => a.localeCompare(b)),
    brandsByCategory,
    priceMinCents: Number.isFinite(priceMinCents) ? priceMinCents : 0,
    priceMaxCents,
    countByType,
  }
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
  variants: { price_cents_override: number | null }[] | null
}

type RawLinkedProductJoinRow = {
  store_products: RawLinkedProductRow | RawLinkedProductRow[] | null
}

function mapLinkedProductRow({ variants, ...rest }: RawLinkedProductRow): LinkedProduct {
  const variantPrices = (variants ?? []).map((v) => v.price_cents_override ?? rest.price_cents)
  return {
    ...rest,
    price_cents_min: variantPrices.length > 0 ? Math.min(...variantPrices) : rest.price_cents,
    price_cents_max: variantPrices.length > 0 ? Math.max(...variantPrices) : rest.price_cents,
  }
}

/** Produtos ativos vinculados a um periférico (página de detalhe). */
export async function listProductsByPeripheral(peripheralId: string): Promise<LinkedProduct[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_peripherals")
    .select(
      "store_products!inner(id, slug, name, type, price_cents, images, stock, is_active, is_sold_out, variants:store_product_variants(price_cents_override))"
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
}

/**
 * Detalhe de um produto da Loja pelo slug, já com o periférico relacionado.
 * Consome a página de detalhe.
 *
 * `React.cache`: dispara 6 queries; `generateMetadata` e a página chamam com
 * o mesmo slug na mesma requisição — sem isso, dobra tudo por visita.
 */
export const getStoreProductDetail = cache(async (
  slug: string
): Promise<StoreProductDetailResult | null> => {
  const db = createSupabaseAdminClient()

  const { data: product, error } = await db
    .from("store_products")
    .select(
      "id, slug, name, description, price_cents, promo_price_cents, stock, images, category, type, condition, condition_notes, sale_type, is_sold_out, peripheral_id, features, video_url"
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

  const [specsResult, variantsResult, variantGroupsResult, peripheralsResult, peripheralResult] = await Promise.all([
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
      .order("position", { ascending: true }),
    db
      .from("store_product_variant_groups")
      .select(
        "id, name, position, options:store_product_variant_group_options(id, label, price_cents_override, is_sold_out, position)"
      )
      .eq("product_id", detail.id)
      .order("position", { ascending: true }),
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

  return { product: detail, linkedPeripheral, linkedPeripherals, specs, variants, variantGroups }
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
    .order("position", { ascending: true })

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
 * pela API admin ao salvar. Delete-then-insert, diferente do upsert-com-diff
 * de replaceProductVariants: nada referencia essas linhas por FK (pedidos
 * guardam só um snapshot denormalizado, não o id da opção), então não há
 * necessidade de preservar ids entre saves — mesmo padrão de replaceProductSpecs.
 */
export async function replaceProductVariantGroups(
  productId: string,
  groups: Array<{
    name: string
    options: Array<{ label: string; price_cents_override: number | null; is_sold_out: boolean }>
  }>
): Promise<void> {
  if (groups.length > MAX_VARIANT_GROUPS_PER_PRODUCT) {
    throw new Error(`Cada produto pode ter no máximo ${MAX_VARIANT_GROUPS_PER_PRODUCT} grupos de variantes.`)
  }
  for (const g of groups) {
    if (g.options.length > MAX_OPTIONS_PER_VARIANT_GROUP) {
      throw new Error(`Cada grupo de variantes pode ter no máximo ${MAX_OPTIONS_PER_VARIANT_GROUP} opções.`)
    }
  }

  const db = createSupabaseAdminClient()

  const { error: deleteError } = await db
    .from("store_product_variant_groups")
    .delete()
    .eq("product_id", productId)
  if (deleteError) {
    console.error("[store-repository] replaceProductVariantGroups delete:", deleteError)
    throw new Error("Erro ao atualizar variantes.")
  }

  if (groups.length === 0) return

  const { data: insertedGroups, error: insertGroupsError } = await db
    .from("store_product_variant_groups")
    .insert(groups.map((g, position) => ({ product_id: productId, name: g.name, position })))
    .select("id")
  if (insertGroupsError || !insertedGroups) {
    console.error("[store-repository] replaceProductVariantGroups insert groups:", insertGroupsError)
    throw new Error("Erro ao atualizar variantes.")
  }

  const optionRows = groups.flatMap((g, gi) =>
    g.options.map((o, position) => ({
      group_id: insertedGroups[gi].id as string,
      label: o.label,
      price_cents_override: o.price_cents_override,
      is_sold_out: o.is_sold_out,
      position,
    }))
  )
  if (optionRows.length > 0) {
    const { error: insertOptionsError } = await db.from("store_product_variant_group_options").insert(optionRows)
    if (insertOptionsError) {
      console.error("[store-repository] replaceProductVariantGroups insert options:", insertOptionsError)
      throw new Error("Erro ao atualizar variantes.")
    }
  }
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
  promoPriceCents: number | null
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
  }>
): Promise<void> {
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
    const { error } = await db
      .from("store_product_variants")
      .update({ is_active: false })
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
        recordPriceHistoryIfChanged(productId, v.id, v.price_cents_override ?? basePriceCents, v.promo_price_cents)
      )
    )
  }
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
