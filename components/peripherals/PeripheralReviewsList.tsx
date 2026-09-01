"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight } from "lucide-react"

import {
  PeripheralReviewCard,
  type PeripheralReviewRow,
  type ReviewVotePatch,
} from "@/components/peripherals/PeripheralReviewCard"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface PeripheralReviewsListProps {
  peripheralId: string
  /** Slug canônico do periférico, pro link "Ver todos os reviews". */
  peripheralSlug: string
}

/** Reviews buscadas por vez — o carrossel mostra uma, mas pré-carrega o lote. */
const BATCH_SIZE = 10

/** Duração do destaque visual ao chegar numa review via link "Meus Reviews" do perfil. */
const HIGHLIGHT_MS = 2600

/** Distância mínima (px) de arrasto horizontal pra contar como troca de card. */
const SWIPE_THRESHOLD = 48

/**
 * Reviews do periférico em formato flashcard: um card por vez, em ordem
 * aleatória, com navegação pra frente/trás (setas, teclado ou swipe). A ordem
 * é sorteada por visita e mantida estável pela `seed` enviada à API, senão os
 * lotes seguintes repetiriam ou pulariam reviews já vistas.
 *
 * A lista completa (ordenada por Aura do autor) fica na página dedicada,
 * linkada logo abaixo do carrossel.
 */
export function PeripheralReviewsList({ peripheralId, peripheralSlug }: PeripheralReviewsListProps) {
  // Sorteada uma vez por montagem — no cliente, pra não virar parte do HTML
  // cacheado da página (revalidate=120) e todo mundo cair na mesma ordem.
  const seed = useMemo(() => Math.random().toString(36).slice(2, 12), [])

  const [reviews, setReviews] = useState<PeripheralReviewRow[]>([])
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [page, setPage] = useState(1)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  // Review apontada pela URL (`#review-<id>`), vinda de "Meus Reviews" no
  // perfil — a ordem aleatória torna inviável adivinhar em qual lote ela
  // cairia, então busca ela sozinha e mostra em destaque acima do carrossel.
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
    fetch(`/api/peripherals/${peripheralId}/reviews?page=1&limit=${BATCH_SIZE}&order=random&seed=${seed}`, {
      cache: "no-store",
    })
      .then((res) => res.json())
      .then((data: { reviews?: PeripheralReviewRow[]; totalCount?: number; hasMore?: boolean }) => {
        if (!active) return
        setReviews(data.reviews ?? [])
        setTotalCount(data.totalCount ?? 0)
        setHasMore(data.hasMore ?? false)
        setPage(1)
        setIndex(0)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [peripheralId, seed])

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
    if (!highlightId || loading || !highlightReview) return

    const timer = window.setTimeout(() => {
      highlightRef.current?.scrollIntoView({ behavior: "smooth", block: "center" })
      setHighlighted(true)
      window.setTimeout(() => setHighlighted(false), HIGHLIGHT_MS)
    }, 150)
    return () => window.clearTimeout(timer)
  }, [highlightId, highlightReview, loading])

  const loadMore = useCallback(async () => {
    const nextPage = page + 1
    setLoadingMore(true)
    try {
      const res = await fetch(
        `/api/peripherals/${peripheralId}/reviews?page=${nextPage}&limit=${BATCH_SIZE}&order=random&seed=${seed}`,
        { cache: "no-store" }
      )
      const data = (await res.json()) as { reviews?: PeripheralReviewRow[]; hasMore?: boolean }
      setReviews((prev) => [...prev, ...(data.reviews ?? [])])
      setHasMore(data.hasMore ?? false)
      setPage(nextPage)
    } catch {
      // Silencioso — a seta continua disponível pra tentar de novo.
    } finally {
      setLoadingMore(false)
    }
  }, [page, peripheralId, seed])

  // Buscar o próximo lote assim que o usuário chega perto do fim do atual, pra
  // que avançar nunca esbarre num card vazio.
  useEffect(() => {
    if (hasMore && !loadingMore && reviews.length > 0 && index >= reviews.length - 2) {
      void loadMore()
    }
  }, [hasMore, index, loadMore, loadingMore, reviews.length])

  const goPrev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), [])
  const goNext = useCallback(
    () => setIndex((i) => Math.min(i + 1, reviews.length - 1)),
    [reviews.length]
  )

  // Pointer Events cobrem touch, mouse e caneta com o mesmo handler — assim o
  // arraste com mouse no desktop funciona igual ao swipe no celular.
  const dragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const suppressClickRef = useRef(false)

  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
    suppressClickRef.current = false
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start || start.pointerId !== event.pointerId) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    // Gesto mais vertical que horizontal é rolagem da página, não swipe.
    if (Math.abs(deltaX) < SWIPE_THRESHOLD || Math.abs(deltaX) <= Math.abs(deltaY)) return

    // Evita que o clique disparado logo após o arraste ative um link/botão
    // dentro do card (avatar, autor, voto) sem essa ser a intenção.
    suppressClickRef.current = true
    if (deltaX < 0) goNext()
    else goPrev()
  }

  function onClickCapture(event: React.MouseEvent) {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
    suppressClickRef.current = false
  }

  function patchReview(reviewId: string, patch: ReviewVotePatch) {
    setReviews((prev) => prev.map((r) => (r.id === reviewId ? { ...r, ...patch } : r)))
    setHighlightReview((prev) => (prev && prev.id === reviewId ? { ...prev, ...patch } : prev))
  }

  if (loading) return null

  if (totalCount === 0) {
    return (
      <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Seja o primeiro a avaliar este periférico.
      </p>
    )
  }

  const current = reviews[index]
  const canPrev = index > 0
  const canNext = index < reviews.length - 1 || hasMore
  // O card em destaque vindo do perfil fica fora do carrossel: a ordem
  // aleatória mudaria de posição a cada visita e ele precisa estar sempre
  // visível ao chegar pelo link.
  const showDetachedHighlight = Boolean(highlightReview)

  return (
    <div className="space-y-4">
      {showDetachedHighlight && highlightReview && (
        <>
          <PeripheralReviewCard
            peripheralId={peripheralId}
            review={highlightReview}
            rowRef={highlightRef}
            highlighted={highlighted}
            variant="card"
            onVoteChange={patchReview}
          />
          <div className="border-b border-border" />
        </>
      )}

      {current && (
        <div
          className="touch-pan-y space-y-3 active:cursor-grabbing sm:cursor-grab"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragStartRef.current = null
          }}
          onClickCapture={onClickCapture}
          onKeyDown={(event) => {
            if (event.key === "ArrowRight") {
              event.preventDefault()
              goNext()
            } else if (event.key === "ArrowLeft") {
              event.preventDefault()
              goPrev()
            }
          }}
          role="group"
          aria-roledescription="carrossel"
          aria-label="Reviews da comunidade"
          tabIndex={0}
        >
          {current.id !== highlightReview?.id && (
            <PeripheralReviewCard
              key={current.id}
              peripheralId={peripheralId}
              review={current}
              variant="card"
              onVoteChange={patchReview}
            />
          )}

          <div className="flex items-center justify-between gap-2">
            <CarouselArrow direction="prev" onClick={goPrev} disabled={!canPrev} />
            <span className="text-xs tabular-nums text-muted-foreground">
              {index + 1} de {totalCount ?? reviews.length}
            </span>
            <CarouselArrow direction="next" onClick={goNext} disabled={!canNext || loadingMore} />
          </div>
        </div>
      )}

      <div className="flex justify-center">
        <Button asChild variant="outline" size="sm">
          <Link href={`/perifericos/${peripheralSlug}/reviews`}>
            Ver todos os reviews{totalCount ? ` (${totalCount})` : ""}
          </Link>
        </Button>
      </div>
    </div>
  )
}

function CarouselArrow({
  direction,
  onClick,
  disabled,
}: {
  direction: "prev" | "next"
  onClick: () => void
  disabled: boolean
}) {
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "prev" ? "Review anterior" : "Próxima review"}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition",
        "hover:bg-secondary hover:text-foreground",
        "disabled:pointer-events-none disabled:opacity-40"
      )}
    >
      <Icon className="size-4" />
    </button>
  )
}
