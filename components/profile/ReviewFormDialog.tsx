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
import {
  PERIPHERAL_REVIEW_CREATION_AURA,
  REVIEW_BODY_MAX_LENGTH as BODY_MAX_LENGTH,
  REVIEW_BODY_MIN_LENGTH as BODY_MIN_LENGTH,
  REVIEWABLE_CATALOG_CATEGORIES,
} from "@/lib/peripheral-review-categories"
import type { ShowcasePeripheral, ShowcaseReview } from "@/lib/profile-showcase"

/** O que o formulário desenha do periférico escolhido — o picker devolve mais, mas só isto é lido. */
export type ReviewFormPeripheral = Pick<ShowcasePeripheral, "id" | "name" | "brand" | "image_url">

interface ReviewFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: "create" | "edit"
  /** create: periféricos já avaliados, ocultados do picker (a review é 1x por periférico). */
  excludePeripheralIds?: string[]
  /**
   * Periférico fixo, sem picker. Obrigatório no `edit`; no `create` é a
   * página de reviews do próprio produto, onde escolher outro não faz sentido.
   */
  peripheral?: ReviewFormPeripheral
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
  const [selected, setSelected] = useState<ReviewFormPeripheral | null>(peripheral ?? null)
  const peripheralLocked = Boolean(peripheral)
  const [rating, setRating] = useState(initialRating ?? 0)
  const [body, setBody] = useState(initialBody ?? "")
  const [saving, setSaving] = useState(false)
  const bodyLength = body.trim().length
  const bodyTooShort = bodyLength < BODY_MIN_LENGTH

  // Os campos se reiniciam a partir das props A CADA ABERTURA. O diálogo fica
  // montado o tempo todo (o pai só troca `open`/`mode`), então o `useState`
  // acima lia as props uma vez só: o primeiro "Editar" do perfil abria vazio,
  // e "Criar" logo depois de editar herdava o periférico e a nota da edição
  // (o POST ia para o produto já avaliado e voltava 409).
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setSelected(peripheral ?? null)
      setRating(initialRating ?? 0)
      setBody(initialBody ?? "")
    }
  }

  function handleOpenChange(next: boolean) {
    onOpenChange(next)
  }

  async function handleSubmit() {
    if (!selected || rating < 1 || bodyTooShort) return
    setSaving(true)
    try {
      const res = await fetch(`/api/peripherals/${selected.id}/reviews`, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, body: body.trim() }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao salvar sua avaliação")
      onSaved(data.review as ShowcaseReview)
      handleOpenChange(false)
      toast.success(mode === "create" ? `Review criada! +${PERIPHERAL_REVIEW_CREATION_AURA} de Aura.` : "Review atualizada!")
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
            {peripheralLocked ? "Dê" : "Escolha o periférico, dê"} sua nota (1 a 5 estrelas, meia estrela
            vale) e conte sua experiência ({BODY_MIN_LENGTH} a {BODY_MAX_LENGTH} caracteres).
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
                {!peripheralLocked && (
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
                  <p className="text-xs font-medium text-muted-foreground">Comentário</p>
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
                {bodyLength > 0 && bodyTooShort && (
                  <p className="text-[11px] text-muted-foreground">
                    Mínimo de {BODY_MIN_LENGTH} caracteres.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button type="button" onClick={handleSubmit} disabled={!selected || rating < 1 || bodyTooShort || saving} className="gap-2">
            {saving && <Loader2 className="size-4 animate-spin" />}
            {mode === "create" ? "Enviar review" : "Salvar alterações"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
