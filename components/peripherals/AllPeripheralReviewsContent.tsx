"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, Star } from "lucide-react"

import {
  PeripheralReviewCard,
  type PeripheralReviewRow,
  type ReviewVotePatch,
} from "@/components/peripherals/PeripheralReviewCard"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

const PAGE_SIZE = 20

interface AllPeripheralReviewsContentProps {
  peripheralId: string
  peripheralName: string
  peripheralHref: string
  initialReviews: PeripheralReviewRow[]
  initialHasMore: boolean
  totalCount: number
  average: number | null
}

/**
 * Lista completa das reviews de um periférico — a contrapartida do carrossel
 * de flashcards da página do produto. Aqui a ordem é a de sempre (Aura do
 * autor), pra que a leitura em sequência seja estável entre visitas.
 */
export function AllPeripheralReviewsContent({
  peripheralId,
  peripheralName,
  peripheralHref,
  initialReviews,
  initialHasMore,
  totalCount,
  average,
}: AllPeripheralReviewsContentProps) {
  const [reviews, setReviews] = useState(initialReviews)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [page, setPage] = useState(1)
  const [loadingMore, setLoadingMore] = useState(false)

  async function loadMore() {
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/peripherals/${peripheralId}/reviews?page=${nextPage}&limit=${PAGE_SIZE}`, {
        cache: "no-store",
      })
      const data = (await res.json()) as { reviews?: PeripheralReviewRow[]; hasMore?: boolean }
      setReviews((prev) => [...prev, ...(data.reviews ?? [])])
      setHasMore(data.hasMore ?? false)
      setPage(nextPage)
    } catch {
      // Silencioso — o botão continua disponível pra tentar de novo.
    } finally {
      setLoadingMore(false)
    }
  }

  function patchReview(reviewId: string, patch: ReviewVotePatch) {
    setReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, ...patch } : r)))
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Link
          href={peripheralHref}
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Voltar para {peripheralName}
        </Link>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold">Reviews da comunidade</h1>
          {average != null && (
            <span className="flex items-center gap-1 text-sm text-muted-foreground">
              <Star className="size-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-foreground tabular-nums">{average.toFixed(1)}</span>
              <span>· {totalCount} {totalCount === 1 ? "review" : "reviews"}</span>
            </span>
          )}
        </div>
      </div>

      {reviews.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          Seja o primeiro a avaliar este periférico.
        </p>
      ) : (
        <Card size="sm" className="border-border/60 bg-secondary/50">
          <CardContent className="space-y-4">
            {reviews.map((review) => (
              <PeripheralReviewCard
                key={review.id}
                peripheralId={peripheralId}
                review={review}
                onVoteChange={patchReview}
              />
            ))}

            {hasMore && (
              <div className="flex justify-center pt-1">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
                  {loadingMore ? "Carregando..." : "Carregar mais Reviews"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
