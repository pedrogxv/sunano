"use client"

import { Star, ThumbsUp } from "lucide-react"

import { formatRating } from "@/components/peripherals/PeripheralReviewCard"
import { StarRating } from "@/components/ui/star-rating"
import {
  RATING_BUCKETS,
  ratingBucketRange,
  type RatingBucket,
  type RatingDistribution,
} from "@/lib/peripheral-review-list"
import { cn } from "@/lib/utils"

const GAUGE_RADIUS = 42
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS

/**
 * Resumo das reviews de um periférico: a média num anel, a distribuição por
 * faixa de estrelas e quantos aprovaram.
 *
 * As barras SÃO o filtro: clicar numa faixa mostra só aquelas reviews, e
 * clicar de novo volta para todas. É o jeito mais curto de ir direto às
 * críticas de um produto bem avaliado (ou o contrário), sem procurar um
 * seletor de filtro em outro lugar da tela. Faixa vazia não é clicável: filtrar
 * para uma lista vazia não responde nada.
 */
export function PeripheralReviewsSummary({
  average,
  totalCount,
  distribution,
  positiveCount,
  activeStars,
  onSelectStars,
  cta,
}: {
  average: number | null
  totalCount: number
  distribution: RatingDistribution
  positiveCount: number
  activeStars: RatingBucket | null
  onSelectStars: (stars: RatingBucket | null) => void
  cta?: React.ReactNode
}) {
  const ratio = average != null ? Math.min(1, Math.max(0, average / 5)) : 0
  const positivePercent = totalCount > 0 ? Math.round((positiveCount / totalCount) * 100) : 0
  const maxBucket = Math.max(1, ...RATING_BUCKETS.map((b) => distribution[b] ?? 0))

  return (
    <section
      aria-label="Resumo das reviews"
      className="rounded-2xl bg-card p-4 ring-1 ring-foreground/[0.07] sm:p-5"
    >
      <div className="grid grid-cols-[auto_1fr] items-center gap-x-5 gap-y-4 lg:grid-cols-1">
        <div className="flex flex-col items-center gap-2 lg:flex-row lg:gap-4">
          <div className="relative size-24 shrink-0 sm:size-28">
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
              <circle cx="50" cy="50" r={GAUGE_RADIUS} fill="none" strokeWidth="7" className="stroke-muted" />
              <circle
                cx="50"
                cy="50"
                r={GAUGE_RADIUS}
                fill="none"
                strokeWidth="7"
                strokeLinecap="round"
                strokeDasharray={GAUGE_CIRCUMFERENCE}
                strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - ratio)}
                className="stroke-amber-400 transition-[stroke-dashoffset] duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl leading-none font-semibold tracking-tight tabular-nums sm:text-4xl">
                {average != null ? formatRating(average) : "–"}
              </span>
              <span className="mt-1 text-[11px] text-muted-foreground">de 5</span>
            </div>
          </div>
          <div className="flex flex-col items-center gap-1 lg:items-start">
            <StarRating value={average ?? 0} size="sm" />
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">{totalCount}</span>{" "}
              {totalCount === 1 ? "review" : "reviews"}
            </p>
          </div>
        </div>

        <ul className="space-y-1" aria-label="Filtrar por nota">
          {RATING_BUCKETS.map((bucket) => {
            const count = distribution[bucket] ?? 0
            const active = activeStars === bucket
            const dimmed = activeStars !== null && !active
            const share = totalCount > 0 ? Math.round((count / totalCount) * 100) : 0
            return (
              <li key={bucket}>
                <button
                  type="button"
                  disabled={count === 0}
                  onClick={() => onSelectStars(active ? null : bucket)}
                  aria-pressed={active}
                  aria-label={`${ratingBucketRange(bucket)}: ${count} ${count === 1 ? "review" : "reviews"} (${share}%)`}
                  title={ratingBucketRange(bucket)}
                  className={cn(
                    "group flex w-full items-center gap-2.5 rounded-lg px-2 py-1 text-xs transition",
                    "hover:bg-muted/60 disabled:pointer-events-none",
                    active && "bg-amber-400/10 ring-1 ring-amber-400/40",
                    dimmed && "opacity-45",
                    count === 0 && "opacity-40"
                  )}
                >
                  <span className="flex w-6 shrink-0 items-center justify-end gap-0.5 font-medium tabular-nums text-foreground/80">
                    {bucket}
                    <Star className="size-3 fill-amber-400 text-amber-400" />
                  </span>
                  <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="absolute inset-y-0 left-0 rounded-full bg-amber-400 transition-[width] duration-500 ease-out group-hover:bg-amber-300"
                      style={{ width: `${(count / maxBucket) * 100}%` }}
                    />
                  </span>
                  <span className="w-7 shrink-0 text-right tabular-nums text-muted-foreground">{count}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      {totalCount > 0 && (
        <p className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-500/[0.07] px-3 py-2 text-xs text-muted-foreground">
          <ThumbsUp className="size-3.5 shrink-0 text-emerald-400" />
          <span>
            <span className="font-semibold text-emerald-400 tabular-nums">{positivePercent}%</span> deram 4 estrelas
            ou mais
          </span>
        </p>
      )}

      {cta && <div className="mt-4">{cta}</div>}
    </section>
  )
}
