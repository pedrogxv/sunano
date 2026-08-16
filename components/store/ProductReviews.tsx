"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Loader2, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { extractYoutubeVideoId } from "@/lib/youtube-url"

interface ProductReview {
  id: string
  rating: number
  title: string | null
  body: string
  is_verified_purchase: boolean
  created_at: string
  author: { display_name: string | null; avatar_url: string | null } | null
}

interface SunanoReview {
  rating: number | null
  title: string
  body: string
  video_url: string | null
}

interface ReviewsResponse {
  reviews: ProductReview[]
  aggregate: { avgRating: number; count: number }
  sunanoReview: SunanoReview | null
  userReview: ProductReview | null
  canReview: boolean
}

function StarRow({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(size, n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </div>
  )
}

export function ProductReviews({
  productSlug,
}: {
  productId: string
  productSlug: string
  productType: "store" | "bazaar"
}) {
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ rating: 5, title: "", body: "" })

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/store/products/${productSlug}/reviews`)
      const json = (await res.json()) as ReviewsResponse
      setData(json)
    } catch {
      // silencioso — seção de reviews não é crítica para a compra
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSlug])

  async function submitReview() {
    if (!form.body.trim()) {
      toast.error("Escreva um comentário sobre o produto")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/store/products/${productSlug}/reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: form.rating, title: form.title.trim() || null, body: form.body.trim() }),
      })
      const json = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(json.error ?? "Erro ao enviar avaliação")
      toast.success("Avaliação enviada!")
      setShowForm(false)
      load()
    } catch (err) {
      toast.error("Erro ao enviar avaliação", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !data) return null

  const sunanoVideoId = data.sunanoReview?.video_url ? extractYoutubeVideoId(data.sunanoReview.video_url) : null

  return (
    <div className="mt-12 space-y-8">
      {data.sunanoReview && (
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-6">
          <div className="mb-3 flex items-center gap-2">
            <Badge className="bg-emerald-500 text-white hover:bg-emerald-500">Análise do Sunano</Badge>
            {data.sunanoReview.rating && <StarRow value={data.sunanoReview.rating} />}
          </div>
          <h3 className="text-lg font-black text-foreground">{data.sunanoReview.title}</h3>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {data.sunanoReview.body}
          </p>
          {sunanoVideoId && (
            <div className="mt-4 aspect-video overflow-hidden rounded-xl border border-border">
              <iframe
                src={`https://www.youtube.com/embed/${sunanoVideoId}`}
                title="Vídeo da análise do Sunano"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          )}
        </div>
      )}

      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-foreground">Avaliações de compradores</h2>
            {data.aggregate.count > 0 && (
              <div className="mt-1 flex items-center gap-2">
                <StarRow value={Math.round(data.aggregate.avgRating)} />
                <span className="text-sm text-muted-foreground">
                  {data.aggregate.avgRating.toFixed(1)} · {data.aggregate.count}{" "}
                  {data.aggregate.count === 1 ? "avaliação" : "avaliações"}
                </span>
              </div>
            )}
          </div>
          {data.canReview && !showForm && (
            <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
              Avaliar produto
            </Button>
          )}
        </div>

        {showForm && (
          <div className="mb-6 space-y-3 rounded-xl border border-border bg-muted/10 p-4">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Sua nota:</span>
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setForm((prev) => ({ ...prev, rating: n }))}>
                    <Star className={cn("size-5", n <= form.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
                  </button>
                ))}
              </div>
            </div>
            <Input
              placeholder="Título (opcional)"
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
            />
            <textarea
              placeholder="O que você achou do produto?"
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              rows={4}
              className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button size="sm" onClick={submitReview} disabled={submitting} className="gap-1.5">
                {submitting && <Loader2 className="size-3.5 animate-spin" />}
                Enviar avaliação
              </Button>
            </div>
          </div>
        )}

        {data.reviews.length === 0 ? (
          <p className="rounded-xl border border-border py-8 text-center text-sm text-muted-foreground">
            Ainda não há avaliações deste produto.{" "}
            {!data.canReview && "Compre e volte para avaliar!"}
          </p>
        ) : (
          <div className="space-y-4">
            {data.reviews.map((review) => (
              <div key={review.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center gap-2">
                  <StarRow value={review.rating} />
                  {review.is_verified_purchase && (
                    <Badge variant="secondary" className="bg-emerald-500/10 text-[10px] text-emerald-400">
                      Compra verificada
                    </Badge>
                  )}
                </div>
                {review.title && <p className="mt-1.5 text-sm font-semibold text-foreground">{review.title}</p>}
                <p className="mt-1 text-sm text-muted-foreground">{review.body}</p>
                <p className="mt-2 text-[10px] text-muted-foreground/60">
                  {review.author?.display_name ?? "Usuário"} · {new Date(review.created_at).toLocaleDateString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
