import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

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
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
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
  images: string[]
  stock: number
  is_active: boolean
}

const CARD_COLUMNS =
  "id, slug, name, price_cents, stock, images, category, type, condition, condition_notes"

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
  return (data ?? []) as unknown as StoreProductCard[]
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

/** Produtos ativos vinculados a um periférico (página de detalhe). */
export async function listProductsByPeripheral(peripheralId: string): Promise<LinkedProduct[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_products")
    .select("id, slug, name, type, price_cents, images, stock, is_active")
    .eq("peripheral_id", peripheralId)
    .eq("is_active", true)

  if (error) {
    console.error("[store-repository] listProductsByPeripheral:", error)
    return []
  }
  return (data ?? []) as unknown as LinkedProduct[]
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
}

/**
 * Detalhe de um produto da Loja/Bazar pelo slug, já com o produto vinculado
 * do outro tipo e o periférico relacionado. Consome a página de detalhe.
 */
export async function getStoreProductDetail(
  slug: string,
  type: "store" | "bazaar"
): Promise<StoreProductDetailResult | null> {
  const db = createSupabaseAdminClient()

  const { data: product, error } = await db
    .from("store_products")
    .select(
      "id, slug, name, description, price_cents, stock, images, category, type, condition, condition_notes, peripheral_id"
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

  if (detail.peripheral_id) {
    const oppositeType = type === "store" ? "bazaar" : "store"
    const [{ data: linked }, { data: peripheral }] = await Promise.all([
      db
        .from("store_products")
        .select("id, slug, name, price_cents, images, stock, condition, condition_notes")
        .eq("peripheral_id", detail.peripheral_id)
        .eq("type", oppositeType)
        .eq("is_active", true)
        .maybeSingle(),
      db
        .from("peripherals")
        .select("id, name, brand_id, brands(name), image_url")
        .eq("id", detail.peripheral_id)
        .maybeSingle(),
    ])
    linkedProduct = (linked ?? null) as unknown as LinkedStoreItem | null
    const peripheralRow = peripheral as unknown as
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
  }

  return { product: detail, linkedProduct, linkedPeripheral }
}
