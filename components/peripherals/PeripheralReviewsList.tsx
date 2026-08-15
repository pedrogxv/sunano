"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"

import { AuthorSpecialTagBadge, AuthorTierBadge } from "@/components/forum/PostCard"
import { MiniProfileHoverCard } from "@/components/profile/MiniProfileHoverCard"
import { StreakBadge } from "@/components/profile/StreakBadge"
import { Button } from "@/components/ui/button"
import { StarRating } from "@/components/ui/star-rating"
import { UserAvatar } from "@/components/ui/user-avatar"
import type { AccountTier } from "@/lib/account-tier"
import { profilePath } from "@/lib/profile-name"

interface PeripheralReviewsListProps {
  peripheralId: string
}

type PeripheralReviewRow = {
  id: string
  rating: number
  body: string | null
  created_at: string
  is_edited: boolean
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_display_slug: string | null
  author_streak: number
}

const PAGE_SIZE = 4

/**
 * Lista de reviews da página do periférico, priorizando reviewers com mais
 * Aura (ordenação já vem pronta da API). Sem fallback estático: sem review,
 * mostra o estado vazio; a média/veredito fica no `PeripheralVoteBox` acima.
 */
export function PeripheralReviewsList({ peripheralId }: PeripheralReviewsListProps) {
  const [reviews, setReviews] = useState<PeripheralReviewRow[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    let active = true
    setLoading(true)
    fetch(`/api/peripherals/${peripheralId}/reviews?page=1&limit=${PAGE_SIZE}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { reviews?: PeripheralReviewRow[]; totalCount?: number; hasMore?: boolean }) => {
        if (!active) return
        setReviews(data.reviews ?? [])
        setTotalCount(data.totalCount ?? 0)
        setHasMore(data.hasMore ?? false)
        setPage(1)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [peripheralId])

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

  if (loading) return null

  if (totalCount === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Seja o primeiro a avaliar este periférico.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {reviews.map((review) => (
        <div key={review.id} className="flex gap-3 border-b border-border pb-4 last:border-0 last:pb-0">
          <MiniProfileHoverCard slug={review.author_display_slug} side="right" align="start">
            {review.author_display_slug ? (
              <Link href={profilePath(review.author_display_slug)} className="shrink-0">
                <UserAvatar name={review.author_display_name} avatarUrl={review.author_avatar_url} size={8} />
              </Link>
            ) : (
              <UserAvatar name={review.author_display_name} avatarUrl={review.author_avatar_url} size={8} />
            )}
          </MiniProfileHoverCard>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <MiniProfileHoverCard slug={review.author_display_slug} side="right" align="start">
                {review.author_display_slug ? (
                  <Link
                    href={profilePath(review.author_display_slug)}
                    className="font-medium text-foreground hover:underline"
                  >
                    {review.author_display_name}
                  </Link>
                ) : (
                  <span className="font-medium text-foreground">{review.author_display_name}</span>
                )}
              </MiniProfileHoverCard>
              <AuthorTierBadge tier={review.author_account_tier} />
              <AuthorSpecialTagBadge slug={review.author_display_slug} />
              <StreakBadge days={review.author_streak} size="sm" />
              <span>·</span>
              <span>{format(new Date(review.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
              {review.is_edited && <span className="italic opacity-70">(editado)</span>}
            </p>
            <StarRating value={review.rating} size="sm" />
            {review.body && <p className="text-sm text-foreground break-words whitespace-pre-wrap">{review.body}</p>}
          </div>
        </div>
      ))}

      {hasMore && (
        <div className="flex justify-center pt-1">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore ? "Carregando..." : "Carregar mais Reviews"}
          </Button>
        </div>
      )}
    </div>
  )
}
