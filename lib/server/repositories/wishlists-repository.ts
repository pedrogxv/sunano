import "server-only"

import { randomBytes } from "crypto"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import type { LinkedProduct } from "@/lib/server/repositories/store-repository"

/**
 * Repositório de Listas de Compras (wishlists estilo Amazon) — uma lista
 * padrão "Favoritos" por usuário mais listas nomeadas extras, cada uma
 * podendo virar pública com um link compartilhável. Toda mutação recebe
 * userId e filtra por ele na própria query (posse garantida na consulta,
 * não checada depois) — nunca confiar em um wishlistId isolado.
 */

export type Wishlist = {
  id: string
  user_id: string
  name: string
  is_default: boolean
  is_public: boolean
  share_token: string | null
  created_at: string
  item_count?: number
}

export type WishlistItem = {
  id: string
  product_id: string
  note: string | null
  product: LinkedProduct | null
}

const PRODUCT_COLUMNS = "id, slug, name, type, price_cents, images, stock, is_active, is_sold_out"

export async function listUserWishlists(userId: string): Promise<Wishlist[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_wishlists")
    .select("id, user_id, name, is_default, is_public, share_token, created_at, store_wishlist_items(count)")
    .eq("user_id", userId)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[wishlists-repository] listUserWishlists:", error)
    return []
  }

  return ((data ?? []) as unknown as Array<Wishlist & { store_wishlist_items: { count: number }[] }>).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    name: row.name,
    is_default: row.is_default,
    is_public: row.is_public,
    share_token: row.share_token,
    created_at: row.created_at,
    item_count: row.store_wishlist_items?.[0]?.count ?? 0,
  }))
}

export async function getOrCreateDefaultWishlist(userId: string): Promise<Wishlist> {
  const db = createSupabaseAdminClient()
  const { data: existing } = await db
    .from("store_wishlists")
    .select("id, user_id, name, is_default, is_public, share_token, created_at")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle()

  if (existing) return existing as unknown as Wishlist

  // Ao contrário de listas nomeadas extras (que nascem privadas e só viram
  // públicas se o dono pedir), a lista padrão já nasce pública — ela é o que
  // aparece na seção "Lista de Compras" do perfil por padrão. O dono pode
  // escondê-la com o mesmo toggle `is_public` que já existe para as demais.
  const { data, error } = await db
    .from("store_wishlists")
    .insert({ user_id: userId, name: "Favoritos", is_default: true, is_public: true })
    .select("id, user_id, name, is_default, is_public, share_token, created_at")
    .single()

  if (error) {
    console.error("[wishlists-repository] getOrCreateDefaultWishlist:", error)
    throw error
  }
  return data as unknown as Wishlist
}

export async function getWishlistById(id: string, userId: string): Promise<Wishlist | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("store_wishlists")
    .select("id, user_id, name, is_default, is_public, share_token, created_at")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()
  return (data as Wishlist | null) ?? null
}

export type WishlistOwner = {
  display_name: string | null
  display_slug: string | null
  avatar_url: string | null
}

export async function getWishlistByShareToken(
  token: string
): Promise<{ wishlist: Wishlist; owner: WishlistOwner | null; items: WishlistItem[] } | null> {
  const db = createSupabaseAdminClient()
  const { data: wishlist } = await db
    .from("store_wishlists")
    .select("id, user_id, name, is_default, is_public, share_token, created_at")
    .eq("share_token", token)
    .eq("is_public", true)
    .maybeSingle()

  if (!wishlist) return null

  const row = wishlist as unknown as Wishlist
  const [{ data: owner }, items] = await Promise.all([
    db.from("user_profiles").select("display_name, display_slug, avatar_url").eq("id", row.user_id).maybeSingle(),
    listWishlistItemsPublic(row.id),
  ])

  return { wishlist: row, owner: (owner as WishlistOwner | null) ?? null, items }
}

async function listWishlistItemsPublic(wishlistId: string): Promise<WishlistItem[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_wishlist_items")
    .select(`id, product_id, note, store_products(${PRODUCT_COLUMNS})`)
    .eq("wishlist_id", wishlistId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[wishlists-repository] listWishlistItemsPublic:", error)
    return []
  }

  return ((data ?? []) as unknown as Array<{ id: string; product_id: string; note: string | null; store_products: LinkedProduct | LinkedProduct[] | null }>).map(
    (row) => ({
      id: row.id,
      product_id: row.product_id,
      note: row.note,
      product: Array.isArray(row.store_products) ? (row.store_products[0] ?? null) : row.store_products,
    })
  )
}

export async function listWishlistItems(wishlistId: string, userId: string): Promise<WishlistItem[]> {
  const owned = await getWishlistById(wishlistId, userId)
  if (!owned) return []
  return listWishlistItemsPublic(wishlistId)
}

export async function createWishlist(userId: string, name: string): Promise<Wishlist> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_wishlists")
    .insert({ user_id: userId, name })
    .select("id, user_id, name, is_default, is_public, share_token, created_at")
    .single()

  if (error) {
    console.error("[wishlists-repository] createWishlist:", error)
    throw error
  }
  return data as unknown as Wishlist
}

export async function renameWishlist(id: string, userId: string, name: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("store_wishlists").update({ name }).eq("id", id).eq("user_id", userId)
  if (error) {
    console.error("[wishlists-repository] renameWishlist:", error)
    throw error
  }
}

export async function deleteWishlist(id: string, userId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("store_wishlists").delete().eq("id", id).eq("user_id", userId).eq("is_default", false)
  if (error) {
    console.error("[wishlists-repository] deleteWishlist:", error)
    throw error
  }
}

export async function setWishlistVisibility(
  id: string,
  userId: string,
  isPublic: boolean
): Promise<{ share_token: string | null }> {
  const db = createSupabaseAdminClient()

  const current = await getWishlistById(id, userId)
  if (!current) throw new Error("Lista não encontrada.")

  const shareToken = isPublic ? (current.share_token ?? randomBytes(16).toString("base64url")) : current.share_token

  const { error } = await db
    .from("store_wishlists")
    .update({ is_public: isPublic, share_token: shareToken })
    .eq("id", id)
    .eq("user_id", userId)

  if (error) {
    console.error("[wishlists-repository] setWishlistVisibility:", error)
    throw error
  }
  return { share_token: isPublic ? shareToken : current.share_token }
}

export async function addItemToWishlist(wishlistId: string, userId: string, productId: string): Promise<void> {
  const owned = await getWishlistById(wishlistId, userId)
  if (!owned) throw new Error("Lista não encontrada.")

  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("store_wishlist_items")
    .insert({ wishlist_id: wishlistId, product_id: productId })
  if (error && error.code !== "23505") {
    console.error("[wishlists-repository] addItemToWishlist:", error)
    throw error
  }
}

export async function removeItemFromWishlist(wishlistId: string, userId: string, productId: string): Promise<void> {
  const owned = await getWishlistById(wishlistId, userId)
  if (!owned) throw new Error("Lista não encontrada.")

  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("store_wishlist_items")
    .delete()
    .eq("wishlist_id", wishlistId)
    .eq("product_id", productId)
  if (error) {
    console.error("[wishlists-repository] removeItemFromWishlist:", error)
    throw error
  }
}

export async function isProductWishlisted(userId: string, productId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_wishlist_items")
    .select("id, store_wishlists!inner(user_id)")
    .eq("product_id", productId)
    .eq("store_wishlists.user_id", userId)
    .limit(1)

  if (error) {
    console.error("[wishlists-repository] isProductWishlisted:", error)
    return false
  }
  return (data?.length ?? 0) > 0
}

/** Toggle rápido na lista padrão — usado pelo botão de coração na página do produto. */
export async function toggleDefaultWishlistItem(
  userId: string,
  productId: string
): Promise<{ wishlisted: boolean }> {
  const defaultList = await getOrCreateDefaultWishlist(userId)
  const db = createSupabaseAdminClient()

  const { data: existing } = await db
    .from("store_wishlist_items")
    .select("id")
    .eq("wishlist_id", defaultList.id)
    .eq("product_id", productId)
    .maybeSingle()

  if (existing) {
    await removeItemFromWishlist(defaultList.id, userId, productId)
    return { wishlisted: false }
  }

  await addItemToWishlist(defaultList.id, userId, productId)
  return { wishlisted: true }
}

/**
 * Listas nomeadas (não-padrão) públicas de um usuário com pelo menos 1 item
 * — seção "Listas de compras públicas" do perfil. A lista padrão tem seção
 * própria (`getDefaultWishlistShowcase`), pra não aparecer duplicada aqui.
 */
export async function listPublicWishlistsForUser(userId: string): Promise<Wishlist[]> {
  const all = await listUserWishlists(userId)
  return all.filter((w) => !w.is_default && w.is_public && (w.item_count ?? 0) > 0)
}

/**
 * Lista padrão ("Favoritos") do usuário para a seção "Lista de Compras" do
 * perfil. Sempre retorna quando ela existe e tem pelo menos 1 item — mesmo
 * escondida (`is_public=false`) — porque o dono precisa continuar vendo a
 * própria seção (com o toggle) para poder reexibi-la; quem decide esconder
 * de visitantes é o chamador (`getProfileShowcase`), a partir de `is_public`.
 */
export async function getDefaultWishlistShowcase(
  userId: string
): Promise<{ id: string; name: string; is_public: boolean; items: WishlistItem[] } | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("store_wishlists")
    .select("id, name, is_public")
    .eq("user_id", userId)
    .eq("is_default", true)
    .maybeSingle()

  const row = data as { id: string; name: string; is_public: boolean } | null
  if (!row) return null

  const items = await listWishlistItemsPublic(row.id)
  if (items.length === 0) return null

  return { id: row.id, name: row.name, is_public: row.is_public, items }
}
