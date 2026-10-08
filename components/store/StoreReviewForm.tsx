"use client"

import { useRef, useState } from "react"
import { Camera, Loader2, Star, X } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { AuraAmount } from "@/components/ui/AuraIcon"
import { compressImageFile } from "@/lib/client/compress-image"
import {
  MAX_STORE_REVIEW_IMAGES,
  STORE_REVIEW_AURA,
  STORE_REVIEW_WITH_PHOTO_AURA,
} from "@/lib/store-review-aura"
import { cn } from "@/lib/utils"

const COMPRESS_OPTIONS = {
  maxDimension: 1600,
  targetBytes: 600 * 1024,
  skipBelowBytes: 200 * 1024,
}

const RATING_LABEL = ["", "Muito ruim", "Ruim", "Ok", "Bom", "Excelente"]

export type StoreReviewTarget = { slug: string; name: string; image?: string | null }

/**
 * Formulário de avaliação de produto da Loja, em diálogo. Único para a
 * página do produto e o convite de Meus Pedidos: a regra de Aura (+10, +20
 * com foto) e o upload só existem aqui.
 */
export function StoreReviewForm({
  target,
  onClose,
  onSubmitted,
}: {
  target: StoreReviewTarget | null
  onClose: () => void
  onSubmitted: (auraRewarded: number) => void
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        {/* `key`: trocar de produto zera o rascunho. */}
        {target && <ReviewFormBody key={target.slug} target={target} onClose={onClose} onSubmitted={onSubmitted} />}
      </DialogContent>
    </Dialog>
  )
}

function ReviewFormBody({
  target,
  onClose,
  onSubmitted,
}: {
  target: StoreReviewTarget
  onClose: () => void
  onSubmitted: (auraRewarded: number) => void
}) {
  const [rating, setRating] = useState(5)
  const [hover, setHover] = useState(0)
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [images, setImages] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const shown = hover || rating
  const reward = images.length > 0 ? STORE_REVIEW_WITH_PHOTO_AURA : STORE_REVIEW_AURA

  async function uploadFiles(files: File[]) {
    const room = MAX_STORE_REVIEW_IMAGES - images.length
    if (room <= 0) return
    setUploading(true)
    try {
      const uploaded: string[] = []
      // Sequencial: mantém a ordem e não estoura o rate limit numa rajada.
      for (const file of files.slice(0, room)) {
        const compressed = await compressImageFile(file, COMPRESS_OPTIONS)
        const form = new FormData()
        form.append("file", compressed)
        const res = await fetch("/api/store/reviews/upload-image", { method: "POST", body: form })
        const json = (await res.json().catch(() => null)) as { publicUrl?: string; error?: string } | null
        if (!res.ok || !json?.publicUrl) throw new Error(json?.error ?? "Erro ao enviar a foto")
        uploaded.push(json.publicUrl)
      }
      setImages((prev) => [...prev, ...uploaded])
    } catch (err) {
      toast.error("Não foi possível enviar a foto", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setUploading(false)
    }
  }

  async function submit() {
    if (!body.trim()) {
      toast.error("Conte o que você achou do produto")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/store/products/${target.slug}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, title: title.trim() || null, body: body.trim(), imageUrls: images }),
      })
      const json = (await res.json().catch(() => null)) as { error?: string; auraRewarded?: number } | null
      if (!res.ok) throw new Error(json?.error ?? "Erro ao enviar avaliação")
      onSubmitted(json?.auraRewarded ?? 0)
    } catch (err) {
      toast.error("Erro ao enviar avaliação", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Avaliar produto</DialogTitle>
        <DialogDescription className="flex items-center gap-2.5">
          {target.image && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={target.image} alt="" className="size-9 shrink-0 rounded-md bg-muted object-contain p-0.5" />
          )}
          <span className="line-clamp-2">{target.name}</span>
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <div className="flex flex-col items-center gap-1.5">
          <div className="flex gap-1" onMouseLeave={() => setHover(0)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                aria-label={`${n} estrela${n > 1 ? "s" : ""}`}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
              >
                <Star
                  className={cn("size-8 transition-colors", n <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")}
                />
              </button>
            ))}
          </div>
          <span className="text-xs font-semibold text-muted-foreground">{RATING_LABEL[shown]}</span>
        </div>

        <Input placeholder="Título (opcional)" maxLength={150} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea
          placeholder="Como foi a experiência? Qualidade, entrega, o que mais gostou…"
          rows={4}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {images.map((url, i) => (
              <div key={url} className="relative size-20 overflow-hidden rounded-lg border border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="size-full object-cover" />
                <button
                  type="button"
                  aria-label="Remover foto"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-0.5 text-white"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
            {images.length < MAX_STORE_REVIEW_IMAGES && (
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                className="flex size-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-60"
              >
                {uploading ? <Loader2 className="size-5 animate-spin" /> : <Camera className="size-5" />}
                {uploading ? "Enviando" : "Foto"}
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            hidden
            onChange={(e) => {
              const files = Array.from(e.target.files ?? [])
              if (files.length > 0) void uploadFiles(files)
              e.target.value = ""
            }}
          />
          <p className="text-[11px] text-muted-foreground">
            Até {MAX_STORE_REVIEW_IMAGES} fotos do produto que você recebeu.
          </p>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-lg border border-orange-500/25 bg-orange-500/[0.06] px-3 py-2.5 text-xs">
          <span className="text-muted-foreground">
            {images.length > 0 ? "Com foto você ganha o dobro" : "Adicione uma foto e ganhe o dobro"}
          </span>
          <span className="flex items-center gap-1 font-bold text-foreground">
            +<AuraAmount value={reward} size="sm" tone="brand" />
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          Cancelar
        </Button>
        <Button onClick={submit} disabled={submitting || uploading} className="gap-1.5">
          {submitting && <Loader2 className="size-3.5 animate-spin" />}
          Enviar avaliação
        </Button>
      </DialogFooter>
    </>
  )
}
