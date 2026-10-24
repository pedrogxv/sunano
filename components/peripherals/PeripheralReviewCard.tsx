"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { Check, Link2, ThumbsDown, ThumbsUp } from "lucide-react"
import { toast } from "sonner"

import { AuthorSpecialTagBadge, AuthorTierBadge } from "@/components/forum/PostCard"
import { AuthorAvatarLink, AuthorNameLink, authorFrom } from "@/components/profile/AuthorLink"
import { StreakBadge } from "@/components/profile/StreakBadge"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { StarRating } from "@/components/ui/star-rating"
import { cn } from "@/lib/utils"
// `import type` é apagado no build: não puxa `server-only` para o bundle.
import type { PeripheralReviewDetail } from "@/lib/server/repositories/peripheral-reviews-repository"

/**
 * A linha que a API e a página entregam. Importada do repositório, nunca
 * redigitada aqui: a cópia local perdia em silêncio cada campo novo do autor
 * (a moldura chegou a ficar de fora assim).
 */
export type PeripheralReviewRow = PeripheralReviewDetail

export type ReviewVote = PeripheralReviewDetail["my_vote"]

export type ReviewVotePatch = { score: number; my_vote: ReviewVote }

/**
 * Data fixa no fuso de Brasília. Sem `timeZone`, o servidor (UTC) e o
 * navegador (UTC-3) discordavam do DIA de qualquer review escrita entre 21h e
 * meia-noite, e a página ISR quebrava na hidratação. `Intl` também evita
 * carregar `date-fns` + locale só para isto.
 */
const DATE_PARTS = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "short",
  year: "numeric",
})

function formatReviewDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const parts = DATE_PARTS.formatToParts(date)
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? ""
  return `${get("day")} ${get("month").replace(".", "")} ${get("year")}`
}

export function formatRating(rating: number): string {
  return rating.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

/**
 * Uma review de periférico: autor, nota, corpo e o "foi útil?".
 *
 * `variant="row"` é o formato da página de reviews (corpo recolhido em 6
 * linhas com "Ler mais"); `variant="card"` é o flashcard do carrossel da
 * ficha, que precisa de altura própria e do corpo com rolagem interna para que
 * trocar de card não faça o layout pular.
 */
export function PeripheralReviewCard({
  peripheralId,
  review,
  rowRef,
  highlighted = false,
  variant = "row",
  searchTerm = null,
  permalink,
  eyebrow,
  action,
  anchor = true,
  className,
  onVoteChange,
}: {
  peripheralId: string
  review: PeripheralReviewRow
  rowRef?: React.Ref<HTMLElement>
  highlighted?: boolean
  variant?: "row" | "card"
  /** Busca ativa na lista: o trecho é marcado no corpo. */
  searchTerm?: string | null
  /** Endereço desta review (página de reviews + âncora). Presente = botão de copiar link. */
  permalink?: string
  /** Rótulo acima do autor ("Sua review", "Mais útil · positiva"). */
  eyebrow?: React.ReactNode
  /** Ação extra no rodapé, à direita (ex.: "Editar" na review do próprio visitante). */
  action?: React.ReactNode
  /**
   * Leva o `id="review-<id>"` da âncora. Desligue na CÓPIA de uma review que
   * também aparece na lista (destaque positiva × crítica): dois elementos com
   * o mesmo id faziam o link compartilhado rolar até a cópia, não até a lista.
   */
  anchor?: boolean
  className?: string
  onVoteChange: (reviewId: string, patch: ReviewVotePatch) => void
}) {
  const { user } = useAuthUser()
  const isOwn = user?.id === review.user_id
  const author = authorFrom(review)

  return (
    <article
      id={anchor ? `review-${review.id}` : undefined}
      ref={rowRef}
      aria-label={`Review de ${review.author_display_name}, nota ${formatRating(review.rating)} de 5`}
      className={cn(
        "scroll-mt-28 rounded-2xl bg-card p-4 ring-1 ring-foreground/[0.07] transition-[box-shadow,background-color] duration-700 ease-out sm:p-5",
        variant === "card" && "bg-background/40 p-3 sm:p-4",
        highlighted && "bg-amber-400/[0.06] ring-2 ring-amber-400/50",
        className
      )}
    >
      {eyebrow && <div className="mb-3">{eyebrow}</div>}

      <header className="flex items-start gap-3">
        <AuthorAvatarLink author={author} avatarUrl={review.author_avatar_url} size="md" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm leading-tight">
            <AuthorNameLink author={author} />
            <AuthorTierBadge tier={review.author_account_tier} vipExpiresAt={review.author_vip_expires_at} />
            <AuthorSpecialTagBadge slug={review.author_display_slug} />
            <StreakBadge days={review.author_streak} size="sm" />
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <StarRating value={review.rating} size="sm" />
              <span className="font-semibold tabular-nums text-foreground">{formatRating(review.rating)}</span>
            </span>
            <span aria-hidden>·</span>
            <time dateTime={review.created_at}>{formatReviewDate(review.created_at)}</time>
            {review.is_edited && (
              <span
                className="italic opacity-70"
                title={review.edited_at ? `Editada em ${formatReviewDate(review.edited_at)}` : undefined}
              >
                editada
              </span>
            )}
          </div>
        </div>
      </header>

      {review.body ? (
        variant === "card" ? (
          <p className="mt-3 max-h-40 overflow-y-auto pr-1 text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground/90">
            {review.body}
          </p>
        ) : (
          <ReviewBody body={review.body} searchTerm={searchTerm} />
        )
      ) : (
        <p className="mt-3 text-sm text-muted-foreground italic">Avaliou só com a nota</p>
      )}

      <footer className="mt-4 flex items-center justify-between gap-2">
        <ReviewHelpfulVote
          peripheralId={peripheralId}
          reviewId={review.id}
          score={review.score}
          myVote={review.my_vote}
          isOwn={isOwn}
          onVoteChange={onVoteChange}
        />
        <div className="flex items-center gap-1">
          {action}
          {permalink && <CopyReviewLinkButton permalink={permalink} />}
        </div>
      </footer>
    </article>
  )
}

const CLAMP_LINES_CLASS = "line-clamp-6"

/**
 * Corpo recolhido em 6 linhas. O "Ler mais" fica POR CIMA da última linha
 * (com degradê), não abaixo dela: ele só aparece depois de medir no
 * navegador, e um botão empurrando o texto para baixo nesse instante faria a
 * lista inteira pular (CLS) na primeira dobra da página.
 */
function ReviewBody({ body, searchTerm }: { body: string; searchTerm: string | null }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || expanded) return
    const measure = () => setOverflowing(el.scrollHeight - el.clientHeight > 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [body, expanded])

  return (
    <div className="relative mt-3">
      <p
        ref={ref}
        className={cn(
          "text-[15px] leading-relaxed break-words whitespace-pre-wrap text-foreground/90",
          !expanded && CLAMP_LINES_CLASS
        )}
      >
        {highlightMatches(body, searchTerm)}
      </p>
      {overflowing && !expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          aria-expanded={false}
          className="absolute right-0 bottom-0 bg-gradient-to-r from-transparent via-card via-40% to-card pl-12 text-sm font-medium text-foreground hover:underline"
        >
          Ler mais
        </button>
      )}
      {expanded && (
        <button
          type="button"
          onClick={() => setExpanded(false)}
          aria-expanded
          className="mt-1 text-sm font-medium text-muted-foreground hover:text-foreground hover:underline"
        >
          Mostrar menos
        </button>
      )}
    </div>
  )
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/** Marca as ocorrências do termo buscado (sem diferenciar maiúscula), como texto — nunca HTML. */
function highlightMatches(text: string, term: string | null): React.ReactNode {
  if (!term) return text
  const parts = text.split(new RegExp(`(${escapeRegExp(term)})`, "gi"))
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="rounded-sm bg-amber-400/25 px-0.5 text-foreground">
        {part}
      </mark>
    ) : (
      part
    )
  )
}

function CopyReviewLinkButton({ permalink }: { permalink: string }) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    const url = new URL(permalink, window.location.origin).toString()
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success("Link da review copiado")
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error("Não foi possível copiar o link")
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label="Copiar link desta review"
      title="Copiar link"
      className="flex size-8 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
    >
      {copied ? <Check className="size-4 text-emerald-400" /> : <Link2 className="size-4" />}
    </button>
  )
}

/**
 * "Foi útil?" — positivo/negativo mutuamente exclusivos, com o saldo no meio.
 * Clicar de novo no mesmo botão remove o voto; clicar no oposto troca — o
 * servidor (`toggle_peripheral_review_vote`) decide o resultado final, aqui só
 * aplicamos otimista e revertemos se a chamada falhar.
 *
 * O autor vê o saldo, mas não vota: o repositório recusa voto na própria
 * review, e oferecer o botão só para responder 403 seria pior.
 */
function ReviewHelpfulVote({
  peripheralId,
  reviewId,
  score,
  myVote,
  isOwn,
  onVoteChange,
}: {
  peripheralId: string
  reviewId: string
  score: number
  myVote: ReviewVote
  isOwn: boolean
  onVoteChange: (reviewId: string, patch: ReviewVotePatch) => void
}) {
  const { openLogin } = useAuthModal()
  const [pending, setPending] = useState(false)

  if (isOwn) {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground"
        title="Você não vota na própria review"
      >
        <ThumbsUp className="size-3.5" />
        <span className="font-semibold tabular-nums text-foreground">{score}</span>
        <span>de saldo</span>
      </span>
    )
  }

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
        // Modal de login com volta para ESTA review, em vez de trocar de
        // página e perder a posição na lista.
        openLogin(`${window.location.pathname}${window.location.search}#review-${reviewId}`)
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
    <div role="group" aria-label="Esta review foi útil?" className="flex items-center gap-2">
      <span className="hidden text-xs text-muted-foreground sm:inline">Foi útil?</span>
      <div className="inline-flex items-center rounded-full bg-muted/50 p-0.5">
        <button
          type="button"
          onClick={() => vote("like")}
          disabled={pending}
          aria-label="Sim, foi útil"
          aria-pressed={myVote === "like"}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-emerald-500/10 hover:text-emerald-400 disabled:pointer-events-none",
            myVote === "like" && "bg-emerald-500/15 text-emerald-400"
          )}
        >
          <ThumbsUp className={cn("size-3.5", myVote === "like" && "fill-current")} />
          Sim
        </button>
        <span
          key={score}
          aria-live="polite"
          aria-label={`Saldo ${score}`}
          className={cn(
            "min-w-7 animate-in text-center text-xs font-semibold tabular-nums duration-200 zoom-in-75",
            myVote === "like" && "text-emerald-400",
            myVote === "dislike" && "text-red-400",
            !myVote && "text-foreground/80"
          )}
        >
          {score}
        </span>
        <button
          type="button"
          onClick={() => vote("dislike")}
          disabled={pending}
          aria-label="Não foi útil"
          aria-pressed={myVote === "dislike"}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition hover:bg-red-500/10 hover:text-red-400 disabled:pointer-events-none",
            myVote === "dislike" && "bg-red-500/15 text-red-400"
          )}
        >
          <ThumbsDown className={cn("size-3.5", myVote === "dislike" && "fill-current")} />
          Não
        </button>
      </div>
    </div>
  )
}
