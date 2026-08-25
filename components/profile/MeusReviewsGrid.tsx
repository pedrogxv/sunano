"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { ChevronLeft, ChevronRight, Plus, Star } from "lucide-react"

import { ReviewCategorySection } from "@/components/profile/ReviewCategorySection"
import { ReviewFormDialog } from "@/components/profile/ReviewFormDialog"
import { IntegrityTermDialog } from "@/components/profile/IntegrityTermDialog"
import { useReviewsController } from "@/components/profile/useReviewsController"
import { Button } from "@/components/ui/button"
import type { ShowcaseReviewCategoryBlock } from "@/lib/profile-showcase"
import { cn } from "@/lib/utils"

/** Deslocamento horizontal mínimo (px) pra um arraste virar troca de bloco — mesmo idioma de BannerCarousel. */
const SWIPE_THRESHOLD_PX = 40

interface MeusReviewsGridProps {
  reviewsByCategory: ShowcaseReviewCategoryBlock[]
  reviewsIntegrityAcceptedAt: string | null
  reviewedPeripheralIds: string[]
  isOwner: boolean
  reviewsPageHref: string
}

/**
 * Seção "Meus Reviews" do perfil — um bloco de CATEGORIA visível por vez
 * (não um review por vez), setas/swipe trocam de categoria na ordem fixa de
 * `REVIEW_CATEGORY_GROUPS`. "Carregar Reviews Completos" abre a página cheia,
 * sem cap, com scroll normal.
 */
export function MeusReviewsGrid({
  reviewsByCategory,
  reviewsIntegrityAcceptedAt,
  reviewedPeripheralIds,
  isOwner,
  reviewsPageHref,
}: MeusReviewsGridProps) {
  const {
    blocks,
    reviewedIds,
    integrityDialogOpen,
    setIntegrityDialogOpen,
    formDialogOpen,
    setFormDialogOpen,
    editingReview,
    openCreateFlow,
    handleIntegrityAccept,
    handleEdit,
    mergeReview,
    handleDelete,
  } = useReviewsController({
    initialBlocks: reviewsByCategory,
    initialReviewedIds: reviewedPeripheralIds,
    initialIntegrityAccepted: Boolean(reviewsIntegrityAcceptedAt),
  })

  const [current, setCurrent] = useState(0)
  const dragStartRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)

  const total = blocks.length
  const currentIndex = current < total ? current : 0

  function goTo(index: number) {
    if (total === 0) return
    setCurrent(((index % total) + total) % total)
  }

  function onPointerDown(event: React.PointerEvent) {
    if (event.pointerType === "mouse" && event.button !== 0) return
    dragStartRef.current = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }
  }

  function onPointerUp(event: React.PointerEvent) {
    const start = dragStartRef.current
    dragStartRef.current = null
    if (!start || start.pointerId !== event.pointerId || total <= 1) return

    const deltaX = event.clientX - start.x
    const deltaY = event.clientY - start.y
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX || Math.abs(deltaX) <= Math.abs(deltaY)) return
    goTo(currentIndex + (deltaX < 0 ? 1 : -1))
  }

  if (blocks.length === 0 && !isOwner) return null

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Meus Reviews</h2>
        {isOwner && (
          <Button type="button" size="sm" variant="outline" onClick={() => openCreateFlow(setCurrent)} className="gap-1.5">
            <Plus className="size-3.5" />
            Criar review
          </Button>
        )}
      </div>

      {blocks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 p-6 text-center text-muted-foreground/60">
          <Star className="size-6" />
          <span className="text-xs">Você ainda não escreveu nenhum review.</span>
        </div>
      ) : (
        <>
          <div
            className="relative touch-pan-y"
            onPointerDown={onPointerDown}
            onPointerUp={onPointerUp}
            onPointerCancel={() => {
              dragStartRef.current = null
            }}
          >
            <div className={cn("flex items-start gap-2", total > 1 ? "px-8 sm:px-10" : "")}>
              {total > 1 && (
                <button
                  type="button"
                  onClick={() => goTo(currentIndex - 1)}
                  aria-label="Categoria anterior"
                  className="group absolute left-0 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground active:scale-90"
                >
                  <ChevronLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" />
                </button>
              )}

              <div className="min-w-0 flex-1">
                <ReviewCategorySection
                  block={blocks[currentIndex]}
                  isOwner={isOwner}
                  onEdit={isOwner ? handleEdit : undefined}
                  onDelete={isOwner ? handleDelete : undefined}
                  compact
                />
              </div>

              {total > 1 && (
                <button
                  type="button"
                  onClick={() => goTo(currentIndex + 1)}
                  aria-label="Próxima categoria"
                  className="group absolute right-0 top-1/2 -translate-y-1/2 rounded-full border border-border bg-card p-1.5 text-muted-foreground transition-colors hover:text-foreground active:scale-90"
                >
                  <ChevronRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </button>
              )}
            </div>

            {total > 1 && (
              <div className="mt-2 flex items-center justify-center gap-1.5">
                {blocks.map((b, i) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => goTo(i)}
                    aria-label={`Ir para ${b.label}`}
                    aria-current={i === currentIndex}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === currentIndex ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30"
                    )}
                  />
                ))}
              </div>
            )}
          </div>

          <Link href={reviewsPageHref} className="block text-center text-xs font-medium text-primary hover:underline">
            Carregar Reviews Completos →
          </Link>
        </>
      )}

      <IntegrityTermDialog open={integrityDialogOpen} onOpenChange={setIntegrityDialogOpen} onAccept={handleIntegrityAccept} />

      <ReviewFormDialog
        open={formDialogOpen}
        onOpenChange={setFormDialogOpen}
        mode={editingReview ? "edit" : "create"}
        excludePeripheralIds={reviewedIds}
        peripheral={editingReview?.peripheral}
        initialRating={editingReview?.rating}
        initialBody={editingReview?.body}
        onSaved={mergeReview}
      />
    </section>
  )
}
