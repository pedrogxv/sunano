"use client"

import { useState } from "react"
import { toast } from "sonner"

import { REVIEW_CATEGORY_GROUPS, reviewCategoryKeyFor } from "@/lib/peripheral-review-categories"
import type { ShowcaseReview, ShowcaseReviewCategoryBlock } from "@/lib/profile-showcase"

/**
 * Estado + ações de "Meus Reviews" compartilhado entre a mini-vitrine do
 * perfil (`MeusReviewsGrid`, carrossel por categoria) e a página completa
 * (`/perfil/[handle]/reviews`, tudo empilhado) — só o layout muda entre as
 * duas, a lógica de criar/editar/excluir/termo de integridade é a mesma.
 */
export function useReviewsController(params: {
  initialBlocks: ShowcaseReviewCategoryBlock[]
  initialReviewedIds: string[]
  initialIntegrityAccepted: boolean
}) {
  const [blocks, setBlocks] = useState(params.initialBlocks)
  const [reviewedIds, setReviewedIds] = useState(params.initialReviewedIds)
  const [integrityAccepted, setIntegrityAccepted] = useState(params.initialIntegrityAccepted)
  const [integrityDialogOpen, setIntegrityDialogOpen] = useState(false)
  const [formDialogOpen, setFormDialogOpen] = useState(false)
  const [editingReview, setEditingReview] = useState<ShowcaseReview | null>(null)
  const [onSavedIndex, setOnSavedIndex] = useState<((index: number) => void) | null>(null)

  function openCreateFlow(onBlockReady?: (index: number) => void) {
    setEditingReview(null)
    setOnSavedIndex(() => onBlockReady ?? null)
    if (!integrityAccepted) {
      setIntegrityDialogOpen(true)
      return
    }
    setFormDialogOpen(true)
  }

  async function handleIntegrityAccept() {
    const res = await fetch("/api/account/reviews-integrity-acceptance", { method: "POST" })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      toast.error("Erro ao registrar o aceite do termo.")
      throw new Error("integrity accept failed")
    }
    setIntegrityAccepted(true)
    setFormDialogOpen(true)
  }

  function handleEdit(review: ShowcaseReview) {
    setEditingReview(review)
    setOnSavedIndex(null)
    setFormDialogOpen(true)
  }

  function mergeReview(review: ShowcaseReview) {
    const key = reviewCategoryKeyFor(review.peripheral.category)
    if (!key) return

    setBlocks((prev) => {
      const next = prev.map((b) => ({ ...b, reviews: [...b.reviews] }))
      const existingBlock = next.find((b) => b.key === key)
      if (existingBlock) {
        const idx = existingBlock.reviews.findIndex((r) => r.id === review.id)
        if (idx >= 0) existingBlock.reviews[idx] = review
        else existingBlock.reviews.unshift(review)
      } else {
        const group = REVIEW_CATEGORY_GROUPS.find((g) => g.key === key)!
        next.push({ key: group.key, label: group.label, reviews: [review] })
        next.sort(
          (a, b) =>
            REVIEW_CATEGORY_GROUPS.findIndex((g) => g.key === a.key) -
            REVIEW_CATEGORY_GROUPS.findIndex((g) => g.key === b.key)
        )
      }
      const newIndex = next.findIndex((b) => b.key === key)
      if (newIndex >= 0) onSavedIndex?.(newIndex)
      return next
    })

    setReviewedIds((prev) => (prev.includes(review.peripheral.id) ? prev : [...prev, review.peripheral.id]))
  }

  async function handleDelete(review: ShowcaseReview) {
    const res = await fetch(`/api/peripherals/${review.peripheral.id}/reviews`, { method: "DELETE" })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) {
      toast.error(data?.error ?? "Erro ao excluir sua avaliação.")
      return
    }

    setBlocks((prev) =>
      prev
        .map((b) => ({ ...b, reviews: b.reviews.filter((r) => r.id !== review.id) }))
        .filter((b) => b.reviews.length > 0)
    )
    setReviewedIds((prev) => prev.filter((id) => id !== review.peripheral.id))
    toast.success("Review excluída.")
  }

  return {
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
  }
}
