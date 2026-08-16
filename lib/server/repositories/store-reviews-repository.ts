import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório de Reviews de Produto — reviews de usuários (só compradores
 * verificados) e a análise editorial oficial do Sunano, separadas por
 * natureza: uma é 1-por-usuário-por-produto, a outra é 1-por-produto e
 * assinada por um admin.
 */

export type ProductReview = {
  id: string
  product_id: string
  user_id: string
  rating: number
  title: string | null
  body: string
  is_verified_purchase: boolean
  status: "published" | "hidden"
  created_at: string
  author: { display_name: string | null; avatar_url: string | null } | null
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

/** Reviews publicadas de um produto, com o perfil público do autor. */
export async function listPublishedReviews(productId: string): Promise<ProductReview[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_reviews")
    .select("id, product_id, user_id, rating, title, body, is_verified_purchase, status, created_at")
    .eq("product_id", productId)
    .eq("status", "published")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[store-reviews-repository] listPublishedReviews:", error)
    return []
  }
  const rows = (data ?? []) as unknown as Omit<ProductReview, "author">[]
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const { data: profiles } = await db
    .from("user_profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds)

  const profileMap = new Map(
    ((profiles ?? []) as unknown as { id: string; display_name: string | null; avatar_url: string | null }[]).map(
      (p) => [p.id, { display_name: p.display_name, avatar_url: p.avatar_url }]
    )
  )

  return rows.map((r) => ({ ...r, author: profileMap.get(r.user_id) ?? null }))
}

/** Todas as reviews de um produto (incl. ocultas), para moderação no admin. */
export async function listReviewsForAdmin(productId: string): Promise<ProductReview[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_product_reviews")
    .select("id, product_id, user_id, rating, title, body, is_verified_purchase, status, created_at")
    .eq("product_id", productId)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[store-reviews-repository] listReviewsForAdmin:", error)
    return []
  }
  return ((data ?? []) as unknown as Omit<ProductReview, "author">[]).map((r) => ({ ...r, author: null }))
}

export async function getUserReviewForProduct(userId: string, productId: string): Promise<ProductReview | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("store_product_reviews")
    .select("id, product_id, user_id, rating, title, body, is_verified_purchase, status, created_at")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle()
  return data ? { ...(data as unknown as Omit<ProductReview, "author">), author: null } : null
}

/**
 * Checa se o usuário tem um pedido pago contendo este produto — só quem
 * comprou pode deixar review (evita reviews falsas/astroturfing).
 */
export async function hasVerifiedPurchase(
  userId: string,
  productId: string
): Promise<{ verified: boolean; orderId: string | null }> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_orders")
    .select("id, items")
    .eq("status", "paid")
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

export async function createReview(params: {
  productId: string
  userId: string
  orderId: string | null
  rating: number
  title: string | null
  body: string
  isVerified: boolean
}): Promise<ProductReview> {
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
      is_verified_purchase: params.isVerified,
    })
    .select("id, product_id, user_id, rating, title, body, is_verified_purchase, status, created_at")
    .single()

  if (error) {
    console.error("[store-reviews-repository] createReview:", error)
    throw error
  }
  return { ...(data as unknown as Omit<ProductReview, "author">), author: null }
}

export async function updateReviewStatus(reviewId: string, status: "published" | "hidden"): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("store_product_reviews").update({ status }).eq("id", reviewId)
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
