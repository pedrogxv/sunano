import "server-only"

import { listStoreProductsPaginated, type StoreProductCard } from "@/lib/server/repositories/store-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Favoritos da Loja: `store_product_favorites` (20261204000000). Sem grant
 * para cliente: tudo passa por /api/store/favorites com service_role, e o
 * dono é sempre o usuário da sessão resolvida na rota.
 */

/** Teto por conta: a lista é para lembrar de produtos, não um espelho do catálogo. */
export const MAX_STORE_FAVORITES = 200

export async function listFavoriteProductIds(userId: string): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_favorites")
    .select("product_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_STORE_FAVORITES)

  if (error) {
    console.error("[store-favorites-repository] listFavoriteProductIds:", error)
    throw error
  }
  return (data ?? []).map((row) => row.product_id)
}

/**
 * Cards dos favoritos, do mais recente para o mais antigo. Só produto ativo:
 * um anúncio pausado some da lista (e volta sozinho se reativarem), em vez
 * de levar a uma página que não existe mais para o cliente.
 */
export async function listFavoriteProducts(userId: string): Promise<StoreProductCard[]> {
  const ids = await listFavoriteProductIds(userId)
  if (ids.length === 0) return []

  const { items } = await listStoreProductsPaginated({ type: "store", productIds: ids, pageSize: ids.length })
  const order = new Map(ids.map((id, index) => [id, index]))
  return items.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
}

export type FavoriteWriteResult = { ok: true } | { ok: false; error: string; status: number }

export async function addFavorite(userId: string, productId: string): Promise<FavoriteWriteResult> {
  const db = createSupabaseAdminClient()

  const { data: product } = await db
    .from("store_products")
    .select("id")
    .eq("id", productId)
    .eq("is_active", true)
    .maybeSingle()
  if (!product) return { ok: false, error: "Produto não encontrado.", status: 404 }

  const { count } = await db
    .from("store_product_favorites")
    .select("product_id", { count: "exact", head: true })
    .eq("user_id", userId)
  if ((count ?? 0) >= MAX_STORE_FAVORITES) {
    return { ok: false, error: `Você chegou ao limite de ${MAX_STORE_FAVORITES} favoritos.`, status: 409 }
  }

  // `ignoreDuplicates`: favoritar de novo (duplo clique, duas abas) não é erro.
  const { error } = await db
    .from("store_product_favorites")
    .upsert({ user_id: userId, product_id: productId }, { onConflict: "user_id,product_id", ignoreDuplicates: true })

  if (error) {
    console.error("[store-favorites-repository] addFavorite:", error)
    return { ok: false, error: "Não foi possível favoritar.", status: 500 }
  }
  return { ok: true }
}

export async function removeFavorite(userId: string, productId: string): Promise<FavoriteWriteResult> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("store_product_favorites")
    .delete()
    .eq("user_id", userId)
    .eq("product_id", productId)

  if (error) {
    console.error("[store-favorites-repository] removeFavorite:", error)
    return { ok: false, error: "Não foi possível remover dos favoritos.", status: 500 }
  }
  return { ok: true }
}
