import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { ORDER_FULFILLMENT_FLOW } from "@/lib/server/repositories/orders-repository"
import {
  authorFrameFields,
  buildProfileMap,
  type AuthorFrameFields,
} from "@/lib/server/repositories/profile-enrichment"
import { onlyUuids } from "@/lib/server/repositories/_shared"

/**
 * Repositório de Reviews de Produto — reviews de usuários (só compradores
 * verificados) e a análise editorial oficial do Sunano, separadas por
 * natureza: uma é 1-por-usuário-por-produto, a outra é 1-por-produto e
 * assinada por um admin.
 */

export type ReviewOrigin = "order" | "grant"

/**
 * Autor no formato `author_*` que posts, comentários e reviews de periférico
 * já usam: a tela monta a identidade com `authorFrom(...)` e o avatar sai com
 * a moldura da pessoa (ver "Molduras" no AGENTS.md).
 */
export type ReviewAuthorFields = AuthorFrameFields & {
  author_display_name: string
  author_display_slug: string | null
  author_avatar_url: string | null
  author_account_tier: string | null
  author_vip_expires_at: string | null
}

export type ProductReview = ReviewAuthorFields & {
  id: string
  product_id: string
  user_id: string
  rating: number
  title: string | null
  body: string
  is_verified_purchase: boolean
  /** `order` = pedido pago no site; `grant` = liberada pelo admin (cliente que comprou fora). */
  origin: ReviewOrigin
  image_urls: string[]
  status: "published" | "hidden"
  created_at: string
}

export type SunanoReview = {
  id: string
  product_id: string
  rating: number | null
  title: string
  body: string
  video_url: string | null
  published: boolean
  updated_at: string
}

export type ReviewAggregate = { avgRating: number; count: number }

/** Quantas avaliações há com cada nota; índice 0 = 1 estrela … índice 4 = 5 estrelas. */
export type RatingDistribution = [number, number, number, number, number]

export type StoreWideAggregate = ReviewAggregate & { distribution: RatingDistribution }

const REVIEW_COLUMNS =
  "id, product_id, user_id, rating, title, body, is_verified_purchase, origin, image_urls, status, created_at"

type ReviewRow = Omit<ProductReview, keyof ReviewAuthorFields>

function normalizeRow<T extends ReviewRow>(row: T): T {
  return { ...row, origin: row.origin === "grant" ? "grant" : "order", image_urls: row.image_urls ?? [] }
}

/** Anexa o autor (nome, avatar pelo proxy e moldura) em lote, uma consulta para a lista inteira. */
async function withAuthors<T extends ReviewRow>(rows: T[]): Promise<(T & ReviewAuthorFields)[]> {
  if (rows.length === 0) return []
  const profiles = await buildProfileMap(rows.map((r) => r.user_id))
  return rows.map((raw) => {
    const row = normalizeRow(raw)
    const profile = profiles[row.user_id]
    return {
      ...row,
      author_display_name: profile?.display_name?.trim() || "Usuário",
      author_display_slug: profile?.display_slug ?? null,
      author_avatar_url: profile?.avatar_url ?? null,
      author_account_tier: profile?.account_tier ?? null,
      author_vip_expires_at: profile?.vip_expires_at ?? null,
      ...authorFrameFields(profile),
    }
  })
}

/** Reviews publicadas de um produto, com o perfil público do autor. */
export async function listPublishedReviews(productId: string): Promise<ProductReview[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_reviews")
    .select(REVIEW_COLUMNS)
    .eq("product_id", productId)
    .eq("status", "published")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[store-reviews-repository] listPublishedReviews:", error)
    return []
  }
  return withAuthors((data ?? []) as unknown as ReviewRow[])
}

/** Todas as reviews de um produto (incl. ocultas), para moderação no admin. */
export async function listReviewsForAdmin(productId: string): Promise<ProductReview[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_reviews")
    .select(REVIEW_COLUMNS)
    .eq("product_id", productId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[store-reviews-repository] listReviewsForAdmin:", error)
    return []
  }
  return withAuthors((data ?? []) as unknown as ReviewRow[])
}

export async function getUserReviewForProduct(userId: string, productId: string): Promise<ReviewRow | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("store_product_reviews")
    .select(REVIEW_COLUMNS)
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle()
  return data ? normalizeRow(data as unknown as ReviewRow) : null
}

/**
 * Checa se o usuário tem um pedido pago contendo este produto — só quem
 * comprou pode deixar review (evita reviews falsas/astroturfing).
 *
 * Considera qualquer status a partir de "paid" no fluxo pós-venda
 * (ORDER_FULFILLMENT_FLOW), não só "paid": o pedido continua pago quando
 * avança para awaiting_shipping_info/shipped/delivered.
 */
export async function hasVerifiedPurchase(
  userId: string,
  productId: string
): Promise<{ verified: boolean; orderId: string | null }> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_orders")
    .select("id, items")
    .in("status", ORDER_FULFILLMENT_FLOW)
    // Compra de sandbox não é compra: não pode virar selo de "compra
    // verificada" numa avaliação pública.
    .eq("is_sandbox", false)
    .contains("metadata", { user_id: userId })

  if (error || !data) {
    console.error("[store-reviews-repository] hasVerifiedPurchase:", error)
    return { verified: false, orderId: null }
  }

  for (const order of data as unknown as { id: string; items: Array<Record<string, unknown>> }[]) {
    const match = order.items?.some((item) => item.id === productId || item.productId === productId)
    if (match) return { verified: true, orderId: order.id }
  }
  return { verified: false, orderId: null }
}

/**
 * Quem pode avaliar este produto, e com qual origem. Pedido pago no site vem
 * primeiro (carrega "Compra verificada"); sem pedido, vale a liberação que o
 * admin deu para cliente que comprou fora do site.
 */
export async function getReviewEligibility(
  userId: string,
  productId: string
): Promise<{ eligible: false } | { eligible: true; origin: ReviewOrigin; orderId: string | null }> {
  const purchase = await hasVerifiedPurchase(userId, productId)
  if (purchase.verified) return { eligible: true, origin: "order", orderId: purchase.orderId }
  if (await hasReviewGrant(userId, productId)) return { eligible: true, origin: "grant", orderId: null }
  return { eligible: false }
}

export async function createReview(params: {
  productId: string
  userId: string
  orderId: string | null
  origin: ReviewOrigin
  rating: number
  title: string | null
  body: string
  imageUrls: string[]
}): Promise<ReviewRow & { aura_rewarded: number | null }> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_reviews")
    .insert({
      product_id: params.productId,
      user_id: params.userId,
      order_id: params.orderId,
      rating: params.rating,
      title: params.title,
      body: params.body,
      // Só pedido no site é compra verificada; a liberação do admin sai como
      // "Cliente Sunano" (ver 20261219000000).
      is_verified_purchase: params.origin === "order",
      origin: params.origin,
      image_urls: params.imageUrls,
    })
    .select(`${REVIEW_COLUMNS}, aura_rewarded`)
    .single()

  if (error) {
    console.error("[store-reviews-repository] createReview:", error)
    throw error
  }
  return normalizeRow(data as unknown as ReviewRow & { aura_rewarded: number | null })
}

export async function updateReviewStatus(
  productId: string,
  reviewId: string,
  status: "published" | "hidden"
): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("store_product_reviews")
    .update({ status })
    .eq("id", reviewId)
    .eq("product_id", productId)
  if (error) {
    console.error("[store-reviews-repository] updateReviewStatus:", error)
    throw error
  }
}

export async function getReviewAggregate(productId: string): Promise<ReviewAggregate> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_reviews")
    .select("rating")
    .eq("product_id", productId)
    .eq("status", "published")

  if (error || !data || data.length === 0) return { avgRating: 0, count: 0 }
  const ratings = (data as unknown as { rating: number }[]).map((r) => r.rating)
  const avgRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length
  return { avgRating, count: ratings.length }
}

export type StoreWideReview = ProductReview & {
  product: { id: string; slug: string; name: string; images: string[]; category: string | null } | null
}

/**
 * Nota geral da loja: avaliações publicadas no site E depoimentos publicados
 * pelo admin, juntos. É o mesmo número no Hero da loja e em /loja/avaliacoes;
 * quando o Hero contava só as do site, as duas telas davam notas diferentes.
 */
export async function getStoreWideReviewAggregate(): Promise<StoreWideAggregate> {
  const db = createSupabaseAdminClient()
  const [reviews, testimonials] = await Promise.all([
    db.from("store_product_reviews").select("rating").eq("status", "published"),
    db.from("store_testimonials").select("rating").eq("is_published", true),
  ])
  if (reviews.error) console.error("[store-reviews-repository] getStoreWideReviewAggregate:", reviews.error)
  if (testimonials.error) console.error("[store-reviews-repository] getStoreWideReviewAggregate:", testimonials.error)

  const ratings = [
    ...((reviews.data ?? []) as { rating: number }[]),
    ...((testimonials.data ?? []) as { rating: number }[]),
  ].map((r) => r.rating)
  return aggregateRatings(ratings)
}

export function aggregateRatings(ratings: number[]): StoreWideAggregate {
  const distribution: RatingDistribution = [0, 0, 0, 0, 0]
  let sum = 0
  for (const rating of ratings) {
    if (rating < 1 || rating > 5) continue
    distribution[rating - 1] += 1
    sum += rating
  }
  const count = distribution.reduce((a, b) => a + b, 0)
  return { avgRating: count === 0 ? 0 : sum / count, count, distribution }
}

/**
 * Reviews publicadas de qualquer produto da loja, mais recentes primeiro:
 * vitrine de avaliações gerais. O teto é só uma trava de sanidade: a página
 * mostra TODAS e filtra por nota no cliente.
 */
export async function listStoreWideReviews(limit = 1000): Promise<StoreWideReview[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_reviews")
    .select(`${REVIEW_COLUMNS}, product:store_products(id, slug, name, images, category, is_active)`)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(limit)

  if (error) {
    console.error("[store-reviews-repository] listStoreWideReviews:", error)
    return []
  }
  type Joined = { id: string; slug: string; name: string; images: string[]; category: string | null; is_active: boolean }
  const rows = (data ?? []) as unknown as (ReviewRow & { product: Joined | Joined[] | null })[]
  const withProduct = rows.map(({ product, ...row }) => {
    const p = Array.isArray(product) ? product[0] : product
    return {
      ...row,
      // Produto desativado não tem página: a avaliação fica, o link não.
      product: p && p.is_active ? { id: p.id, slug: p.slug, name: p.name, images: p.images ?? [], category: p.category } : null,
    }
  })
  return withAuthors(withProduct)
}

// ────────────────────────────────────────────
// Liberação de avaliação para cliente antigo (`store_review_grants`)
// ────────────────────────────────────────────

export async function hasReviewGrant(userId: string, productId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_review_grants")
    .select("id")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle()
  if (error) console.error("[store-reviews-repository] hasReviewGrant:", error)
  return Boolean(data)
}

/** Produto que a pessoa pode avaliar agora e ainda não avaliou. */
export type PendingProductReview = {
  productId: string
  slug: string
  name: string
  image: string | null
  category: string | null
  origin: ReviewOrigin
}

/**
 * O que esta pessoa tem para avaliar: produtos de pedido CONCLUÍDO (entregue,
 * ou pago quando não há entrega) e os liberados pelo admin, menos o que ela
 * já avaliou. Alimenta o convite "Avalie sua experiência" em Meus Pedidos.
 *
 * Pedido pago e ainda não entregue também pode avaliar pela página do
 * produto (`hasVerifiedPurchase`), mas não entra no convite: pedir opinião
 * antes de a pessoa receber o produto é pedir uma avaliação vazia.
 */
export async function listPendingReviewsForUser(userId: string): Promise<PendingProductReview[]> {
  const db = createSupabaseAdminClient()
  const [orders, grants, reviewed] = await Promise.all([
    db
      .from("store_orders")
      .select("items")
      .eq("is_sandbox", false)
      .contains("metadata", { user_id: userId })
      // Valores fixos, nada vindo do cliente.
      .or("status.eq.delivered,and(status.eq.paid,requires_shipping_address.eq.false)"),
    db.from("store_review_grants").select("product_id").eq("user_id", userId),
    db.from("store_product_reviews").select("product_id").eq("user_id", userId),
  ])
  if (orders.error) console.error("[store-reviews-repository] listPendingReviewsForUser:", orders.error)
  if (grants.error) console.error("[store-reviews-repository] listPendingReviewsForUser:", grants.error)

  const done = new Set(((reviewed.data ?? []) as { product_id: string }[]).map((r) => r.product_id))
  const origin = new Map<string, ReviewOrigin>()
  for (const order of (orders.data ?? []) as { items: Array<Record<string, unknown>> | null }[]) {
    for (const item of order.items ?? []) {
      const id = typeof item.id === "string" ? item.id : typeof item.productId === "string" ? item.productId : null
      if (id && !done.has(id)) origin.set(id, "order")
    }
  }
  for (const grant of (grants.data ?? []) as { product_id: string }[]) {
    if (!done.has(grant.product_id) && !origin.has(grant.product_id)) origin.set(grant.product_id, "grant")
  }

  const ids = onlyUuids([...origin.keys()])
  if (ids.length === 0) return []

  const { data: products, error } = await db
    .from("store_products")
    .select("id, slug, name, images, category")
    .in("id", ids)
    .eq("is_active", true)
  if (error) {
    console.error("[store-reviews-repository] listPendingReviewsForUser:", error)
    return []
  }

  return ((products ?? []) as { id: string; slug: string; name: string; images: string[] | null; category: string | null }[]).map(
    (p) => ({
      productId: p.id,
      slug: p.slug,
      name: p.name,
      image: p.images?.[0] ?? null,
      category: p.category,
      origin: origin.get(p.id) ?? "order",
    })
  )
}

export async function getSunanoReview(productId: string, includeUnpublished = false): Promise<SunanoReview | null> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("store_product_sunano_reviews")
    .select("id, product_id, rating, title, body, video_url, published, updated_at")
    .eq("product_id", productId)

  if (!includeUnpublished) query = query.eq("published", true)

  const { data } = await query.maybeSingle()
  return (data ?? null) as SunanoReview | null
}

export async function upsertSunanoReview(params: {
  productId: string
  adminId: string
  rating: number | null
  title: string
  body: string
  videoUrl: string | null
  published: boolean
}): Promise<SunanoReview> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_sunano_reviews")
    .upsert(
      {
        product_id: params.productId,
        rating: params.rating,
        title: params.title,
        body: params.body,
        video_url: params.videoUrl,
        author_admin_id: params.adminId,
        published: params.published,
      },
      { onConflict: "product_id" }
    )
    .select("id, product_id, rating, title, body, video_url, published, updated_at")
    .single()

  if (error) {
    console.error("[store-reviews-repository] upsertSunanoReview:", error)
    throw error
  }
  return data as unknown as SunanoReview
}
