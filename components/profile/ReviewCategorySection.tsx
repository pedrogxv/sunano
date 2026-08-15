"use client"

import { useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Pencil, Trash2 } from "lucide-react"

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
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import type { ShowcaseReview, ShowcaseReviewCategoryBlock } from "@/lib/profile-showcase"

interface ReviewCategorySectionProps {
  block: ShowcaseReviewCategoryBlock
  isOwner: boolean
  onEdit?: (review: ShowcaseReview) => void
  onDelete?: (review: ShowcaseReview) => Promise<void>
}

/**
 * Um bloco de categoria de "Meus Reviews" — header + cards das reviews
 * daquela categoria. Usado tanto dentro do carrossel do perfil (um bloco por
 * vez) quanto empilhado na página completa (`/perfil/[handle]/reviews`).
 */
export function ReviewCategorySection({ block, isOwner, onEdit, onDelete }: ReviewCategorySectionProps) {
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

      <ul className="space-y-2">
        {block.reviews.map((review) => {
          const href = `/perifericos/${buildPeripheralSlug(review.peripheral.name, review.peripheral.id)}`
          return (
            <li
              key={review.id}
              className="group relative flex gap-3 rounded-xl border border-border bg-card/60 p-3"
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

              {isOwner && (
                <div className="absolute right-2 top-2 flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
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
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
