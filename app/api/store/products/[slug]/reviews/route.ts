import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { storeApiMaintenanceResponse } from "@/lib/server/auth/store-maintenance-gate"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  createReview,
  getReviewAggregate,
  getReviewEligibility,
  getSunanoReview,
  getUserReviewForProduct,
  listPublishedReviews,
} from "@/lib/server/repositories/store-reviews-repository"
import { isOwnedStoreReviewImageUrl } from "@/lib/server/store-review-media"
import { MAX_STORE_REVIEW_IMAGES } from "@/lib/store-review-aura"

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional().nullable(),
  body: z.string().trim().min(1, "Escreva o que você achou do produto.").max(4000),
  imageUrls: z.array(z.string().url().max(500)).max(MAX_STORE_REVIEW_IMAGES).optional().default([]),
})

async function resolveProductId(slug: string): Promise<string | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("store_products").select("id").eq("slug", slug).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  const { slug } = await context.params
  const productId = await resolveProductId(slug)
  if (!productId) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

  const user = await getRequestUser(request)

  const [reviews, aggregate, sunanoReview, userReview, eligibility] = await Promise.all([
    listPublishedReviews(productId),
    getReviewAggregate(productId),
    getSunanoReview(productId),
    user ? getUserReviewForProduct(user.id, productId) : Promise.resolve(null),
    user ? getReviewEligibility(user.id, productId) : Promise.resolve({ eligible: false as const }),
  ])

  return NextResponse.json({
    reviews,
    aggregate,
    sunanoReview,
    userReview,
    canReview: Boolean(user) && eligibility.eligible && !userReview,
  })
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const blocked = await storeApiMaintenanceResponse()
  if (blocked) return blocked

  const { slug } = await context.params
  const productId = await resolveProductId(slug)
  if (!productId) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta para avaliar." }, { status: 401 })

  const existing = await getUserReviewForProduct(user.id, productId)
  if (existing) {
    return NextResponse.json({ error: "Você já avaliou este produto." }, { status: 409 })
  }

  const eligibility = await getReviewEligibility(user.id, productId)
  if (!eligibility.eligible) {
    return NextResponse.json(
      { error: "Só quem comprou o produto pode avaliá-lo." },
      { status: 403 }
    )
  }

  const parsed = createReviewSchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Dados inválidos." },
      { status: 400 }
    )
  }

  const imageUrls = [...new Set(parsed.data.imageUrls)]
  if (imageUrls.some((url) => !isOwnedStoreReviewImageUrl(url, user.id))) {
    return NextResponse.json({ error: "Foto inválida. Envie a foto de novo." }, { status: 400 })
  }

  try {
    const review = await createReview({
      productId,
      userId: user.id,
      orderId: eligibility.orderId,
      origin: eligibility.origin,
      rating: parsed.data.rating,
      title: parsed.data.title || null,
      body: parsed.data.body,
      imageUrls,
    })
    // `auraRewarded` vem do trigger (20261219000000): é o que de fato
    // entrou na carteira, não o que a tela prometeu.
    return NextResponse.json({ review, auraRewarded: review.aura_rewarded ?? 0 })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar avaliação." }, { status: 500 })
  }
}
