"use client"

import { Plus, Star } from "lucide-react"

import { ReviewCategorySection } from "@/components/profile/ReviewCategorySection"
import { ReviewFormDialog } from "@/components/profile/ReviewFormDialog"
import { IntegrityTermDialog } from "@/components/profile/IntegrityTermDialog"
import { useReviewsController } from "@/components/profile/useReviewsController"
import { Button } from "@/components/ui/button"
import type { ShowcaseReviewCategoryBlock } from "@/lib/profile-showcase"

interface AllReviewsClientProps {
  initialBlocks: ShowcaseReviewCategoryBlock[]
  initialReviewedIds: string[]
  initialIntegrityAccepted: boolean
  isOwner: boolean
}

/** Página completa `/perfil/[handle]/reviews` — todos os blocos de categoria empilhados, sem cap, scroll normal. */
export function AllReviewsClient({
  initialBlocks,
  initialReviewedIds,
  initialIntegrityAccepted,
  isOwner,
}: AllReviewsClientProps) {
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
  } = useReviewsController({ initialBlocks, initialReviewedIds, initialIntegrityAccepted })

  return (
    <div className="space-y-8">
      {isOwner && (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => openCreateFlow()} className="gap-1.5">
            <Plus className="size-3.5" />
            Criar review
          </Button>
        </div>
      )}

      {blocks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/60 p-10 text-center text-muted-foreground/60">
          <Star className="size-6" />
          <span className="text-sm">
            {isOwner ? "Você ainda não escreveu nenhum review." : "Este usuário ainda não escreveu nenhum review."}
          </span>
        </div>
      ) : (
        blocks.map((block) => (
          <ReviewCategorySection
            key={block.key}
            block={block}
            isOwner={isOwner}
            onEdit={isOwner ? handleEdit : undefined}
            onDelete={isOwner ? handleDelete : undefined}
          />
        ))
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
    </div>
  )
}
