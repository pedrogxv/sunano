import "server-only"

import { unstable_cache } from "next/cache"
import { cache } from "react"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { clampPage, clampPageSize, escapeLikePattern, escapeOrFilterValue, rangeFor } from "@/lib/server/repositories/_shared"
import { getPeripheralRankById, type PeripheralRank } from "@/lib/server/repositories/peripherals-repository"
import { getCatalogFacetCounts, getStoreCatalogIndex, matchCatalogProductIds } from "@/lib/server/repositories/store-catalog-repository"
import {
  EMPTY_ATTRIBUTES,
  hasCatalogSelection,
  type CatalogSelection,
  type StoreCatalogFacetCounts,
  type StoreSortKey,
} from "@/lib/store-catalog"
import {
  BEST_SELLER_MIN_UNITS,
  BEST_SELLER_TOP,
  BEST_SELLER_WINDOW_DAYS,
  deriveCardHighlights,
  isStoreCardBadgeChoice,
  NEW_PRODUCT_DAYS,
  resolveCardBadge,
  sanitizeCardHighlights,
  type StoreCardBadge,
} from "@/lib/store-card"
import { cardActiveVariant, computeCardDisplayPrice, isCardSoldOut, isSinglePriceProduct } from "@/lib/store-pricing"
import { buildStoreSearchPlan } from "@/lib/store-search"
import {
  effectivePreorderStatus,
  isLaunchActive,
  isPreorderStatus,
  preorderRemaining,
  type PreorderInfo,
  type PreorderStatus,
} from "@/lib/store-preorder"
import { todayKeySaoPaulo } from "@/lib/store-shipping"
import { findSku, resolveSelection, skuKey, type StoreSku } from "@/lib/store-sku"

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
  /** Ordem manual entre os destaques (menor = mais à frente). `null` se não é destaque. */
  featured_position: number | null
  /** Fixado manualmente na seção "Mais vendidos" da Home, à frente do ranking de vendas. */
  pin_best_seller: boolean
  /** Ordem manual entre os fixados (menor = mais à frente). `null` se não fixado. */
  best_seller_position: number | null
  created_at: string
  /** false = serviço/digital: não vai pelo correio, então não anuncia frete. */
  requires_shipping: boolean
  /** Tem grupo de opção (Switch, Voltagem...): comprar exige escolher, o card oferece "Escolher opções". */
  has_option_groups: boolean
  /** Nota média e quantidade de avaliações publicadas; `null` = ninguém avaliou ainda. */
  rating: StoreCardRating | null
  /** Selo principal, no máximo um. Ver `resolveCardBadge` em lib/store-card.ts. */
  badge: StoreCardBadge | null
  /** Até 3 características técnicas curtas ("49g", "PAW3950", "8K"). */
  highlights: string[]
  /** Lote da pré-venda; `null` em produto que não é pré-venda. Ver lib/store-preorder.ts. */
  preorder: StoreCardPreorder | null
  /** Marcado como Lançamento no admin e ainda no prazo. */
  is_launch: boolean
}

export type StoreCardRating = { average: number; count: number }

/** O lote como o card e a seção "Lançamentos e Pré-venda" mostram: status já efetivo. */
export type StoreCardPreorder = {
  status: PreorderStatus
  batchName: string | null
  shipsAt: string | null
  limit: number | null
  /** `null` = lote sem teto. */
  remaining: number | null
}

/**
 * Campos que dependem de outras tabelas (avaliações, vendas, Database) e são
 * preenchidos por `withCardDisplay`. Obrigatórios em `StoreProductCard` de
 * propósito: toda listagem nova tem de passar por ele, senão o TypeScript
 * reclama, em vez de a tela sair sem selo e sem nota sem ninguém notar.
 */
type CardDisplayFields = "rating" | "badge" | "highlights" | "preorder" | "is_launch"

type StoreProductCardBase = Omit<StoreProductCard, CardDisplayFields>

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
  /** Preço cheio quando há promoção ativa (`null` se o preço exibido já é o cheio). */
  price_cents_original: number | null
  images: string[]
  /** `null` = sem controle de estoque (nunca esgota). */
  stock: number | null
  is_active: boolean
  is_sold_out: boolean
  sale_type: "pre_order" | "ready_stock" | "normal"
}

const CARD_COLUMNS =
  "id, slug, name, price_cents, promo_price_cents, stock, images, category, brand, type, condition, condition_notes, sale_type, is_active, is_sold_out, is_featured, featured_position, pin_best_seller, best_seller_position, created_at, requires_shipping, variants:store_product_variants(id, label, price_cents_override, promo_price_cents, stock, color, icon, image_url, is_sold_out, position), option_groups:store_product_variant_groups(id)"

type RawCardRow = Omit<StoreProductCardBase, "has_variants" | "variants" | "has_option_groups"> & {
  variants: (StoreCardVariant & { position: number })[] | null
  option_groups: { id: string }[] | null
}

/** Converte a linha crua (com variantes embutidas) para o card, ainda sem nota/selo/características. */
function mapCardRow(row: RawCardRow): StoreProductCardBase {
  const { variants: rawVariants, option_groups: optionGroups, ...rest } = row
  const variants = [...(rawVariants ?? [])].sort((a, b) => a.position - b.position)
  return {
    ...rest,
    has_variants: variants.length > 0,
    variants: variants.map(({ position: _position, ...v }) => v),
    has_option_groups: (optionGroups ?? []).length > 0,
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Selo e características escolhidos no admin. Consulta à parte, e não em
 * CARD_COLUMNS: se o código subir antes da migration 20261212000000, a coluna
 * inexistente derrubaria a vitrine inteira; assim o card só cai no automático.
 */
async function getCardChoices(ids: string[]): Promise<Map<string, { badge: unknown; highlights: unknown }>> {
  const choices = new Map<string, { badge: unknown; highlights: unknown }>()
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("store_products").select("id, card_badge, card_highlights").in("id", ids)
  if (error) {
    console.error("[store-repository] getCardChoices:", error)
    return choices
  }
  for (const row of data ?? []) choices.set(row.id, { badge: row.card_badge, highlights: row.card_highlights })
  return choices
}

/**
 * Pódio de vendas para o selo "Mais vendido": só os `BEST_SELLER_TOP`
 * primeiros, e só com `BEST_SELLER_MIN_UNITS` vendidas. Com a Loja recém
 * aberta, o "1º" vendeu 1 unidade: chamar isso de mais vendido seria
 * anunciar o que não aconteceu.
 *
 * "Fixar em Mais vendidos" NÃO dá o selo: o pino decide a ordem da seção da
 * Home (curadoria), o selo afirma um número de vendas. Com os dois juntos,
 * todo card da seção saía com "Mais vendido" e o selo não dizia mais nada.
 *
 * Em cache por 5 min: a rota de produtos é dinâmica, e sem ele cada clique
 * de filtro somaria os pedidos de 90 dias.
 */
const getBestSellerBadgeIds = unstable_cache(
  async (): Promise<string[]> => {
    const units = await getUnitsSoldByProduct(BEST_SELLER_WINDOW_DAYS)
    return [...units.entries()]
      .filter(([, sold]) => sold >= BEST_SELLER_MIN_UNITS)
      .sort((a, b) => b[1] - a[1])
      .slice(0, BEST_SELLER_TOP)
      .map(([id]) => id)
  },
  ["store-repository:getBestSellerBadgeIds"],
  { revalidate: 300 }
)

/**
 * Nota, selo e características de cada card. Toda listagem pública passa
 * aqui (ver `CardDisplayFields`). Leituras para a página inteira, não por
 * card: avaliações e escolhas do admin por `in(id)`; pódio de vendas e
 * índice do catálogo vêm de cache.
 */
async function withCardDisplay(items: StoreProductCardBase[]): Promise<StoreProductCard[]> {
  if (items.length === 0) return []
  const ids = items.map((item) => item.id)
  const [ratings, choices, bestSellers, catalog, launchAndPreorder, defaultSkus] = await Promise.all([
    getRatingsByProduct(ids),
    getCardChoices(ids),
    getBestSellerBadgeIds(),
    getStoreCatalogIndex(),
    getLaunchAndPreorderInfo(items),
    getDefaultVariantSkus(items),
  ])
  const newSince = Date.now() - NEW_PRODUCT_DAYS * DAY_MS
  const today = todayKeySaoPaulo()

  return items.map((rawItem) => {
    const item = withDefaultSkus(rawItem, defaultSkus)
    const attributes = catalog[item.id]?.attributes ?? EMPTY_ATTRIBUTES
    const choice = choices.get(item.id)
    const variant = cardActiveVariant(item)
    const manualHighlights = sanitizeCardHighlights(Array.isArray(choice?.highlights) ? choice.highlights : [])
    const extras = launchAndPreorder.get(item.id)
    const soldOut = isCardSoldOut(item)
    const preorder =
      item.sale_type === "pre_order" ? toCardPreorder(extras?.preorder ?? DEFAULT_PREORDER_INFO, soldOut) : null

    return {
      ...item,
      rating: ratings.get(item.id) ?? null,
      badge: resolveCardBadge({
        // Lote fechado, cheio ou "em breve" não tem o que vender agora: sem
        // selo, igual a esgotado. O card mostra o status do lote no lugar.
        soldOut: soldOut || (preorder !== null && preorder.status !== "open"),
        saleType: item.sale_type,
        choice: isStoreCardBadgeChoice(choice?.badge) ? choice.badge : null,
        stock: variant ? variant.stock : item.stock,
        isBestSeller: bestSellers.includes(item.id),
        isBestValue: attributes.tags.includes("value"),
        isNew: item.condition === "new" && Date.parse(item.created_at) >= newSince,
        isLaunch: extras ? isLaunchActive(extras, today) : false,
      }),
      highlights: manualHighlights.length > 0 ? manualHighlights : deriveCardHighlights(item.category, attributes),
      preorder,
      is_launch: extras ? isLaunchActive(extras, today) : false,
    }
  })
}

/** Pré-venda sem as colunas do lote (código no ar antes da migration 20261213000001): lote aberto, sem teto. */
const DEFAULT_PREORDER_INFO: PreorderInfo = { status: "open", batchName: null, shipsAt: null, limit: null, reserved: 0 }

function toCardPreorder(info: PreorderInfo, productSoldOut: boolean): StoreCardPreorder {
  return {
    status: effectivePreorderStatus(info, productSoldOut),
    batchName: info.batchName,
    shipsAt: info.shipsAt,
    limit: info.limit,
    remaining: preorderRemaining(info),
  }
}

type LaunchAndPreorderInfo = {
  is_launch: boolean
  launch_until: string | null
  preorder: PreorderInfo | null
}

/**
 * Lote de pré-venda e marcação de Lançamento de uma página de produtos.
 * Consulta à parte (e não em CARD_COLUMNS) pelo mesmo motivo de
 * `getCardChoices`: com o código no ar antes da migration 20261213000001, a
 * coluna inexistente derrubaria a vitrine inteira. Assim a pré-venda só cai
 * em "aberta, sem teto", que é como ela funcionava antes do lote existir.
 */
export async function getLaunchAndPreorderInfo(
  items: readonly { id: string; sale_type: StoreSaleType }[]
): Promise<Map<string, LaunchAndPreorderInfo>> {
  const result = new Map<string, LaunchAndPreorderInfo>()
  if (items.length === 0) return result
  const db = createSupabaseAdminClient()
  const preorderIds = items.filter((item) => item.sale_type === "pre_order").map((item) => item.id)

  const [{ data, error }, reserved] = await Promise.all([
    db
      .from("store_products")
      .select("id, is_launch, launch_until, preorder_status, preorder_batch_name, preorder_ships_at, preorder_limit")
      .in(
        "id",
        items.map((item) => item.id)
      ),
    getPreorderReserved(preorderIds),
  ])
  if (error) {
    console.error("[store-repository] getLaunchAndPreorderInfo:", error)
    return result
  }

  for (const row of data ?? []) {
    result.set(row.id, {
      is_launch: Boolean(row.is_launch),
      launch_until: row.launch_until ?? null,
      preorder: preorderIds.includes(row.id)
        ? {
            status: isPreorderStatus(row.preorder_status) ? row.preorder_status : "open",
            batchName: row.preorder_batch_name ?? null,
            shipsAt: row.preorder_ships_at ?? null,
            limit: row.preorder_limit ?? null,
            reserved: reserved.get(row.id) ?? 0,
          }
        : null,
    })
  }
  return result
}

/** Unidades já reservadas no lote atual de cada pré-venda (pedidos válidos + reservas em voo). */
async function getPreorderReserved(productIds: string[]): Promise<Map<string, number>> {
  const reserved = new Map<string, number>()
  if (productIds.length === 0) return reserved
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("preorder_reserved_quantities", { p_product_ids: productIds })
  if (error) {
    console.error("[store-repository] getPreorderReserved:", error)
    return reserved
  }
  for (const row of data ?? []) reserved.set(row.product_id, Number(row.reserved) || 0)
  return reserved
}

const SKU_COLUMNS = "id, product_id, variant_id, option_ids, sku, price_cents, promo_price_cents, stock, image_url, is_sold_out"

type StoreSkuRow = StoreSku & { product_id: string }

/**
 * Combinações dos produtos informados. Tolerante como `getCardChoices`: sem
 * a tabela (migration 20261213000000 ainda não aplicada) devolve vazio, e
 * toda seleção cai na regra antiga (cor → produto).
 */
export async function getSkusForProducts(
  productIds: string[],
  opts?: { onlyWithoutOptions?: boolean }
): Promise<StoreSkuRow[]> {
  if (productIds.length === 0) return []
  const db = createSupabaseAdminClient()
  let query = db.from("store_product_skus").select(SKU_COLUMNS).in("product_id", productIds)
  if (opts?.onlyWithoutOptions) query = query.filter("option_ids", "eq", "{}")
  const { data, error } = await query
  if (error) {
    console.error("[store-repository] getSkusForProducts:", error)
    return []
  }
  return (data ?? []) as unknown as StoreSkuRow[]
}

/**
 * O card não conhece grupos de opção: anuncia a cor sozinha. Quando o admin
 * deu preço, estoque ou foto próprios à combinação "só a cor", é ela que o
 * card tem de mostrar, senão a vitrine anuncia um preço e a página abre em
 * outro.
 */
async function getDefaultVariantSkus(items: readonly StoreProductCardBase[]): Promise<StoreSkuRow[]> {
  const ids = items.filter((item) => item.has_variants).map((item) => item.id)
  return getSkusForProducts(ids, { onlyWithoutOptions: true })
}

function withDefaultSkus(item: StoreProductCardBase, skus: readonly StoreSkuRow[]): StoreProductCardBase {
  if (!item.has_variants) return item
  const own = skus.filter((sku) => sku.product_id === item.id)
  if (own.length === 0) return item
  return {
    ...item,
    variants: item.variants.map((variant) => {
      const sku = findSku(own, variant.id, [])
      if (!sku) return variant
      // Mesma precedência de `computeEffectivePrice` com `sku`: preço próprio
      // leva a promoção junto; só promoção incide sobre o preço da cor.
      return {
        ...variant,
        price_cents_override: sku.price_cents ?? variant.price_cents_override,
        promo_price_cents: sku.price_cents != null ? sku.promo_price_cents : sku.promo_price_cents ?? variant.promo_price_cents,
        stock: sku.stock ?? variant.stock,
        image_url: sku.image_url ?? variant.image_url,
        is_sold_out: variant.is_sold_out || sku.is_sold_out,
      }
    }),
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
  return withCardDisplay(((data ?? []) as unknown as RawCardRow[]).map(mapCardRow))
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
  return withCardDisplay(((data ?? []) as unknown as RawCardRow[]).map(mapCardRow))
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
  /** Filtra só produtos marcados como destaque (`is_featured`), ordenados por `featured_position`. */
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
  /** Tipos e facetas do catálogo ("Ultraleves", peso, formato...). Ver `lib/store-catalog.ts`. */
  catalog?: CatalogSelection
  /** `relevance` só tem efeito junto de `search`; sem busca, cai em `recent`. */
  sort?: StoreSortKey
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

/** Um produto que bateu na busca, na ordem de relevância que o banco devolveu. */
export type StoreSearchHit = {
  productId: string
  score: number
  /** Sensor do anúncio (ficha técnica ou periférico ligado), se houver. */
  sensor: string | null
  /** O termo bateu no sensor: a busca mostra "Sensor PAW3950" para explicar o resultado. */
  sensorMatched: boolean
}

/**
 * Teto de resultados da busca. Os ids vão num `in.(...)` na URL do PostgREST
 * (~37 caracteres cada), e acima disso a lista já não ajuda ninguém a achar
 * nada: quem busca "pro" e rola 150 produtos refina o termo.
 */
const SEARCH_RESULT_CAP = 150

/**
 * Produtos que batem com o termo em nome, marca, categoria, sensor ou nas
 * palavras-chave do Database (periférico ligado, ficha técnica, destaques),
 * já em ordem de relevância. Ver `store_search_products` (20261204000001) e
 * `lib/store-search.ts`.
 *
 * `null` = a função não respondeu (migration ainda não aplicada, por
 * exemplo). Quem chama cai na busca antiga por nome/marca em vez de devolver
 * uma vitrine vazia.
 */
async function searchStoreProductHits(
  searchTerm: string,
  includeInactive = false
): Promise<StoreSearchHit[] | null> {
  // Corta o termo: ILIKE em texto longo não ajuda relevância e só gasta banco.
  const plan = buildStoreSearchPlan(searchTerm.slice(0, 80))
  // Só palavras de 1 letra ("x") não viram grupo: a busca antiga por
  // nome/marca ainda acha "X" no nome, em vez de devolver vazio.
  if (plan.groups.length === 0) return null

  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("store_search_products", {
    p_groups: plan.groups,
    p_phrase: plan.phrase,
    p_include_inactive: includeInactive,
  })
  if (error) {
    console.error("[store-repository] searchStoreProductHits:", error)
    return null
  }

  return (data ?? []).slice(0, SEARCH_RESULT_CAP).map((row) => ({
    productId: row.product_id,
    score: row.score,
    sensor: row.sensor,
    sensorMatched: row.sensor_matched,
  }))
}

/** Busca antiga (só nome/marca), usada quando `store_search_products` falha. */
function legacySearchOr(searchTerm: string): string {
  const term = escapeOrFilterValue(escapeLikePattern(searchTerm.trim()))
  return `name.ilike."%${term}%",brand.ilike."%${term}%"`
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

  // Posição de cada id na ordem de relevância da busca (menor = mais relevante).
  let relevance: Map<string, number> | null = null
  // Recorte por id (lista pedida, busca, tipos do catálogo): a interseção de
  // todos vira UM `in`, em vez de vários `in` na mesma coluna.
  let allowedIds: Set<string> | null = null
  const restrictTo = (ids: string[]) => {
    allowedIds = allowedIds ? new Set(ids.filter((id) => allowedIds!.has(id))) : new Set(ids)
  }

  if (!filters.includeInactive) query = query.eq("is_active", true)
  if (filters.type) query = query.eq("type", filters.type)
  if (filters.condition) query = query.eq("condition", filters.condition)
  if (filters.categories?.length) query = query.in("category", filters.categories)
  if (filters.brands?.length) query = query.in("brand", filters.brands)
  if (filters.search?.trim()) {
    const hits = await searchStoreProductHits(filters.search, Boolean(filters.includeInactive))
    if (hits === null) {
      query = query.or(legacySearchOr(filters.search))
    } else {
      if (hits.length === 0) return { items: [], total: 0 }
      restrictTo(hits.map((hit) => hit.productId))
      relevance = new Map(hits.map((hit, index) => [hit.productId, index]))
    }
  }
  if (hasCatalogSelection(filters.catalog)) restrictTo(await matchCatalogProductIds(filters.catalog!))
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
  if (filters.productIds) restrictTo(filters.productIds)
  if (allowedIds) {
    const ids = [...(allowedIds as Set<string>)]
    if (ids.length === 0) return { items: [], total: 0 }
    query = query.in("id", ids)
  }

  if (filters.featured) {
    query = query.order("featured_position", { ascending: true, nullsFirst: false })
  }

  if (filters.pinnedBestSellersOnly) {
    query = query.order("best_seller_position", { ascending: true, nullsFirst: false })
  }

  // Ordens que não são uma coluna (relevância da busca, preço que o card
  // mostra, vendas, nota, desconto): o banco devolve o recorte inteiro e a
  // ordenação + página acontecem aqui. O catálogo público é pequeno; a busca
  // já vem limitada a SEARCH_RESULT_CAP. Desempate de todas: mais recente.
  const sortByRelevance = relevance !== null && filters.sort === "relevance"
  const sortInMemory = sortByRelevance || IN_MEMORY_SORTS.has(filters.sort ?? "recent")

  switch (filters.sort) {
    case "name-asc":
      query = query.order("name", { ascending: true })
      break
    case "name-desc":
      query = query.order("name", { ascending: false })
      break
    default:
      query = query.order("created_at", { ascending: false })
  }

  const page = clampPage(filters.page)
  const pageSize = clampPageSize(filters.pageSize)
  const [from, to] = rangeFor(page, pageSize)
  if (!sortInMemory) query = query.range(from, to)

  const { data, error, count } = await query
  if (error) {
    console.error("[store-repository] listStoreProductsPaginated:", error)
    return { items: [], total: 0 }
  }

  const items = ((data ?? []) as unknown as RawCardRow[]).map(mapCardRow)
  if (!sortInMemory) return { items: await withCardDisplay(items), total: count ?? 0 }

  if (sortByRelevance && relevance) {
    const rank = relevance
    items.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity))
  } else {
    await sortCardsInMemory(items, filters.sort!)
  }
  return { items: await withCardDisplay(items.slice(from, to + 1)), total: count ?? items.length }
}

const IN_MEMORY_SORTS = new Set<StoreSortKey>(["price-asc", "price-desc", "best-selling", "top-rated", "discount"])

/** Janela do "Mais vendidos" da vitrine: um ano, para produto sazonal não sumir do topo em 90 dias. */
const BEST_SELLING_WINDOW_DAYS = 365

/** Unidades vendidas por produto (pedidos pagos), pela RPC do dashboard. */
async function getUnitsSoldByProduct(windowDays = BEST_SELLING_WINDOW_DAYS): Promise<Map<string, number>> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("get_top_selling_products", {
    p_from: new Date(Date.now() - windowDays * DAY_MS).toISOString(),
    p_to: new Date().toISOString(),
    p_limit: 1000,
  })
  if (error) console.error("[store-repository] getUnitsSoldByProduct:", error)
  return new Map(((data ?? []) as { product_id: string; units_sold: number }[]).map((row) => [row.product_id, Number(row.units_sold) || 0]))
}

/** Nota média e quantidade de avaliações publicadas por produto. */
async function getRatingsByProduct(productIds: string[]): Promise<Map<string, StoreCardRating>> {
  const ratings = new Map<string, StoreCardRating>()
  if (productIds.length === 0) return ratings
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_reviews")
    .select("product_id, rating")
    .eq("status", "published")
    .in("product_id", productIds)
  if (error) console.error("[store-repository] getRatingsByProduct:", error)

  const sums = new Map<string, { sum: number; count: number }>()
  for (const row of (data ?? []) as { product_id: string; rating: number }[]) {
    const entry = sums.get(row.product_id) ?? { sum: 0, count: 0 }
    entry.sum += row.rating
    entry.count += 1
    sums.set(row.product_id, entry)
  }
  for (const [id, { sum, count }] of sums) ratings.set(id, { average: sum / count, count })
  return ratings
}

/**
 * Ordena os cards já filtrados (que vieram do banco por `created_at desc`):
 * `Array.sort` é estável, então empate fica com o mais recente na frente.
 */
async function sortCardsInMemory(items: StoreProductCardBase[], sort: StoreSortKey): Promise<void> {
  switch (sort) {
    case "price-asc":
    case "price-desc": {
      const price = new Map(items.map((item) => [item.id, computeCardDisplayPrice(item).effectiveCents]))
      const direction = sort === "price-asc" ? 1 : -1
      items.sort((a, b) => direction * (price.get(a.id)! - price.get(b.id)!))
      return
    }
    case "discount": {
      const discount = new Map(items.map((item) => [item.id, computeCardDisplayPrice(item).discountPercent ?? 0]))
      items.sort((a, b) => discount.get(b.id)! - discount.get(a.id)!)
      return
    }
    case "best-selling": {
      const units = await getUnitsSoldByProduct()
      items.sort((a, b) => (units.get(b.id) ?? 0) - (units.get(a.id) ?? 0))
      return
    }
    case "top-rated": {
      // Sem avaliação vai para o fim: zero estrelas não é "pior avaliado", é
      // "ninguém avaliou ainda", e não pode ficar à frente de uma nota 3.
      const ratings = await getRatingsByProduct(items.map((item) => item.id))
      items.sort((a, b) => {
        const ra = ratings.get(a.id)
        const rb = ratings.get(b.id)
        if (!ra || !rb) return (rb ? 1 : 0) - (ra ? 1 : 0)
        return rb.average - ra.average || rb.count - ra.count
      })
      return
    }
  }
}

/** Ordem dos lotes na seção: o que dá para reservar primeiro, o que está por vir depois. */
const PREORDER_SECTION_ORDER: Record<PreorderStatus, number> = {
  open: 0,
  next_batch_soon: 1,
  sold_out: 2,
  shipping: 3,
  closed: 4,
}

/**
 * Seção "Lançamentos e Pré-venda" da Home.
 *
 * Pré-vendas: todas menos as encerradas, com o lote aberto na frente. "Novo
 * lote em breve" e "Esgotado" ficam (com o status no card): é a vitrine do
 * que vem aí, e é dali que sai o "avise-me".
 *
 * Lançamentos: os marcados no admin e ainda no prazo (`launch_until`), fora
 * os que já aparecem como pré-venda.
 */
export async function listLaunchAndPreorderProducts(
  limit = 12
): Promise<{ preorders: StoreProductCard[]; launches: StoreProductCard[] }> {
  const db = createSupabaseAdminClient()
  const [{ items: preorderItems }, { data: launchRows, error: launchError }] = await Promise.all([
    listStoreProductsPaginated({ type: "store", saleType: "pre_order", page: 1, pageSize: 48 }),
    db
      .from("store_products")
      .select("id, launch_until")
      .eq("type", "store")
      .eq("is_active", true)
      .eq("is_launch", true)
      .neq("sale_type", "pre_order"),
  ])
  // Sem a coluna (migration 20261213000001 pendente): seção só de pré-venda.
  if (launchError) console.error("[store-repository] listLaunchAndPreorderProducts:", launchError)

  const preorders = preorderItems
    .filter((item) => item.preorder?.status !== "closed")
    .sort((a, b) => PREORDER_SECTION_ORDER[a.preorder?.status ?? "open"] - PREORDER_SECTION_ORDER[b.preorder?.status ?? "open"])
    .slice(0, limit)

  const today = todayKeySaoPaulo()
  const launchIds = (launchRows ?? [])
    .filter((row) => isLaunchActive({ is_launch: true, launch_until: row.launch_until }, today))
    .map((row) => row.id)
  const launches =
    launchIds.length > 0
      ? (await listStoreProductsPaginated({ type: "store", productIds: launchIds, page: 1, pageSize: limit })).items
      : []

  return { preorders, launches }
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
 * Regrava `featured_position` (0, 1, 2...) pra cada id na ordem recebida —
 * arrastar-e-soltar no painel "Destaques" do admin. Mesmo padrão de
 * `reorderPinnedBestSellers` acima. O filtro `is_featured` é só uma trava
 * extra: a lista de ids já vem restrita aos destaques.
 */
export async function reorderFeaturedProducts(orderedIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const results = await Promise.all(
    orderedIds.map((id, index) =>
      db.from("store_products").update({ featured_position: index }).eq("id", id).eq("is_featured", true)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[store-repository] reorderFeaturedProducts:", failed.error)
    throw failed.error
  }
}

/** Item do dropdown da busca: o card mais o sensor, quando foi ele que bateu. */
/** Sem nota/selo/características: o dropdown não desenha card, e cada tecla viraria quatro consultas. */
export type StoreSearchSuggestion = StoreProductCardBase & {
  /** Preenchido só quando o termo bateu no sensor ("3950" → "PixArt PAW3950"). */
  search_sensor: string | null
}

/**
 * Busca leve pro dropdown "em tempo real" da barra de pesquisa — sem
 * `count: "exact"` (custo extra que o typeahead não precisa) e limitada a
 * poucos itens. Mesmo match de `listStoreProductsPaginated` (nome, marca,
 * categoria, sensor e Database), já na ordem de relevância.
 */
export async function searchStoreProductsTop(
  searchTerm: string,
  limit = 5
): Promise<StoreSearchSuggestion[]> {
  const trimmed = searchTerm.trim()
  if (trimmed.length < 2) return []

  const db = createSupabaseAdminClient()
  const hits = await searchStoreProductHits(trimmed)

  if (hits === null) {
    const { data, error } = await db
      .from("store_products")
      .select(CARD_COLUMNS)
      .eq("is_active", true)
      .or(legacySearchOr(trimmed))
      .order("is_featured", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error) {
      console.error("[store-repository] searchStoreProductsTop:", error)
      return []
    }
    return ((data ?? []) as unknown as RawCardRow[]).map((row) => ({ ...mapCardRow(row), search_sensor: null }))
  }

  const top = hits.slice(0, limit)
  if (top.length === 0) return []

  const { data, error } = await db
    .from("store_products")
    .select(CARD_COLUMNS)
    .eq("is_active", true)
    .in("id", top.map((hit) => hit.productId))

  if (error) {
    console.error("[store-repository] searchStoreProductsTop:", error)
    return []
  }

  const cards = new Map(((data ?? []) as unknown as RawCardRow[]).map((row) => [row.id, mapCardRow(row)]))
  return top.flatMap((hit) => {
    const card = cards.get(hit.productId)
    return card ? [{ ...card, search_sensor: hit.sensorMatched ? hit.sensor : null }] : []
  })
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
  /**
   * Contagem dos tipos, facetas do Database e faixas de preço de cada
   * categoria (`lib/store-catalog.ts`): o mega menu e a barra lateral só
   * mostram opção que tem produto.
   */
  catalogFacetsByCategory: Record<string, StoreCatalogFacetCounts>
  /**
   * Até 3 produtos em destaque por categoria, para o card da direita do mega
   * menu: os marcados como destaque pelo admin primeiro, depois maior
   * desconto, depois os mais recentes. Vem do servidor para o card existir em
   * toda página da Loja (avaliações, favoritos), não só onde a grade já
   * carregou produto daquela categoria.
   */
  menuHighlights: Record<string, StoreProductCard[]>
  priceMinCents: number
  priceMaxCents: number
  countByType: { store: number; all: number }
}

/**
 * Opções de filtro disponíveis (categorias, marcas, faixa de preço,
 * contagem por tipo) para a Loja. Query leve, pensada para ser
 * chamada por trás de cache (`revalidate` na página/rota chamadora).
 */
export const getStoreFilterOptions = cache(loadStoreFilterOptions)

/**
 * `React.cache` porque as landings de categoria e marca leem as opções duas
 * vezes por request: no `layout.tsx`, que valida o slug antes do boundary do
 * `loading.tsx` (é o que mantém o 404 de verdade), e de novo na página.
 */
async function loadStoreFilterOptions(type?: "store"): Promise<StoreFilterOptions> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("store_products")
    .select(
      "id, category, brand, price_cents, promo_price_cents, condition, sale_type, is_sold_out, stock, type, images, is_featured, featured_position, created_at"
    )
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
      catalogFacetsByCategory: {},
      menuHighlights: {},
      priceMinCents: 0,
      priceMaxCents: 0,
      countByType: { store: 0, all: 0 },
    }
  }

  type FacetRow = {
    id: string
    images: string[] | null
    is_featured: boolean
    featured_position: number | null
    created_at: string
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

  const effectiveCentsOf = (row: FacetRow) =>
    row.promo_price_cents != null && row.promo_price_cents < row.price_cents ? row.promo_price_cents : row.price_cents
  const [catalogFacetsByCategory, menuHighlights] = await Promise.all([
    getCatalogFacetCounts(rows.map((row) => ({ id: row.id, category: row.category, effectiveCents: effectiveCentsOf(row) }))),
    getMenuHighlights(rows),
  ])

  return {
    categories: [...categories].sort((a, b) => a.localeCompare(b)),
    categoryCounts,
    brands: [...brands].sort((a, b) => a.localeCompare(b)),
    brandsByCategory,
    facets,
    facetsByCategory,
    facetsByBrand,
    catalogFacetsByCategory,
    menuHighlights,
    priceMinCents: facets.priceMinCents,
    priceMaxCents: facets.priceMaxCents,
    countByType,
  }
}

const MENU_HIGHLIGHTS_PER_CATEGORY = 3

/** Ver `StoreFilterOptions.menuHighlights`. Esgotado e anúncio sem foto ficam de fora: o card é vitrine. */
async function getMenuHighlights(
  rows: {
    id: string
    category: string | null
    images: string[] | null
    is_featured: boolean
    featured_position: number | null
    created_at: string
    price_cents: number
    promo_price_cents: number | null
    is_sold_out: boolean
    stock: number | null
  }[]
): Promise<Record<string, StoreProductCard[]>> {
  const discountOf = (row: (typeof rows)[number]) =>
    row.promo_price_cents != null && row.promo_price_cents < row.price_cents ? 1 - row.promo_price_cents / row.price_cents : 0
  const eligible = rows.filter(
    (row) => row.category && (row.images?.length ?? 0) > 0 && !row.is_sold_out && (row.stock == null || row.stock > 0)
  )
  const ranked = [...eligible].sort((a, b) => {
    if (a.is_featured !== b.is_featured) return a.is_featured ? -1 : 1
    if (a.is_featured && b.is_featured) return (a.featured_position ?? Infinity) - (b.featured_position ?? Infinity)
    return discountOf(b) - discountOf(a) || b.created_at.localeCompare(a.created_at)
  })

  const chosen = new Map<string, string[]>()
  for (const row of ranked) {
    const ids = chosen.get(row.category!) ?? []
    if (ids.length < MENU_HIGHLIGHTS_PER_CATEGORY) chosen.set(row.category!, [...ids, row.id])
  }
  const allIds = [...chosen.values()].flat()
  if (allIds.length === 0) return {}

  const { items } = await listStoreProductsPaginated({ type: "store", productIds: allIds, pageSize: 60 })
  const cards = new Map(items.map((item) => [item.id, item]))
  const highlights: Record<string, StoreProductCard[]> = {}
  for (const [category, ids] of chosen) {
    highlights[category] = ids.flatMap((id) => (cards.has(id) ? [cards.get(id)!] : []))
  }
  return highlights
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
 * estoque). Prioriza os marcados manualmente pelo admin (`is_featured`), na
 * ordem definida em `featured_position` (a mesma da vitrine da Loja), e
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
    .order("featured_position", { ascending: true, nullsFirst: false })
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

type RawLinkedProductRow = Omit<LinkedProduct, "price_cents_min" | "price_cents_max" | "price_cents_original"> & {
  promo_price_cents: number | null
  variants: { price_cents_override: number | null; promo_price_cents: number | null }[] | null
}

type RawLinkedProductJoinRow = {
  position: number | null
  store_products: RawLinkedProductRow | RawLinkedProductRow[] | null
}

/** Prioridade de exibição: venda normal primeiro, pronta entrega depois, pré-venda por último. */
const SALE_TYPE_ORDER: Record<LinkedProduct["sale_type"], number> = {
  normal: 0,
  ready_stock: 1,
  pre_order: 2,
}

function saleTypeRank(saleType: LinkedProduct["sale_type"] | null | undefined): number {
  return saleType ? (SALE_TYPE_ORDER[saleType] ?? 99) : 99
}

/** Menor preço "efetivo" entre base e promo — a promo só vale se for de fato mais barata. */
function effectivePriceCents(priceCents: number, promoPriceCents: number | null): number {
  return promoPriceCents != null && promoPriceCents < priceCents ? promoPriceCents : priceCents
}

function mapLinkedProductRow({ variants, promo_price_cents, ...rest }: RawLinkedProductRow): LinkedProduct {
  const basePrice = effectivePriceCents(rest.price_cents, promo_price_cents)
  const variantPrices = (variants ?? []).map((v) => {
    // Variante sem preço próprio (ex.: só muda a cor) herda o preço do produto
    // — inclusive a promo dele. Usar `price_cents` cru aqui fazia a promo do
    // produto ser ignorada sempre que existisse qualquer variante.
    if (v.price_cents_override == null) {
      return effectivePriceCents(rest.price_cents, v.promo_price_cents ?? promo_price_cents)
    }
    return effectivePriceCents(v.price_cents_override, v.promo_price_cents)
  })
  const allPrices = variantPrices.length > 0 ? variantPrices : [basePrice]
  const minPrice = Math.min(...allPrices)
  return {
    ...rest,
    price_cents_min: minPrice,
    price_cents_max: Math.max(...allPrices),
    // Só faz sentido riscar o preço cheio se o exibido for de fato menor.
    price_cents_original: minPrice < rest.price_cents ? rest.price_cents : null,
  }
}

/** Produtos ativos vinculados a um periférico (página de detalhe). */
export async function listProductsByPeripheral(peripheralId: string): Promise<LinkedProduct[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_peripherals")
    .select(
      "position, store_products!inner(id, slug, name, type, price_cents, promo_price_cents, images, stock, is_active, is_sold_out, sale_type, variants:store_product_variants(price_cents_override, promo_price_cents))"
    )
    .eq("peripheral_id", peripheralId)
    .eq("store_products.is_active", true)
    .order("position", { ascending: true })

  if (error) {
    console.error("[store-repository] listProductsByPeripheral:", error)
    return []
  }

  return ((data ?? []) as unknown as RawLinkedProductJoinRow[])
    .map((row) => ({
      position: row.position ?? 0,
      product: Array.isArray(row.store_products) ? row.store_products[0] : row.store_products,
    }))
    .filter((row): row is { position: number; product: RawLinkedProductRow } => row.product != null)
    // Um mesmo periférico pode ter mais de um anúncio (ex.: venda normal e
    // "pronta entrega"). A venda normal é a principal — vem primeiro, e só
    // depois as demais. `position` (definida no admin) desempata dentro do
    // mesmo tipo; sem isso a ordem do Postgres é arbitrária e o destaque da
    // página trocava de produto sozinho.
    .sort(
      (a, b) =>
        saleTypeRank(a.product.sale_type) - saleTypeRank(b.product.sale_type) ||
        a.position - b.position
    )
    .map((row) => mapLinkedProductRow(row.product))
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
  /** false = serviço/digital: sem frete nem prazo de entrega. */
  requires_shipping: boolean
  /** SKU de produto simples. Combinações têm o seu em `skus`. */
  sku: string | null
  /** Lote atual; `null` em produto que não é pré-venda. */
  preorder: PreorderInfo | null
  /** Marcado como Lançamento e ainda no prazo. */
  is_launch: boolean
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
  /** Combinações com SKU/preço/estoque/foto próprios. Ver lib/store-sku.ts. */
  skus: StoreSku[]
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
      "id, slug, name, description, price_cents, promo_price_cents, stock, images, category, brand, type, condition, condition_notes, sale_type, is_sold_out, peripheral_id, features, video_url, requires_shipping"
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

  const baseDetail = product as unknown as Omit<StoreProductDetail, "sku" | "preorder" | "is_launch">
  let linkedPeripheral: LinkedPeripheralRef | null = null

  const [extras, skuRows, specsResult, variantsResult, variantGroupsResult, peripheralsResult, peripheralResult] =
    await Promise.all([
    getProductPageExtras(baseDetail.id, baseDetail.sale_type),
    getSkusForProducts([baseDetail.id]),
    db
      .from("store_product_specs")
      .select("id, label, value, position")
      .eq("product_id", baseDetail.id)
      .order("position", { ascending: true }),
    db
      .from("store_product_variants")
      .select(
        "id, label, price_cents_override, promo_price_cents, stock, position, color, icon, image_url, is_sold_out, variant_images:store_product_variant_images(url, position)"
      )
      .eq("product_id", baseDetail.id)
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
      .eq("product_id", baseDetail.id)
      .order("position", { ascending: true }),
    db
      .from("store_product_peripherals")
      .select("position, peripherals(id, name, brand_id, brands(name), image_url)")
      .eq("product_id", baseDetail.id)
      .order("position", { ascending: true }),
    baseDetail.peripheral_id
      ? db
          .from("peripherals")
          .select("id, name, brand_id, brands(name), image_url")
          .eq("id", baseDetail.peripheral_id as string)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  // Produtos criados pelo autofill antigo guardam o mesmo label duas vezes
  // (ex: Peso); mostra só a primeira ocorrência de cada.
  const seenSpecLabels = new Set<string>()
  const specs = ((specsResult.data ?? []) as unknown as StoreProductSpec[]).filter((s) => {
    const key = s.label.trim().toLowerCase()
    if (seenSpecLabels.has(key)) return false
    seenSpecLabels.add(key)
    return true
  })
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

  const activeVariantIds = new Set(variants.map((variant) => variant.id))
  // Combinação de cor desativada nunca casa com uma seleção: não vai para o cliente.
  const skus: StoreSku[] = skuRows
    .filter((row) => row.variant_id === null || activeVariantIds.has(row.variant_id))
    .map(({ product_id: _productId, ...sku }) => sku)

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

  const detail: StoreProductDetail = { ...baseDetail, ...extras }

  linkedPeripheral = peripheralRow
    ? {
        id: peripheralRow.id,
        name: peripheralRow.name,
        brand: (Array.isArray(peripheralRow.brands) ? peripheralRow.brands[0] : peripheralRow.brands)?.name ?? "",
        image_url: peripheralRow.image_url,
        rank: ranks.get(peripheralRow.id) ?? null,
      }
    : null

  return { product: detail, linkedPeripheral, linkedPeripherals, specs, variants, variantGroups, skus }
})

/**
 * SKU, lote e Lançamento da página do produto. À parte do select principal
 * pelo mesmo motivo de `getLaunchAndPreorderInfo`: código no ar antes da
 * migration 20261213000001 não pode derrubar a página (ela daria 404).
 */
async function getProductPageExtras(
  productId: string,
  saleType: StoreSaleType
): Promise<Pick<StoreProductDetail, "sku" | "preorder" | "is_launch">> {
  const db = createSupabaseAdminClient()
  const [{ data, error }, reserved] = await Promise.all([
    db
      .from("store_products")
      .select("sku, is_launch, launch_until, preorder_status, preorder_batch_name, preorder_ships_at, preorder_limit")
      .eq("id", productId)
      .maybeSingle(),
    saleType === "pre_order" ? getPreorderReserved([productId]) : Promise.resolve(new Map<string, number>()),
  ])
  if (error) console.error("[store-repository] getProductPageExtras:", error)

  return {
    sku: data?.sku ?? null,
    is_launch: data ? isLaunchActive(data, todayKeySaoPaulo()) : false,
    preorder:
      saleType === "pre_order"
        ? {
            status: isPreorderStatus(data?.preorder_status) ? data.preorder_status : "open",
            batchName: data?.preorder_batch_name ?? null,
            shipsAt: data?.preorder_ships_at ?? null,
            limit: data?.preorder_limit ?? null,
            reserved: reserved.get(productId) ?? 0,
          }
        : null,
  }
}

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

/** Combinações (SKU) de um produto, para a matriz do admin. Inclui as de cor desativada: o save as limpa. */
export async function listProductSkus(productId: string): Promise<StoreSku[]> {
  const rows = await getSkusForProducts([productId])
  return rows.map(({ product_id: _productId, ...sku }) => sku)
}

export type ProductSkuInput = {
  variant_id: string | null
  option_ids: string[]
  sku: string | null
  price_cents: number | null
  promo_price_cents: number | null
  stock: number | null
  image_url: string | null
  is_sold_out: boolean
}

export class ProductSkuConflictError extends Error {}

/**
 * Substitui a matriz de combinações de um produto. Upsert pela chave
 * (cor, opções), não delete-then-insert: o `id` da linha precisa sobreviver
 * ao save, porque o diário de reservas (`store_stock_reservations.sku_id`) e
 * os itens de pedido em aberto apontam para ele na hora de devolver estoque.
 *
 * Linha sem nenhum campo próprio não é gravada (ela só herdaria tudo), e a
 * que deixou de vir é apagada. Cor e opção são conferidas contra o produto,
 * para nunca referenciar id de outro.
 */
export async function replaceProductSkus(productId: string, rows: ProductSkuInput[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const [{ data: productVariants, error: variantsError }, { data: productGroups, error: groupsError }, existing] =
    await Promise.all([
      db.from("store_product_variants").select("id").eq("product_id", productId).eq("is_active", true),
      db
        .from("store_product_variant_groups")
        .select("id, options:store_product_variant_group_options(id)")
        .eq("product_id", productId),
      getSkusForProducts([productId]),
    ])
  if (variantsError || groupsError) {
    console.error("[store-repository] replaceProductSkus list:", variantsError ?? groupsError)
    throw new Error("Erro ao atualizar combinações.")
  }

  const variantIds = new Set((productVariants ?? []).map((row) => row.id as string))
  const groupOfOption = new Map<string, string>()
  for (const group of (productGroups ?? []) as unknown as { id: string; options: { id: string }[] | null }[]) {
    for (const option of group.options ?? []) groupOfOption.set(option.id, group.id)
  }

  const hasOwnData = (row: ProductSkuInput) =>
    row.sku != null ||
    row.price_cents != null ||
    row.promo_price_cents != null ||
    row.stock != null ||
    row.image_url != null ||
    row.is_sold_out

  const valid = rows.filter((row) => {
    if (row.variant_id !== null && !variantIds.has(row.variant_id)) return false
    const groups = row.option_ids.map((id) => groupOfOption.get(id))
    if (groups.some((group) => group === undefined)) return false
    // Uma opção por grupo; a combinação "nada escolhido" só existe com cor.
    if (new Set(groups).size !== groups.length) return false
    return row.variant_id !== null || row.option_ids.length > 0
  })

  const keep = valid.filter(hasOwnData)
  const keepKeys = new Set(keep.map((row) => skuKey(row.variant_id, row.option_ids)))
  const staleIds = existing.filter((row) => !keepKeys.has(skuKey(row.variant_id, row.option_ids))).map((row) => row.id)

  if (staleIds.length > 0) {
    const { error } = await db.from("store_product_skus").delete().in("id", staleIds)
    if (error) {
      console.error("[store-repository] replaceProductSkus delete:", error)
      throw new Error("Erro ao atualizar combinações.")
    }
  }

  for (const row of keep) {
    const optionIds = [...row.option_ids].sort()
    const current = findSku(existing, row.variant_id, optionIds)
    const values = {
      sku: row.sku,
      price_cents: row.price_cents,
      promo_price_cents: row.promo_price_cents,
      stock: row.stock,
      image_url: row.image_url,
      is_sold_out: row.is_sold_out,
      updated_at: new Date().toISOString(),
    }
    const { error } = current
      ? await db.from("store_product_skus").update(values).eq("id", current.id)
      : await db
          .from("store_product_skus")
          .insert({ ...values, product_id: productId, variant_id: row.variant_id, option_ids: optionIds })
    if (error) {
      console.error("[store-repository] replaceProductSkus upsert:", error)
      if (error.code === "23505") throw new ProductSkuConflictError(`O SKU "${row.sku}" já está em uso em outro produto.`)
      throw new Error("Erro ao atualizar combinações.")
    }
  }
}

export type CheckoutVariant = {
  id: string
  product_id: string
  label: string
  price_cents_override: number | null
  /** Promoção da cor. O checkout precisa dela para cobrar o mesmo que a vitrine mostra. */
  promo_price_cents: number | null
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
    .select("id, product_id, label, price_cents_override, promo_price_cents, stock, is_active, is_sold_out")
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

/**
 * Substitui os produtos da Loja vinculados a um periférico — o lado espelhado de
 * `replaceProductPeripherals`, usado pelo form da Tierlist.
 *
 * Escreve na MESMA tabela (`store_product_peripherals`) que a página pública lê.
 * Antes isso gravava na coluna legada `store_products.peripheral_id`, que nenhuma
 * tela pública consulta — o vínculo feito aqui simplesmente não tinha efeito.
 */
export async function replacePeripheralProducts(peripheralId: string, productIds: string[]): Promise<void> {
  const db = createSupabaseAdminClient()

  const { error: deleteError } = await db
    .from("store_product_peripherals")
    .delete()
    .eq("peripheral_id", peripheralId)
  if (deleteError) {
    console.error("[store-repository] replacePeripheralProducts delete:", deleteError)
    throw new Error("Erro ao atualizar produtos vinculados.")
  }

  if (productIds.length === 0) return

  const rows = productIds.map((productId, index) => ({
    product_id: productId,
    peripheral_id: peripheralId,
    position: index,
  }))

  const { error: insertError } = await db.from("store_product_peripherals").insert(rows)
  if (insertError) {
    console.error("[store-repository] replacePeripheralProducts insert:", insertError)
    throw new Error("Erro ao atualizar produtos vinculados.")
  }
}

/**
 * Produtos vinculados a um periférico para o admin (inclui inativos, para o
 * vínculo não sumir da tela só porque o anúncio está desligado).
 */
export async function listAdminProductsByPeripheral(peripheralId: string): Promise<LinkedProduct[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_peripherals")
    .select(
      "position, store_products!inner(id, slug, name, type, price_cents, promo_price_cents, images, stock, is_active, is_sold_out, sale_type, variants:store_product_variants(price_cents_override, promo_price_cents))"
    )
    .eq("peripheral_id", peripheralId)
    .order("position", { ascending: true })

  if (error) {
    console.error("[store-repository] listAdminProductsByPeripheral:", error)
    return []
  }

  return ((data ?? []) as unknown as RawLinkedProductJoinRow[])
    .map((row) => (Array.isArray(row.store_products) ? row.store_products[0] : row.store_products))
    .filter((product): product is RawLinkedProductRow => product != null)
    .map(mapLinkedProductRow)
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

// ---------------------------------------------------------------------------
// Revalidação de carrinho
// ---------------------------------------------------------------------------

export type CartLineInput = {
  productId: string
  variantId: string | null
  optionIds: string[]
}

/** Motivo pelo qual uma linha do carrinho não pode mais ser comprada como está. */
export type CartLineIssue =
  | "not_found"
  | "inactive"
  | "sold_out"
  | "variant_not_found"
  | "variant_unavailable"
  | "option_unavailable"
  | "combination_unavailable"
  | "insufficient_stock"
  | "price_changed"
  | "preorder_unavailable"

export type ValidatedCartLine = {
  productId: string
  variantId: string | null
  optionIds: string[]
  /** Nome atual — o do carrinho pode estar desatualizado. */
  name: string | null
  /** Preço atual da combinação, já com promoção aplicada. `null` se indisponível. */
  priceCents: number | null
  /** Estoque atual da combinação; `null` = sem controle de estoque. */
  stock: number | null
  /** Serviço: mesmo preço no PIX e no cartão (ver `isSinglePriceProduct`). */
  singlePrice: boolean
  /** `true` quando a linha ainda pode ser comprada (talvez com menos unidades). */
  available: boolean
  issues: CartLineIssue[]
}

/**
 * Estado atual das linhas de um carrinho, para a tela avisar sobre divergências
 * ANTES do submit do checkout. Reusa exatamente as mesmas consultas e a mesma
 * resolução de combinação (`resolveSelection`) que o checkout usa para cobrar
 * — é isso que garante que o aviso corresponda ao que vai acontecer de fato na
 * compra.
 *
 * Não substitui a validação do checkout (que continua sendo a autoridade e
 * roda de novo, com reserva atômica de estoque): entre esta chamada e o
 * submit ainda cabe uma corrida. O objetivo aqui é reduzir a frequência com
 * que o cliente descobre o problema tarde demais, não eliminá-la.
 */
export async function validateCartLines(
  lines: CartLineInput[]
): Promise<{ lines: ValidatedCartLine[]; cartNeedsShipping: boolean }> {
  const db = createSupabaseAdminClient()

  const productIds = [...new Set(lines.map((l) => l.productId))]
  const variantIds = [
    ...new Set(lines.map((l) => l.variantId).filter((id): id is string => id != null)),
  ]
  const optionIds = [...new Set(lines.flatMap((l) => l.optionIds))]

  const [{ data: products }, variants, options, skus] = await Promise.all([
    db
      .from("store_products")
      .select(
        "id, name, price_cents, promo_price_cents, stock, is_active, is_sold_out, requires_shipping, sale_type, category"
      )
      .in("id", productIds),
    getVariantsForCheckout(variantIds),
    getVariantOptionsForCheckout(optionIds),
    getSkusForProducts(productIds),
  ])
  const preorderInfo = await getLaunchAndPreorderInfo(
    (products ?? []).map((product) => ({ id: product.id, sale_type: product.sale_type }))
  )

  const validated: ValidatedCartLine[] = lines.map((line) => {
    const issues: CartLineIssue[] = []
    const base: Omit<ValidatedCartLine, "available" | "issues"> = {
      productId: line.productId,
      variantId: line.variantId,
      optionIds: line.optionIds,
      name: null,
      priceCents: null,
      stock: null,
      singlePrice: false,
    }

    const product = (products ?? []).find((p) => p.id === line.productId)
    if (!product) return { ...base, available: false, issues: ["not_found"] }

    base.name = product.name
    base.singlePrice = isSinglePriceProduct(product)
    if (!product.is_active) issues.push("inactive")
    if (product.is_sold_out) issues.push("sold_out")

    const variant = line.variantId ? variants.find((v) => v.id === line.variantId) : null
    if (line.variantId && (!variant || variant.product_id !== product.id)) {
      return { ...base, available: false, issues: [...issues, "variant_not_found"] }
    }
    if (variant && (!variant.is_active || variant.is_sold_out)) issues.push("variant_unavailable")

    const selectedOptions = line.optionIds
      .map((id) => options.find((o) => o.id === id))
      .filter((o): o is (typeof options)[number] => o != null)

    if (selectedOptions.length !== line.optionIds.length) {
      return { ...base, available: false, issues: [...issues, "option_unavailable"] }
    }
    if (selectedOptions.some((o) => o.group.product_id !== product.id)) {
      return { ...base, available: false, issues: [...issues, "option_unavailable"] }
    }
    if (selectedOptions.some((o) => o.is_sold_out)) issues.push("option_unavailable")

    // Mesma ordenação por `group.position` que o checkout aplica antes de
    // precificar — a ordem decide qual override vence.
    const orderedOptions = [...selectedOptions].sort(
      (a, b) => a.group.position - b.group.position
    )
    const productSkus = skus.filter((sku) => sku.product_id === product.id)
    const selection = resolveSelection(product, variant ?? null, orderedOptions, productSkus)
    if (selection.sku?.is_sold_out) issues.push("combination_unavailable")

    base.priceCents = selection.price.effectiveCents
    base.stock = selection.stock
    if (base.stock !== null && base.stock <= 0) issues.push("insufficient_stock")

    const preorder = preorderInfo.get(product.id)?.preorder
    if (preorder && effectivePreorderStatus(preorder, product.is_sold_out) !== "open") {
      issues.push("preorder_unavailable")
    }

    return { ...base, available: issues.length === 0, issues }
  })

  // Mesma pergunta que `/checkout/payer-info?productIds=` respondia: há algo
  // para despachar neste carrinho? Vem junto porque a tela precisa das duas
  // respostas no mesmo momento, e eram duas chamadas na abertura do checkout.
  const found = products ?? []
  const cartNeedsShipping =
    found.length > 0 ? found.some((p) => p.requires_shipping !== false) : true

  return { lines: validated, cartNeedsShipping }
}
