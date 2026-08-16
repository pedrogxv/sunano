"use client"

import { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import { Eye, EyeOff, Loader2, Star } from "lucide-react"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"
import { cn } from "@/lib/utils"

interface StoreProduct {
  id: string
  name: string
}

interface ProductReview {
  id: string
  rating: number
  title: string | null
  body: string
  is_verified_purchase: boolean
  status: "published" | "hidden"
  created_at: string
  author: { display_name: string | null; avatar_url: string | null } | null
}

interface SunanoReview {
  id: string
  rating: number | null
  title: string
  body: string
  video_url: string | null
  published: boolean
}

function StarRow({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onChange}
          onClick={() => onChange?.(n)}
          className={cn(!onChange && "cursor-default")}
        >
          <Star
            className={cn(
              "size-4",
              n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
            )}
          />
        </button>
      ))}
    </div>
  )
}

export default function AdminProductReviewsPage() {
  const { id } = useParams<{ id: string }>()
  const [product, setProduct] = useState<StoreProduct | null>(null)
  const [reviews, setReviews] = useState<ProductReview[]>([])
  const [loading, setLoading] = useState(true)
  const [moderating, setModerating] = useState<string | null>(null)

  const [sunanoForm, setSunanoForm] = useState({
    rating: 5,
    title: "",
    body: "",
    video_url: "",
    published: false,
  })
  const [savingSunano, setSavingSunano] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [productRes, reviewsRes, sunanoRes] = await Promise.all([
        fetch(`/api/admin/store/products/${id}`),
        fetch(`/api/admin/store/products/${id}/reviews`),
        fetch(`/api/admin/store/products/${id}/sunano-review`),
      ])
      const productData = (await productRes.json()) as { product?: StoreProduct }
      const reviewsData = (await reviewsRes.json()) as { reviews?: ProductReview[] }
      const sunanoData = (await sunanoRes.json()) as { review?: SunanoReview | null }

      setProduct(productData.product ?? null)
      setReviews(reviewsData.reviews ?? [])
      if (sunanoData.review) {
        setSunanoForm({
          rating: sunanoData.review.rating ?? 5,
          title: sunanoData.review.title,
          body: sunanoData.review.body,
          video_url: sunanoData.review.video_url ?? "",
          published: sunanoData.review.published,
        })
      }
    } catch {
      toast.error("Erro ao carregar avaliações")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  async function toggleStatus(review: ProductReview) {
    setModerating(review.id)
    const nextStatus = review.status === "published" ? "hidden" : "published"
    try {
      const res = await fetch(`/api/admin/store/products/${id}/reviews`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: review.id, status: nextStatus }),
      })
      if (!res.ok) throw new Error()
      setReviews((prev) => prev.map((r) => (r.id === review.id ? { ...r, status: nextStatus } : r)))
      toast.success(nextStatus === "hidden" ? "Avaliação ocultada" : "Avaliação restaurada")
    } catch {
      toast.error("Erro ao moderar avaliação")
    } finally {
      setModerating(null)
    }
  }

  async function saveSunanoReview() {
    if (!sunanoForm.title.trim() || !sunanoForm.body.trim()) {
      toast.error("Preencha título e texto da análise")
      return
    }
    setSavingSunano(true)
    try {
      const res = await fetch(`/api/admin/store/products/${id}/sunano-review`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating: sunanoForm.rating,
          title: sunanoForm.title.trim(),
          body: sunanoForm.body.trim(),
          video_url: sunanoForm.video_url.trim() || null,
          published: sunanoForm.published,
        }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar")
      toast.success("Análise do Sunano salva")
    } catch (err) {
      toast.error("Erro ao salvar análise", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSavingSunano(false)
    }
  }

  usePageHeader("Avaliações", product ? product.name : "Modere reviews e escreva a análise oficial.")

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <BackBreadcrumb href="/admin/store" parentLabel="Loja" currentLabel="Avaliações" />
        <div className="flex justify-center py-16">
          <BoxLoader />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <BackBreadcrumb href="/admin/store" parentLabel="Loja" currentLabel={product?.name ?? "Avaliações"} />

      {/* Sunano review editor */}
      <div className="space-y-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black text-foreground">Análise oficial do Sunano</h2>
          <button
            type="button"
            onClick={() => setSunanoForm((prev) => ({ ...prev, published: !prev.published }))}
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold transition-colors",
              sunanoForm.published
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-slate-500/15 text-muted-foreground"
            )}
          >
            {sunanoForm.published ? "✅ Publicada" : "🔒 Rascunho"}
          </button>
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Nota</Label>
          <StarRow value={sunanoForm.rating} onChange={(v) => setSunanoForm((prev) => ({ ...prev, rating: v }))} />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Título</Label>
          <Input
            value={sunanoForm.title}
            onChange={(e) => setSunanoForm((prev) => ({ ...prev, title: e.target.value }))}
            placeholder="Ex: Excelente custo-benefício para competitivo"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Texto da análise</Label>
          <textarea
            value={sunanoForm.body}
            onChange={(e) => setSunanoForm((prev) => ({ ...prev, body: e.target.value }))}
            rows={6}
            className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            placeholder="Escreva sua análise completa do produto..."
          />
        </div>

        <div className="space-y-2">
          <Label className="text-xs">Vídeo de análise (YouTube, opcional)</Label>
          <Input
            value={sunanoForm.video_url}
            onChange={(e) => setSunanoForm((prev) => ({ ...prev, video_url: e.target.value }))}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </div>

        <Button onClick={saveSunanoReview} disabled={savingSunano} className="gap-2">
          {savingSunano && <Loader2 className="size-4 animate-spin" />}
          Salvar análise
        </Button>
      </div>

      {/* User reviews moderation */}
      <div className="space-y-3">
        <h2 className="text-base font-black text-foreground">
          Avaliações de usuários <span className="text-muted-foreground font-normal">({reviews.length})</span>
        </h2>

        {reviews.length === 0 ? (
          <p className="rounded-xl border border-border py-10 text-center text-sm text-muted-foreground">
            Nenhuma avaliação ainda.
          </p>
        ) : (
          <div className="space-y-3">
            {reviews.map((review) => (
              <div key={review.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2">
                      <StarRow value={review.rating} />
                      {review.is_verified_purchase && (
                        <Badge variant="secondary" className="bg-emerald-500/10 text-[10px] text-emerald-400">
                          Compra verificada
                        </Badge>
                      )}
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-[10px]",
                          review.status === "published"
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-slate-500/10 text-muted-foreground"
                        )}
                      >
                        {review.status === "published" ? "Publicada" : "Oculta"}
                      </Badge>
                    </div>
                    {review.title && <p className="text-sm font-semibold text-foreground">{review.title}</p>}
                    <p className="text-sm text-muted-foreground">{review.body}</p>
                    <p className="text-[10px] text-muted-foreground/60">
                      {review.author?.display_name ?? "Usuário"} · {new Date(review.created_at).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                    disabled={moderating === review.id}
                    onClick={() => toggleStatus(review)}
                  >
                    {review.status === "published" ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
