"use client"

import { useState } from "react"
import Image from "next/image"
import { Loader2, X } from "lucide-react"
import { toast } from "sonner"

import { PeripheralPicker } from "@/components/account/PeripheralPicker"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { StarRating } from "@/components/ui/star-rating"
import { Textarea } from "@/components/ui/textarea"
import { REVIEWABLE_CATALOG_CATEGORIES } from "@/lib/peripheral-review-categories"
import type { ShowcasePeripheral, ShowcaseReview } from "@/lib/profile-showcase"

const BODY_MAX_LENGTH = 400

interface ReviewFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  /** create: periféricos já avaliados, ocultados do picker (a review é 1x por periférico). */
  excludePeripheralIds?: string[]
  /** edit: periférico fixo (sem picker) + valores atuais. */
  peripheral?: ShowcasePeripheral
  initialRating?: number
  initialBody?: string | null
  onSaved: (review: ShowcaseReview) => void
}

export function ReviewFormDialog({
  open,
  onOpenChange,
  mode,
  excludePeripheralIds = [],
  peripheral,
  initialRating,
  initialBody,
  onSaved,
}: ReviewFormDialogProps) {
  const [selected, setSelected] = useState<ShowcasePeripheral | null>(mode === "edit" ? (peripheral ?? null) : null)
  const [rating, setRating] = useState(initialRating ?? 0)
  const [body, setBody] = useState(initialBody ?? "")
  const [saving, setSaving] = useState(false)

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
    if (!next) {
      setSelected(mode === "edit" ? (peripheral ?? null) : null)
      setRating(initialRating ?? 0)
      setBody(initialBody ?? "")
    }
  }

  async function handleSubmit() {
    if (!selected || rating < 1) return
    setSaving(true)
    try {
      const res = await fetch(`/api/peripherals/${selected.id}/reviews`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: body.trim() || null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao salvar sua avaliação")
      onSaved(data.review as ShowcaseReview)
      handleOpenChange(false)
      toast.success(mode === "create" ? "Review criada! +10 de Aura." : "Review atualizada!")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar sua avaliação")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "Criar review" : "Editar review"}</DialogTitle>
          <DialogDescription>
            Escolha o periférico, dê sua nota (1 a 5 estrelas, meia estrela vale) e, se quiser, conte
            sua experiência em até {BODY_MAX_LENGTH} caracteres.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {mode === "create" && !selected ? (
            <PeripheralPicker
              categories={REVIEWABLE_CATALOG_CATEGORIES}
              excludeIds={excludePeripheralIds}
              placeholder="Buscar periférico pra avaliar..."
              autoFocus
              onSelect={(p) => setSelected(p)}
            />
          ) : (
            selected && (
              <div className="flex items-center gap-3 rounded-lg border border-border p-2.5">
                <div className="relative size-9 shrink-0">
                  {selected.image_url ? (
                    <Image src={selected.image_url} alt={selected.name} fill sizes="36px" className="object-contain" />
                  ) : (
                    <div className="size-full rounded bg-muted/40" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{selected.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{selected.brand}</p>
                </div>
                {mode === "create" && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => setSelected(null)}>
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            )
          )}

          {selected && (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-muted-foreground">Sua nota</p>
                <StarRating value={rating} onChange={setRating} size="lg" />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium text-muted-foreground">Comentário (opcional)</p>
                  <span className="text-[11px] text-muted-foreground/60">
                    {body.length}/{BODY_MAX_LENGTH}
                  </span>
                </div>
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value.slice(0, BODY_MAX_LENGTH))}
                  placeholder="Conte sua experiência com esse periférico..."
                  className="min-h-24"
                  maxLength={BODY_MAX_LENGTH}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleSubmit} disabled={!selected || rating < 1 || saving} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {mode === "create" ? "Enviar review" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
