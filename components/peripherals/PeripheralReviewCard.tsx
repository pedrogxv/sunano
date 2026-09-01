"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronDown, ChevronUp } from "lucide-react"
import { toast } from "sonner"

import { AuthorSpecialTagBadge, AuthorTierBadge } from "@/components/forum/PostCard"
import { AuthorAvatarLink, AuthorNameLink } from "@/components/profile/AuthorLink"
import { StreakBadge } from "@/components/profile/StreakBadge"
import { StarRating } from "@/components/ui/star-rating"
import { cn } from "@/lib/utils"
import type { AccountTier } from "@/lib/account-tier"

export type ReviewVote = "like" | "dislike" | null

export type PeripheralReviewRow = {
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

export type ReviewVotePatch = { score: number; my_vote: ReviewVote }

/**
 * Uma review de periférico com autor, nota, corpo e o controle de voto.
 *
 * `variant="row"` é o formato de lista (usado em "ver todos"); `variant="card"`
 * é o formato do flashcard do carrossel, que precisa de altura própria e do
 * corpo com rolagem interna para que trocar de card não faça o layout pular.
 */
export function PeripheralReviewCard({
  peripheralId,
  review,
  rowRef,
  highlighted = false,
  variant = "row",
  onVoteChange,
}: {
  peripheralId: string
  review: PeripheralReviewRow
  rowRef?: React.Ref<HTMLDivElement>
  highlighted?: boolean
  variant?: "row" | "card"
  onVoteChange: (reviewId: string, patch: ReviewVotePatch) => void
}) {
  return (
    <div
      id={`review-${review.id}`}
      ref={rowRef}
      className={cn(
        "flex gap-3 rounded-xl transition-colors duration-700 ease-out",
        variant === "row" && "border-b border-border p-2 pb-4 last:border-0 last:pb-0",
        variant === "card" && "border border-border/60 bg-background/40 p-3",
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
        {review.body && (
          <p
            className={cn(
              "text-sm text-foreground break-words whitespace-pre-wrap",
              variant === "card" && "max-h-40 overflow-y-auto pr-1"
            )}
          >
            {review.body}
          </p>
        )}
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
  onVoteChange: (reviewId: string, patch: ReviewVotePatch) => void
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
