import { NextRequest, NextResponse } from "next/server"
import * as z from "zod"
import { getRequestUser } from "@/lib/server/auth/current-user"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  createReview,
  getReviewAggregate,
  getSunanoReview,
  getUserReviewForProduct,
  hasVerifiedPurchase,
  listPublishedReviews,
} from "@/lib/server/repositories/store-reviews-repository"

const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(150).optional().nullable(),
  body: z.string().trim().min(1).max(4000),
})

async function resolveProductId(slug: string): Promise<string | null> {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("store_products").select("id").eq("slug", slug).maybeSingle()
  return (data as { id: string } | null)?.id ?? null
}

export async function GET(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const productId = await resolveProductId(slug)
  if (!productId) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

  const user = await getRequestUser(request)

  const [reviews, aggregate, sunanoReview, userReview, eligibility] = await Promise.all([
    listPublishedReviews(productId),
    getReviewAggregate(productId),
    getSunanoReview(productId),
    user ? getUserReviewForProduct(user.id, productId) : Promise.resolve(null),
    user ? hasVerifiedPurchase(user.id, productId) : Promise.resolve({ verified: false, orderId: null }),
  ])

  return NextResponse.json({
    reviews,
    aggregate,
    sunanoReview,
    userReview,
    canReview: Boolean(user) && eligibility.verified && !userReview,
  })
}

export async function POST(request: NextRequest, context: { params: Promise<{ slug: string }> }) {
  const { slug } = await context.params
  const productId = await resolveProductId(slug)
  if (!productId) return NextResponse.json({ error: "Produto não encontrado" }, { status: 404 })

  const user = await getRequestUser(request)
  if (!user) return NextResponse.json({ error: "Entre na sua conta para avaliar." }, { status: 401 })

  const existing = await getUserReviewForProduct(user.id, productId)
  if (existing) {
    return NextResponse.json({ error: "Você já avaliou este produto." }, { status: 409 })
  }

  const { verified, orderId } = await hasVerifiedPurchase(user.id, productId)
  if (!verified) {
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

  try {
    const review = await createReview({
      productId,
      userId: user.id,
      orderId,
      rating: parsed.data.rating,
      title: parsed.data.title || null,
      body: parsed.data.body,
      isVerified: true,
    })
    return NextResponse.json({ review })
  } catch {
    return NextResponse.json({ error: "Erro ao salvar avaliação." }, { status: 500 })
  }
}
