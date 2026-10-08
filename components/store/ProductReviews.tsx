"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AuraAmount } from "@/components/ui/AuraIcon"
import { StarRow, StoreReviewCard, entryFromReview } from "@/components/store/StoreReviewCard"
import { StoreReviewForm, type StoreReviewTarget } from "@/components/store/StoreReviewForm"
import { STORE_REVIEW_WITH_PHOTO_AURA } from "@/lib/store-review-aura"
import { extractYoutubeVideoId } from "@/lib/youtube-url"
// `import type` é apagado no build: não puxa `server-only` para o bundle.
import type { ProductReview } from "@/lib/server/repositories/store-reviews-repository"

interface SunanoReview {
  rating: number | null
  title: string
  body: string
  video_url: string | null
}

interface ReviewsResponse {
  reviews: ProductReview[]
  aggregate: { avgRating: number; count: number }
  sunanoReview: SunanoReview | null
  userReview: { id: string } | null
  canReview: boolean
}

export function ProductReviews({
  productSlug,
  productName,
  productImage,
}: {
  productId: string
  productSlug: string
  productName: string
  productImage?: string | null
  productType: "store"
}) {
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<StoreReviewTarget | null>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/store/products/${productSlug}/reviews`)
      const json = (await res.json()) as ReviewsResponse
      setData(json)
    } catch {
      // silencioso — seção de reviews não é crítica para a compra
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSlug])

  function handleSubmitted(auraRewarded: number) {
    setTarget(null)
    toast.success("Avaliação enviada!", {
      description: auraRewarded > 0 ? `Você ganhou ${auraRewarded} de Aura. Valeu por ajudar quem vai comprar!` : undefined,
    })
    load()
  }

  if (loading || !data) return null

  const sunanoVideoId = data.sunanoReview?.video_url ? extractYoutubeVideoId(data.sunanoReview.video_url) : null

  return (
    <div className="mt-12 space-y-8">
      {data.sunanoReview && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <div className="mb-3 flex items-center gap-2">
            <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Análise do Sunano</Badge>
            {data.sunanoReview.rating && <StarRow value={data.sunanoReview.rating} />}
          </div>
          <h3 className="text-lg font-black text-foreground">{data.sunanoReview.title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {data.sunanoReview.body}
          </p>
          {sunanoVideoId && (
            <div className="mt-4 aspect-video overflow-hidden rounded-xl border border-border">
              <iframe
                src={`https://www.youtube.com/embed/${sunanoVideoId}`}
                title="Vídeo da análise do Sunano"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-foreground">Avaliações de compradores</h2>
            {data.aggregate.count > 0 && (
              <div className="mt-1 flex items-center gap-2">
                <StarRow value={Math.round(data.aggregate.avgRating)} />
                <span className="text-sm text-muted-foreground">
                  {data.aggregate.avgRating.toFixed(1)} · {data.aggregate.count}{" "}
                  {data.aggregate.count === 1 ? "avaliação" : "avaliações"}
                </span>
              </div>
            )}
          </div>
          {data.canReview && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setTarget({ slug: productSlug, name: productName, image: productImage })}
            >
              Avaliar e ganhar até <AuraAmount value={STORE_REVIEW_WITH_PHOTO_AURA} size="sm" tone="brand" />
            </Button>
          )}
        </div>

        {data.reviews.length === 0 ? (
          <p className="rounded-xl border border-border py-8 text-center text-sm text-muted-foreground">
            Ainda não há avaliações deste produto.{" "}
            {!data.canReview && "Compre e volte para avaliar!"}
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {data.reviews.map((review) => (
              <StoreReviewCard key={review.id} entry={entryFromReview(review)} />
            ))}
          </div>
        )}
      </div>

      <StoreReviewForm target={target} onClose={() => setTarget(null)} onSubmitted={handleSubmitted} />
    </div>
  )
}
