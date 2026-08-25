"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { ExternalLink, Pencil, Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { StarRating } from "@/components/ui/star-rating"
import { CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { cn } from "@/lib/utils"
import type { ShowcaseReview, ShowcaseReviewCategoryBlock } from "@/lib/profile-showcase"

interface ReviewCategorySectionProps {
  block: ShowcaseReviewCategoryBlock
  isOwner: boolean
  onEdit?: (review: ShowcaseReview) => void
  onDelete?: (review: ShowcaseReview) => Promise<void>
  /** Cards compactos sem o texto do review — usado no carrossel do perfil. */
  compact?: boolean
}

/**
 * Um bloco de categoria de "Meus Reviews" — header + cards das reviews
 * daquela categoria. Usado tanto dentro do carrossel do perfil (um bloco por
 * vez, `compact`) quanto empilhado na página completa
 * (`/perfil/[handle]/reviews`, com o texto do review visível).
 */
export function ReviewCategorySection({ block, isOwner, onEdit, onDelete, compact = false }: ReviewCategorySectionProps) {
  const [deletingId, setDeletingId] = useState<string | null>(null)

  async function handleDelete(review: ShowcaseReview) {
    if (!onDelete) return
    setDeletingId(review.id)
    try {
      await onDelete(review)
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        {block.label} ({block.reviews.length})
      </h3>

      <ul className={compact ? "grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" : "space-y-2"}>
        {block.reviews.map((review) => {
          const href = `/perifericos/${buildPeripheralSlug(review.peripheral.name, review.peripheral.id)}#review-${review.id}`
          const actions = isOwner && (
            <div
              className={cn(
                "absolute right-1.5 top-1.5 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                !compact && "right-2 top-2"
              )}
            >
              {onEdit && (
                <button
                  type="button"
                  onClick={() => onEdit(review)}
                  aria-label="Editar review"
                  className="rounded-md bg-background/80 p-1.5 text-muted-foreground transition-colors hover:text-primary"
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
              {onDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      type="button"
                      disabled={deletingId === review.id}
                      aria-label="Excluir review"
                      className="rounded-md bg-background/80 p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir esta review?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Sua nota e comentário deixam de contar pra avaliação de{" "}
                        {review.peripheral.name}. A Aura ganha ao criar essa review não é
                        devolvida, mas também não some do seu saldo.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(review)}
                        className="bg-destructive hover:bg-destructive/90"
                      >
                        Excluir
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
            </div>
          )

          if (compact) {
            return (
              <li
                key={review.id}
                className="group relative flex flex-col rounded-xl border border-border bg-card p-4"
              >
                <Link href={href} className="relative aspect-square w-full shrink-0">
                  {review.peripheral.image_url ? (
                    <Image
                      src={review.peripheral.image_url}
                      alt={review.peripheral.name}
                      fill
                      sizes="(min-width: 768px) 200px, 45vw"
                      className="object-contain"
                    />
                  ) : (
                    <div className="size-full rounded bg-muted/40" />
                  )}
                </Link>

                <div className="min-w-0 space-y-2 pt-3">
                  <Link href={href} className="block truncate text-sm font-semibold text-foreground hover:underline">
                    {review.peripheral.name}
                  </Link>
                  <div className="flex items-center gap-1.5 border-t border-border/60 pt-2">
                    <StarRating value={review.rating} size="sm" />
                    <span className="text-xs font-medium text-muted-foreground">{review.rating}</span>
                  </div>
                </div>

                {actions}
              </li>
            )
          }

          return (
            <li
              key={review.id}
              className={cn("group relative flex gap-3 rounded-xl border p-3 transition-colors", CARD_SURFACE_INTERACTIVE)}
            >
              <Link href={href} className="relative size-14 shrink-0 self-start">
                {review.peripheral.image_url ? (
                  <Image
                    src={review.peripheral.image_url}
                    alt={review.peripheral.name}
                    fill
                    sizes="56px"
                    className="object-contain"
                  />
                ) : (
                  <div className="size-full rounded bg-muted/40" />
                )}
              </Link>

              <div className="min-w-0 flex-1 space-y-1">
                <Link href={href} className="block truncate text-sm font-medium text-foreground hover:underline">
                  {review.peripheral.name}
                </Link>
                <StarRating value={review.rating} size="sm" />
                {review.body && (
                  <p className="line-clamp-2 text-xs text-muted-foreground">{review.body}</p>
                )}
              </div>

              <Link
                href={href}
                aria-label="Ver review no periférico"
                className="absolute bottom-2 right-2 shrink-0 rounded-md bg-background/80 p-1.5 text-muted-foreground opacity-0 transition-opacity hover:text-primary group-hover:opacity-100 group-focus-within:opacity-100"
              >
                <ExternalLink className="size-3.5" />
              </Link>

              {actions}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
