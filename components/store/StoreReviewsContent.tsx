"use client"

import Link from "next/link"
import { ArrowLeft, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePageHeader } from "@/components/providers/page-header-context"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"
import { getCategoryIcon } from "@/lib/store-category-icons"
import type { StoreFilterOptions } from "@/lib/server/repositories/store-repository"
import type { StoreWideReview, ReviewAggregate } from "@/lib/server/repositories/store-reviews-repository"

function StarRow({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(size, n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </div>
  )
}

interface StoreReviewsContentProps {
  filterOptions: StoreFilterOptions
  aggregate: ReviewAggregate
  reviews: StoreWideReview[]
}

export function StoreReviewsContent({ filterOptions, aggregate, reviews }: StoreReviewsContentProps) {
  usePageHeader("Avaliações", "O que a galera está achando dos produtos da loja")

  return (
    <div>
      <StoreCategoryNav
        categories={filterOptions.categories}
        categoryCounts={filterOptions.categoryCounts}
        brandsByCategory={filterOptions.brandsByCategory}
        activeCategory={null}
        previewPool={[]}
      />

      <div className="relative overflow-hidden border-b border-[#1c1c1c] bg-[#0b0f14] py-10 sm:py-14">
        <Star
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 -right-6 size-[220px] fill-amber-400/[0.08] text-amber-400/[0.08] sm:size-[280px]"
          strokeWidth={0}
        />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-3 px-4 lg:px-8">
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
          {aggregate.count > 0 ? (
            <div className="flex items-center gap-2.5">
              <StarRow value={Math.round(aggregate.avgRating)} size="size-5" />
              <span className="text-[14px] font-semibold text-[#cfcfcf]">
                {aggregate.avgRating.toFixed(1)} · {aggregate.count} avaliaç{aggregate.count === 1 ? "ão" : "ões"} de compradores
              </span>
            </div>
          ) : (
            <p className="text-[13px] font-semibold text-[#9a9a9a]">
              Ainda não há avaliações — seja o primeiro a comprar e avaliar um produto.
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-10 pt-7 sm:pb-[72px] sm:pt-10 lg:px-8">
        {reviews.length === 0 ? (
          <div className="rounded-[18px] border border-[#262626] bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhuma avaliação publicada ainda.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
            {reviews.map((review) => {
              const product = review.product
              const { icon: Icon, tint } = getCategoryIcon(product?.category ?? null)
              return (
                <div key={review.id} className="flex flex-col gap-3 rounded-[16px] border border-[#262626] bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <StarRow value={review.rating} />
                    {review.is_verified_purchase && (
                      <span className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
                        Compra verificada
                      </span>
                    )}
                  </div>
                  {review.title && <p className="text-[13.5px] font-semibold text-foreground">{review.title}</p>}
                  <p className="line-clamp-4 text-[13px] leading-relaxed text-muted-foreground">{review.body}</p>
                  <p className="text-[10.5px] text-muted-foreground/60">
                    {review.author?.display_name ?? "Usuário"} · {new Date(review.created_at).toLocaleDateString("pt-BR")}
                  </p>
                  {product && (
                    <Link
                      href={`/loja/${product.slug}`}
                      className="mt-1 flex items-center gap-2.5 rounded-[11px] border border-[#262626] bg-[#0e0e0e] px-3 py-2.5 transition-colors hover:border-foreground/25"
                    >
                      {product.images?.[0] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.images[0]}
                          alt=""
                          className="size-9 shrink-0 rounded-[8px] bg-[#171717] object-contain p-1"
                        />
                      ) : (
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[#171717]">
                          <Icon className="size-[18px] opacity-55" style={{ color: tint }} strokeWidth={1.6} />
                        </span>
                      )}
                      <span className="min-w-0 truncate text-[12.5px] font-semibold text-white">{product.name}</span>
                    </Link>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
