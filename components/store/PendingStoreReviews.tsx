"use client"

import { useCallback, useEffect, useState } from "react"
import { MessageSquareHeart, Star } from "lucide-react"

import { AuraAmount } from "@/components/ui/AuraIcon"
import { STORE_REVIEW_AURA, STORE_REVIEW_WITH_PHOTO_AURA } from "@/lib/store-review-aura"
// `import type` é apagado no build: não puxa `server-only` para o bundle.
import type { PendingProductReview } from "@/lib/server/repositories/store-reviews-repository"

async function fetchPending(): Promise<PendingProductReview[] | null> {
  try {
    const res = await fetch("/api/store/reviews/pending", { cache: "no-store" })
    if (!res.ok) return null
    const json = (await res.json()) as { pending?: PendingProductReview[] }
    return json.pending ?? []
  } catch {
    // Convite é opcional: falhar aqui não pode atrapalhar a lista de pedidos.
    return null
  }
}

/** Produtos que a pessoa pode avaliar agora (pedido concluído ou liberação do admin). */
export function usePendingStoreReviews() {
  const [pending, setPending] = useState<PendingProductReview[]>([])

  const reload = useCallback(async () => {
    const next = await fetchPending()
    if (next) setPending(next)
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchPending().then((next) => {
      if (!cancelled && next) setPending(next)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { pending, reload }
}

/**
 * Convite no topo de Meus Pedidos. Aparece só quando há o que avaliar, e
 * cada produto abre o formulário ali mesmo, sem levar a pessoa para outra
 * página.
 */
export function PendingStoreReviews({
  pending,
  onReview,
}: {
  pending: PendingProductReview[]
  onReview: (item: PendingProductReview) => void
}) {
  if (pending.length === 0) return null

  return (
    <section
      id="avaliar"
      className="mb-5 scroll-mt-24 overflow-hidden rounded-xl border border-amber-400/30 bg-gradient-to-br from-amber-400/[0.08] via-transparent to-orange-500/[0.06]"
    >
      <div className="flex flex-col gap-1 px-4 pb-3 pt-4">
        <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <MessageSquareHeart className="size-4 text-amber-400" />
          Avalie sua experiência comprando com a gente
        </p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
          Ajude outras pessoas que querem comprar e farme Aura com sua avaliação:
          <AuraAmount value={STORE_REVIEW_AURA} size="sm" tone="brand" className="font-semibold text-foreground" />
          ou
          <AuraAmount value={STORE_REVIEW_WITH_PHOTO_AURA} size="sm" tone="brand" className="font-semibold text-foreground" />
          com foto.
        </p>
      </div>

      <ul className="flex flex-col divide-y divide-border/60 border-t border-border/60">
        {pending.map((item) => (
          <li key={item.productId} className="flex items-center gap-3 px-4 py-2.5">
            {item.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image} alt="" className="size-10 shrink-0 rounded-md bg-muted object-contain p-0.5" />
            ) : (
              <span className="size-10 shrink-0 rounded-md bg-muted" />
            )}
            <span className="min-w-0 flex-1 truncate text-sm text-foreground">{item.name}</span>
            <button
              type="button"
              onClick={() => onReview(item)}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-xs font-semibold text-amber-300 transition-colors hover:bg-amber-400/20"
            >
              <Star className="size-3.5" />
              Avaliar
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
