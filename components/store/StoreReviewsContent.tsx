"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePageHeader } from "@/components/providers/page-header-context"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"
import {
  entryFromReview,
  entryFromTestimonial,
  StarRow,
  StoreReviewCard,
} from "@/components/store/StoreReviewCard"
import { AuraAmount } from "@/components/ui/AuraIcon"
import { STORE_REVIEW_AURA, STORE_REVIEW_WITH_PHOTO_AURA } from "@/lib/store-review-aura"
import type { StoreFilterOptions } from "@/lib/server/repositories/store-repository"
import type { StoreWideAggregate, StoreWideReview } from "@/lib/server/repositories/store-reviews-repository"
import type { StoreTestimonial } from "@/lib/store-testimonials"

const PAGE_SIZE = 24

interface StoreReviewsContentProps {
  filterOptions: StoreFilterOptions
  aggregate: StoreWideAggregate
  reviews: StoreWideReview[]
  testimonials: StoreTestimonial[]
}

export function StoreReviewsContent({ filterOptions, aggregate, reviews, testimonials }: StoreReviewsContentProps) {
  usePageHeader("Avaliações", "O que a galera está achando dos produtos da loja")

  // Um feed só, mais recentes primeiro: com o filtro por nota, duas seções
  // separadas obrigavam a procurar a mesma nota em dois lugares. Cada card
  // continua dizendo a origem pelo selo.
  const entries = useMemo(
    () =>
      [...reviews.map(entryFromReview), ...testimonials.map(entryFromTestimonial)].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      ),
    [reviews, testimonials]
  )

  const [stars, setStars] = useState<number | null>(null)
  const [visible, setVisible] = useState(PAGE_SIZE)

  const filtered = useMemo(
    () => (stars === null ? entries : entries.filter((e) => e.rating === stars)),
    [entries, stars]
  )

  function pick(next: number | null) {
    setStars((current) => (current === next ? null : next))
    setVisible(PAGE_SIZE)
  }

  const { avgRating, count, distribution } = aggregate

  return (
    <div>
      <StoreCategoryNav data={filterOptions} activeCategory={null} />

      <div className="relative overflow-hidden border-b border-[#1c1c1c] bg-[#0b0f14] py-10 sm:py-14">
        <Star
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 -right-6 size-[220px] fill-amber-400/[0.08] text-amber-400/[0.08] sm:size-[280px]"
          strokeWidth={0}
        />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-6 px-4 lg:px-8">
          <div className="flex flex-col gap-3">
            <Link
              href="/loja"
              className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#9a9a9a] transition-colors hover:text-white"
            >
              <ArrowLeft className="size-3.5" />
              Voltar à loja
            </Link>
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">Avaliações</span>
              <h1 className="font-display text-3xl font-bold leading-tight tracking-[-0.02em] text-white sm:text-[42px]">
                O que estão achando da loja
              </h1>
            </div>
          </div>

          {count > 0 ? (
            <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:gap-10">
              <div className="flex shrink-0 flex-col gap-1.5">
                <div className="flex items-end gap-2">
                  <span className="font-display text-5xl font-bold leading-none tabular-nums text-white">
                    {avgRating.toFixed(1).replace(".", ",")}
                  </span>
                  <span className="pb-1 text-sm font-semibold text-[#7a7a7a]">de 5</span>
                </div>
                <StarRow value={Math.round(avgRating)} size="size-5" />
                <span className="text-[12.5px] font-semibold text-[#9a9a9a]">
                  {count} avaliaç{count === 1 ? "ão" : "ões"} de clientes
                </span>
              </div>

              <div className="flex w-full max-w-sm flex-col gap-1.5">
                {[5, 4, 3, 2, 1].map((n) => {
                  const total = distribution[n - 1]
                  const pct = count === 0 ? 0 : Math.round((total / count) * 100)
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => pick(n)}
                      disabled={total === 0}
                      aria-pressed={stars === n}
                      className={cn(
                        "group flex items-center gap-2.5 rounded-md px-1.5 py-0.5 text-left transition-colors disabled:cursor-default",
                        stars === n ? "bg-white/[0.06]" : "enabled:hover:bg-white/[0.04]"
                      )}
                    >
                      <span className="flex w-7 shrink-0 items-center gap-0.5 text-[12px] font-semibold tabular-nums text-[#cfcfcf]">
                        {n}
                        <Star className="size-3 fill-amber-400 text-amber-400" />
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                        <span className="block h-full rounded-full bg-amber-400" style={{ width: `${pct}%` }} />
                      </span>
                      <span className="w-9 shrink-0 text-right text-[11.5px] tabular-nums text-[#8a8a8a]">{total}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-[13px] font-semibold text-[#9a9a9a]">
              Ainda não há avaliações. Seja o primeiro a comprar e avaliar um produto.
            </p>
          )}

          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] text-[#9a9a9a]">
            Comprou com a gente? Avalie em Meus Pedidos e ganhe
            <AuraAmount value={STORE_REVIEW_AURA} size="sm" tone="brand" className="font-semibold text-white" />
            ou
            <AuraAmount value={STORE_REVIEW_WITH_PHOTO_AURA} size="sm" tone="brand" className="font-semibold text-white" />
            com foto.
          </p>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-10 pt-7 sm:pb-[72px] sm:pt-10 lg:px-8">
        {count > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por nota">
            <FilterChip active={stars === null} onClick={() => pick(null)}>
              Todas <span className="text-[#7a7a7a]">({count})</span>
            </FilterChip>
            {[5, 4, 3, 2, 1].map((n) => (
              <FilterChip key={n} active={stars === n} onClick={() => pick(n)} disabled={distribution[n - 1] === 0}>
                {n}
                <Star className="size-3 fill-amber-400 text-amber-400" />
                <span className="text-[#7a7a7a]">({distribution[n - 1]})</span>
              </FilterChip>
            ))}
          </div>
        )}

        {filtered.length === 0 ? (
          <div className="rounded-[18px] border border-[#262626] bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">
              {stars === null ? "Nenhuma avaliação publicada ainda." : `Nenhuma avaliação com ${stars} estrela${stars > 1 ? "s" : ""}.`}
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.slice(0, visible).map((entry) => (
                <StoreReviewCard key={entry.key} entry={entry} clampBody />
              ))}
            </div>
            {filtered.length > visible && (
              <button
                type="button"
                onClick={() => setVisible((v) => v + PAGE_SIZE)}
                className="mx-auto rounded-full border border-[#262626] px-5 py-2 text-[13px] font-semibold text-white transition-colors hover:border-foreground/30"
              >
                Ver mais avaliações ({filtered.length - visible})
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function FilterChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors disabled:opacity-40",
        active
          ? "border-amber-400/60 bg-amber-400/10 text-white"
          : "border-[#262626] text-[#cfcfcf] enabled:hover:border-foreground/30"
      )}
    >
      {children}
    </button>
  )
}
