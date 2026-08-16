import "server-only"

import { cache } from "react"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { clampPage, clampPageSize, escapeOrFilterValue, rangeFor } from "@/lib/server/repositories/_shared"

/**
 * Repositório da Loja / Bazar — única porta de acesso à tabela `store_products`
 * para leitura. Páginas e endpoints delegam aqui.
 */

export type StoreProductCard = {
  id: string
  slug: string
  name: string
  price_cents: number
  stock: number
  images: string[]
  category: string | null
  brand: string | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  has_variants: boolean
  is_active: boolean
  created_at: string
}

export type StoreProductVariant = {
  id: string
  label: string
  price_cents_override: number | null
  stock: number
  position: number
}

export type FeaturedProduct = {
  id: string
  slug: string
  name: string
  price_cents: number
  images: string[]
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
}

export type LinkedProduct = {
  id: string
  slug: string
  name: string
  type: "store" | "bazaar"
  price_cents: number
  /** Menor preço entre as variantes ativas (ou `price_cents` se não houver variantes). */
  price_cents_min: number
  /** Maior preço entre as variantes ativas (ou `price_cents` se não houver variantes). */
  price_cents_max: number
  images: string[]
  stock: number
  is_active: boolean
}

const CARD_COLUMNS =
  "id, slug, name, price_cents, stock, images, category, brand, type, condition, condition_notes, is_active, created_at, variants:store_product_variants(count)"

type RawCardRow = Omit<StoreProductCard, "has_variants"> & {
  variants: { count: number }[] | null
}

/** Converte a linha crua (com embedded count do PostgREST) para StoreProductCard. */
function mapCardRow(row: RawCardRow): StoreProductCard {
  const { variants, ...rest } = row
  return { ...rest, has_variants: (variants?.[0]?.count ?? 0) > 0 }
}

/** Lista produtos ativos de um tipo ("store" ou "bazaar"). */
export async function listActiveProductsByType(
  type: "store" | "bazaar"
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

/** Lista todos os produtos ativos (Loja + Bazar), para a página unificada. */
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
  type?: "store" | "bazaar"
  condition?: "new" | "used" | "opened"
  categories?: string[]
  brands?: string[]
  search?: string
  priceMinCents?: number
  priceMaxCents?: number
  productIds?: string[]
  /** Usado pelo admin para achar produtos zerados sem trazer o catálogo inteiro. */
  outOfStockOnly?: boolean
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
 * Listagem paginada de produtos da Loja/Bazar, com filtros aplicados no
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

export type StoreFilterOptions = {
  categories: string[]
  brands: string[]
  priceMinCents: number
  priceMaxCents: number
  countByType: { store: number; bazaar: number; all: number }
}

/**
 * Opções de filtro disponíveis (categorias, marcas, faixa de preço,
 * contagem por tipo) para a Loja/Bazar. Query leve, pensada para ser
 * chamada por trás de cache (`revalidate` na página/rota chamadora).
 */
export async function getStoreFilterOptions(type?: "store" | "bazaar"): Promise<StoreFilterOptions> {
  const db = createSupabaseAdminClient()
  let query = db.from("store_products").select("category, brand, price_cents, type").eq("is_active", true)
  if (type) query = query.eq("type", type)

  const { data, error } = await query
  if (error) {
    console.error("[store-repository] getStoreFilterOptions:", error)
    return { categories: [], brands: [], priceMinCents: 0, priceMaxCents: 0, countByType: { store: 0, bazaar: 0, all: 0 } }
  }

  const rows = (data ?? []) as unknown as { category: string | null; brand: string | null; price_cents: number; type: "store" | "bazaar" }[]
  const categories = new Set<string>()
  const brands = new Set<string>()
  const countByType = { store: 0, bazaar: 0, all: 0 }
  let priceMinCents = Infinity
  let priceMaxCents = 0

  for (const row of rows) {
    if (row.category) categories.add(row.category)
    if (row.brand) brands.add(row.brand)
    countByType[row.type] += 1
    countByType.all += 1
    priceMinCents = Math.min(priceMinCents, row.price_cents)
    priceMaxCents = Math.max(priceMaxCents, row.price_cents)
  }

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    brands: [...brands].sort((a, b) => a.localeCompare(b)),
    priceMinCents: Number.isFinite(priceMinCents) ? priceMinCents : 0,
    priceMaxCents,
    countByType,
  }
}

/** Produtos em destaque para a home (ativos e com estoque). */
export async function listFeaturedProducts(limit = 6): Promise<FeaturedProduct[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_products")
    .select("id, slug, name, price_cents, images, type, condition")
    .eq("is_active", true)
    .gt("stock", 0)
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[store-repository] listFeaturedProducts:", error)
    return []
  }
  return (data ?? []) as unknown as FeaturedProduct[]
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
      "store_products!inner(id, slug, name, type, price_cents, images, stock, is_active, variants:store_product_variants(price_cents_override))"
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
  stock: number
  images: string[]
  category: string | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
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

export type LinkedStoreItem = {
  id: string
  slug: string
  name: string
  price_cents: number
  images: string[]
  stock: number
  condition: "new" | "used" | "opened"
  condition_notes: string | null
}

export type LinkedPeripheralRef = {
  id: string
  name: string
  brand: string
  image_url: string | null
}

export type StoreProductDetailResult = {
  product: StoreProductDetail
  linkedProduct: LinkedStoreItem | null
  linkedPeripheral: LinkedPeripheralRef | null
  linkedPeripherals: LinkedPeripheralRef[]
  specs: StoreProductSpec[]
  variants: StoreProductVariant[]
}

/**
 * Detalhe de um produto da Loja/Bazar pelo slug, já com o produto vinculado
 * do outro tipo e o periférico relacionado. Consome a página de detalhe.
 *
 * `React.cache`: dispara 6 queries; `generateMetadata` e a página chamam com
 * o mesmo (slug, type) na mesma requisição — sem isso, dobra tudo por visita.
 */
export const getStoreProductDetail = cache(async (
  slug: string,
  type: "store" | "bazaar"
): Promise<StoreProductDetailResult | null> => {
  const db = createSupabaseAdminClient()

  const { data: product, error } = await db
    .from("store_products")
    .select(
      "id, slug, name, description, price_cents, stock, images, category, type, condition, condition_notes, peripheral_id, features, video_url"
    )
    .eq("slug", slug)
    .eq("type", type)
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    console.error("[store-repository] getStoreProductDetail:", error)
    return null
  }
  if (!product) return null

  const detail = product as unknown as StoreProductDetail
  let linkedProduct: LinkedStoreItem | null = null
  let linkedPeripheral: LinkedPeripheralRef | null = null

  const [specsResult, variantsResult, peripheralsResult, linkedResult] = await Promise.all([
    db
      .from("store_product_specs")
      .select("id, label, value, position")
      .eq("product_id", detail.id)
      .order("position", { ascending: true }),
    db
      .from("store_product_variants")
      .select("id, label, price_cents_override, stock, position")
      .eq("product_id", detail.id)
      .eq("is_active", true)
      .order("position", { ascending: true }),
    db
      .from("store_product_peripherals")
      .select("position, peripherals(id, name, brand_id, brands(name), image_url)")
      .eq("product_id", detail.id)
      .order("position", { ascending: true }),
    detail.peripheral_id
      ? (async () => {
          const oppositeType = type === "store" ? "bazaar" : "store"
          const [{ data: linked }, { data: peripheral }] = await Promise.all([
            db
              .from("store_products")
              .select("id, slug, name, price_cents, images, stock, condition, condition_notes")
              .eq("peripheral_id", detail.peripheral_id as string)
              .eq("type", oppositeType)
              .eq("is_active", true)
              .maybeSingle(),
            db
              .from("peripherals")
              .select("id, name, brand_id, brands(name), image_url")
              .eq("id", detail.peripheral_id as string)
              .maybeSingle(),
          ])
          return { linked, peripheral }
        })()
      : Promise.resolve({ linked: null, peripheral: null }),
  ])

  const specs = (specsResult.data ?? []) as unknown as StoreProductSpec[]
  const variants = (variantsResult.data ?? []) as unknown as StoreProductVariant[]

  type PeripheralJoinRow = {
    peripherals: { id: string; name: string; brand_id: string; brands: { name: string } | { name: string }[] | null; image_url: string | null } | null
  }
  const linkedPeripherals = ((peripheralsResult.data ?? []) as unknown as PeripheralJoinRow[])
    .map((row) => row.peripherals)
    .filter((p): p is NonNullable<PeripheralJoinRow["peripherals"]> => p !== null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      brand: (Array.isArray(p.brands) ? p.brands[0] : p.brands)?.name ?? "",
      image_url: p.image_url,
    }))

  linkedProduct = (linkedResult.linked ?? null) as unknown as LinkedStoreItem | null
  const peripheralRow = linkedResult.peripheral as unknown as
    | { id: string; name: string; brand_id: string; brands: { name: string } | { name: string }[] | null; image_url: string | null }
    | null
  linkedPeripheral = peripheralRow
    ? {
        id: peripheralRow.id,
        name: peripheralRow.name,
        brand: (Array.isArray(peripheralRow.brands) ? peripheralRow.brands[0] : peripheralRow.brands)?.name ?? "",
        image_url: peripheralRow.image_url,
      }
    : null

  return { product: detail, linkedProduct, linkedPeripheral, linkedPeripherals, specs, variants }
})

/** Lista variantes de um produto (usado pela API admin ao editar). */
export async function listProductVariants(
  productId: string,
  opts?: { includeInactive?: boolean }
): Promise<StoreProductVariant[]> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("store_product_variants")
    .select("id, label, price_cents_override, stock, position")
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
  return (data ?? []) as unknown as StoreProductVariant[]
}

export type CheckoutVariant = {
  id: string
  product_id: string
  label: string
  price_cents_override: number | null
  stock: number
  is_active: boolean
}

/** Busca variantes por id, para validação de estoque/preço no checkout. */
export async function getVariantsForCheckout(variantIds: string[]): Promise<CheckoutVariant[]> {
  if (variantIds.length === 0) return []
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_variants")
    .select("id, product_id, label, price_cents_override, stock, is_active")
    .in("id", variantIds)

  if (error) {
    console.error("[store-repository] getVariantsForCheckout:", error)
    return []
  }
  return (data ?? []) as unknown as CheckoutVariant[]
}

/**
 * Substitui as variantes de um produto (usado pela API admin ao salvar).
 * Diferente de replaceProductSpecs: faz upsert-com-diff (não delete-then-
 * insert) para preservar o id das variantes já existentes — pedidos
 * guardam variant_id, e trocar o id a cada save orfanaria essa referência.
 * Variantes removidas da lista são soft-deleted (is_active = false), nunca
 * apagadas de fato. Ao final, mantém store_products.stock como a soma dos
 * estoques das variantes ativas (fallback usado por telas que só conhecem
 * o produto, ex. listagem/dashboard admin).
 */
export async function replaceProductVariants(
  productId: string,
  variants: Array<{ id?: string; label: string; price_cents_override: number | null; stock: number }>
): Promise<void> {
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
        stock: v.stock,
        position: v.position,
        is_active: true,
      })
      .eq("id", v.id)
    if (error) {
      console.error("[store-repository] replaceProductVariants update:", error)
      throw new Error("Erro ao atualizar variantes.")
    }
  }

  if (toInsert.length > 0) {
    const rows = toInsert.map((v) => ({
      product_id: productId,
      label: v.label,
      price_cents_override: v.price_cents_override,
      stock: v.stock,
      position: v.position,
    }))
    const { error } = await db.from("store_product_variants").insert(rows)
    if (error) {
      console.error("[store-repository] replaceProductVariants insert:", error)
      throw new Error("Erro ao atualizar variantes.")
    }
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
    const totalStock = (activeVariants ?? []).reduce((sum, row) => sum + (row.stock as number), 0)
    const { error: stockError } = await db
      .from("store_products")
      .update({ stock: totalStock })
      .eq("id", productId)
    if (stockError) {
      console.error("[store-repository] replaceProductVariants sync stock:", stockError)
      throw new Error("Erro ao atualizar variantes.")
    }
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
