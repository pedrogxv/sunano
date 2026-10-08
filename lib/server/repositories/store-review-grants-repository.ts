import "server-only"

import { profileMediaProxyUrl } from "@/lib/account-tier"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import { onlyUuids } from "@/lib/server/repositories/_shared"
import { broadcastSystemNotification } from "@/lib/server/repositories/notifications-repository"
import { getProfileFramesByUser } from "@/lib/server/repositories/vip-founder-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { STORE_REVIEW_AURA, STORE_REVIEW_WITH_PHOTO_AURA } from "@/lib/store-review-aura"

/**
 * Liberação de avaliação para cliente que comprou FORA do site
 * (`store_review_grants`, migration 20261219000000). O admin escolhe a
 * conta e os produtos; a pessoa avalia pelo próprio perfil e a avaliação sai
 * como "Cliente Sunano", nunca como "Compra verificada".
 */

export type AdminReviewGrant = {
  id: string
  note: string | null
  created_at: string
  user: { id: string; displayName: string; avatarUrl: string | null; frame: ProfileFrameIdentity }
  product: { id: string; name: string; slug: string; image: string | null }
  /** Nota da avaliação feita com esta liberação; null = ainda não avaliou. */
  reviewRating: number | null
}

export async function listReviewGrantsForAdmin(): Promise<AdminReviewGrant[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("store_review_grants")
    .select("id, user_id, product_id, note, created_at, product:store_products(id, name, slug, images)")
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    console.error("[store-review-grants-repository] listReviewGrantsForAdmin:", error)
    throw error
  }

  type Product = { id: string; name: string; slug: string; images: string[] | null }
  const rows = (data ?? []) as unknown as {
    id: string
    user_id: string
    product_id: string
    note: string | null
    created_at: string
    product: Product | Product[] | null
  }[]
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const productIds = [...new Set(rows.map((r) => r.product_id))]
  const [profiles, reviews, frameOf] = await Promise.all([
    db.from("user_profiles").select("id, display_name, avatar_url, account_tier, vip_expires_at").in("id", userIds),
    db
      .from("store_product_reviews")
      .select("user_id, product_id, rating")
      .in("user_id", userIds)
      .in("product_id", productIds),
    // Em lote: a lista é de pessoas, então o avatar sai com a moldura.
    getProfileFramesByUser(userIds),
  ])

  const profileById = new Map(
    (
      (profiles.data ?? []) as {
        id: string
        display_name: string | null
        avatar_url: string | null
        account_tier: string | null
        vip_expires_at: string | null
      }[]
    ).map((p) => [
      p.id,
      {
        displayName: p.display_name?.trim() || `Membro ${p.id.slice(0, 6)}`,
        // Nunca a coluna crua, ver `profileMediaProxyUrl` em `lib/account-tier.ts`.
        avatarUrl: p.avatar_url ? profileMediaProxyUrl(p.id, "avatar") : null,
        frame: frameOf(p.id, p.account_tier, p.vip_expires_at),
      },
    ])
  )
  const ratingByPair = new Map(
    ((reviews.data ?? []) as { user_id: string; product_id: string; rating: number }[]).map((r) => [
      `${r.user_id}:${r.product_id}`,
      r.rating,
    ])
  )

  return rows.map((row) => {
    const product = Array.isArray(row.product) ? row.product[0] : row.product
    return {
      id: row.id,
      note: row.note,
      created_at: row.created_at,
      user: {
        id: row.user_id,
        ...(profileById.get(row.user_id) ?? {
          displayName: "Conta removida",
          avatarUrl: null,
          frame: frameOf(row.user_id, null, null),
        }),
      },
      product: {
        id: row.product_id,
        name: product?.name ?? "Produto removido",
        slug: product?.slug ?? "",
        image: product?.images?.[0] ?? null,
      },
      reviewRating: ratingByPair.get(`${row.user_id}:${row.product_id}`) ?? null,
    }
  })
}

/**
 * Libera os produtos para a pessoa avaliar e avisa no sino. Liberação que já
 * existia é ignorada (não duplica nem reavisa). Devolve quantas são novas.
 */
export async function createReviewGrants(params: {
  userId: string
  productIds: string[]
  grantedBy: string
  note: string | null
}): Promise<{ created: number }> {
  const db = createSupabaseAdminClient()
  const productIds = onlyUuids(params.productIds, 50)
  if (productIds.length === 0) return { created: 0 }

  const [{ data: user }, { data: products, error: productsError }] = await Promise.all([
    db.from("user_profiles").select("id").eq("id", params.userId).maybeSingle(),
    db.from("store_products").select("id, name").in("id", productIds),
  ])
  if (!user) throw new GrantInputError("Conta não encontrada.")
  if (productsError) throw productsError
  const found = (products ?? []) as { id: string; name: string }[]
  if (found.length !== productIds.length) throw new GrantInputError("Produto não encontrado.")

  const { data: inserted, error } = await db
    .from("store_review_grants")
    .upsert(
      found.map((p) => ({
        user_id: params.userId,
        product_id: p.id,
        granted_by: params.grantedBy,
        note: params.note,
      })),
      { onConflict: "user_id,product_id", ignoreDuplicates: true }
    )
    .select("product_id")

  if (error) {
    console.error("[store-review-grants-repository] createReviewGrants:", error)
    throw error
  }

  const newIds = new Set(((inserted ?? []) as { product_id: string }[]).map((r) => r.product_id))
  const newNames = found.filter((p) => newIds.has(p.id)).map((p) => p.name)
  if (newNames.length > 0) {
    // Best-effort: falhar ao avisar não desfaz a liberação.
    try {
      const what = newNames.length === 1 ? newNames[0] : `${newNames.length} produtos que você comprou com a gente`
      await broadcastSystemNotification({
        userId: params.userId,
        title: "Avalie sua compra e ganhe Aura",
        body: `Liberamos a avaliação de ${what}. Conte como foi: +${STORE_REVIEW_AURA} de Aura, ou +${STORE_REVIEW_WITH_PHOTO_AURA} com foto.`,
        link: "/conta/pedidos#avaliar",
      })
    } catch (err) {
      console.error("[store-review-grants-repository] aviso da liberação falhou:", err)
    }
  }

  return { created: newNames.length }
}

export async function deleteReviewGrant(id: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("store_review_grants").delete().eq("id", id)
  if (error) {
    console.error("[store-review-grants-repository] deleteReviewGrant:", error)
    throw error
  }
}

/** Erro de entrada do admin (conta/produto inexistente): vira 400, não 500. */
export class GrantInputError extends Error {}
