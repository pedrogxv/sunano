"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"

import { AuthorSpecialTagBadge, AuthorTierBadge } from "@/components/forum/PostCard"
import { AuthorAvatarLink, AuthorNameLink } from "@/components/profile/AuthorLink"
import { StreakBadge } from "@/components/profile/StreakBadge"
import { Button } from "@/components/ui/button"
import { StarRating } from "@/components/ui/star-rating"
import { cn } from "@/lib/utils"
import type { AccountTier } from "@/lib/account-tier"

interface PeripheralReviewsListProps {
  peripheralId: string
}

type ReviewVote = "like" | "dislike" | null

type PeripheralReviewRow = {
  id: string
  rating: number
  body: string | null
  created_at: string
  is_edited: boolean
  user_id: string
  author_display_name: string
  author_avatar_url: string | null
  author_account_tier: AccountTier
  author_vip_expires_at: string | null
  author_display_slug: string | null
  author_streak: number
  score: number
  my_vote: ReviewVote
}

const PAGE_SIZE = 4

/** Duração do destaque visual ao chegar numa review via link "Meus Reviews" do perfil. */
const HIGHLIGHT_MS = 2600

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

  // Review apontada pela URL (`#review-<id>`), vinda de "Meus Reviews" no
  // perfil — a ordenação por Aura torna inviável adivinhar em qual página da
  // lista paginada ela cairia, então busca ela sozinha e mostra em destaque
  // acima da lista normal se não estiver entre as já carregadas.
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [highlightReview, setHighlightReview] = useState<PeripheralReviewRow | null>(null)
  const [highlighted, setHighlighted] = useState(false)
  const highlightRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (typeof window === "undefined") return
    const match = window.location.hash.match(/^#review-(.+)$/)
    if (match) setHighlightId(match[1])
  }, [])

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

  useEffect(() => {
    if (!highlightId) return
    let active = true
    fetch(`/api/peripherals/${peripheralId}/reviews/${highlightId}`, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { review?: PeripheralReviewRow } | null) => {
        if (active && data?.review) setHighlightReview(data.review)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [peripheralId, highlightId])

  useEffect(() => {
    if (!highlightId || loading) return
    // Já está entre as reviews normais carregadas — não duplica o card em
    // destaque, só rola até o já renderizado na lista.
    if (reviews.some((r) => r.id === highlightId) && !highlightReview) return

    const timer = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlighted(true)
      window.setTimeout(() => setHighlighted(false), HIGHLIGHT_MS)
    }, 150)
    return () => window.clearTimeout(timer)
  }, [highlightId, highlightReview, loading, reviews])

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

  // Se a review em destaque ainda não está entre as carregadas, ela ganha um
  // card próprio no topo (fora da paginação normal) — some sozinha do estado
  // "solto" assim que aparecer na lista de verdade (ex.: depois de "Carregar
  // mais Reviews").
  const showDetachedHighlight = Boolean(highlightReview) && !reviews.some((r) => r.id === highlightId)

  function patchReview(reviewId: string, patch: { score: number; my_vote: ReviewVote }) {
    setReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, ...patch } : r)))
    setHighlightReview((prev) => (prev && prev.id === reviewId ? { ...prev, ...patch } : prev))
  }

  return (
    <div className="space-y-4">
      {showDetachedHighlight && highlightReview && (
        <>
          <ReviewRowItem
            peripheralId={peripheralId}
            review={highlightReview}
            rowRef={highlightRef}
            highlighted={highlighted}
            onVoteChange={patchReview}
          />
          <div className="border-b border-border" />
        </>
      )}

      {reviews.map((review) => (
        <ReviewRowItem
          key={review.id}
          peripheralId={peripheralId}
          review={review}
          rowRef={review.id === highlightId ? highlightRef : undefined}
          highlighted={review.id === highlightId && highlighted}
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
    </div>
  )
}

function ReviewRowItem({
  peripheralId,
  review,
  rowRef,
  highlighted = false,
  onVoteChange,
}: {
  peripheralId: string
  review: PeripheralReviewRow
  rowRef?: React.Ref<HTMLDivElement>
  highlighted?: boolean
  onVoteChange: (reviewId: string, patch: { score: number; my_vote: ReviewVote }) => void
}) {
  return (
    <div
      id={`review-${review.id}`}
      ref={rowRef}
      className={cn(
        "flex gap-3 rounded-xl border-b border-border p-2 pb-4 transition-colors duration-700 ease-out last:border-0 last:pb-0",
        highlighted && "bg-primary/10 ring-1 ring-primary/30"
      )}
    >
      <ReviewVoteControl
        peripheralId={peripheralId}
        reviewId={review.id}
        score={review.score}
        myVote={review.my_vote}
        onVoteChange={onVoteChange}
      />

      <AuthorAvatarLink
        author={{ userId: review.user_id, displayName: review.author_display_name, displaySlug: review.author_display_slug }}
        avatarUrl={review.author_avatar_url}
        size={8}
      />
      <div className="min-w-0 flex-1 space-y-1">
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <AuthorNameLink
            author={{ userId: review.user_id, displayName: review.author_display_name, displaySlug: review.author_display_slug }}
          />
          <AuthorTierBadge tier={review.author_account_tier} vipExpiresAt={review.author_vip_expires_at} />
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
  )
}

/**
 * Upvote/downvote estilo Reddit: chevron pra cima, contador no meio, chevron
 * pra baixo. Clicar de novo no mesmo botão remove o voto; clicar no oposto
 * troca — o servidor (`toggle_peripheral_review_vote`) decide o resultado
 * final, aqui só aplicamos otimista e revertemos se a chamada falhar.
 */
function ReviewVoteControl({
  peripheralId,
  reviewId,
  score,
  myVote,
  onVoteChange,
}: {
  peripheralId: string
  reviewId: string
  score: number
  myVote: ReviewVote
  onVoteChange: (reviewId: string, patch: { score: number; my_vote: ReviewVote }) => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function vote(kind: "like" | "dislike") {
    if (pending) return

    const nextVote: ReviewVote = myVote === kind ? null : kind
    const prevScore = score
    const prevVote = myVote

    const voteWeight = (v: ReviewVote) => (v === "like" ? 1 : v === "dislike" ? -1 : 0)
    const delta = voteWeight(nextVote) - voteWeight(prevVote)

    onVoteChange(reviewId, { score: prevScore + delta, my_vote: nextVote })
    setPending(true)

    try {
      const res = await fetch(`/api/peripherals/${peripheralId}/reviews/${reviewId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      })

      if (res.status === 401) {
        onVoteChange(reviewId, { score: prevScore, my_vote: prevVote })
        router.push("/login")
        return
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        onVoteChange(reviewId, { score: prevScore, my_vote: prevVote })
        toast.error("Não foi possível votar", { description: data?.error })
        return
      }

      const data = (await res.json()) as { reaction?: ReviewVote; score?: number }
      onVoteChange(reviewId, { score: data.score ?? prevScore + delta, my_vote: data.reaction ?? nextVote })
    } catch {
      onVoteChange(reviewId, { score: prevScore, my_vote: prevVote })
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-center gap-0.5 pt-0.5">
      <button
        type="button"
        onClick={() => vote("like")}
        disabled={pending}
        aria-label="Votar positivo"
        aria-pressed={myVote === "like"}
        className={cn(
          "flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-emerald-500/10 hover:text-emerald-400 disabled:pointer-events-none",
          myVote === "like" && "bg-emerald-500/15 text-emerald-400"
        )}
      >
        <ChevronUp className="size-4" />
      </button>
      <span
        className={cn(
          "min-w-4 text-center text-xs font-semibold tabular-nums",
          myVote === "like" && "text-emerald-400",
          myVote === "dislike" && "text-red-400",
          !myVote && "text-muted-foreground"
        )}
      >
        {score}
      </span>
      <button
        type="button"
        onClick={() => vote("dislike")}
        disabled={pending}
        aria-label="Votar negativo"
        aria-pressed={myVote === "dislike"}
        className={cn(
          "flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none",
          myVote === "dislike" && "bg-red-500/15 text-red-400"
        )}
      >
        <ChevronDown className="size-4" />
      </button>
    </div>
  )
}
