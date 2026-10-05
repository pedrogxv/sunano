"use client"

import Link from "next/link"
import { ArrowLeft, ImageIcon, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePageHeader } from "@/components/providers/page-header-context"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"
import { getCategoryIcon } from "@/lib/store-category-icons"
import type { StoreFilterOptions } from "@/lib/server/repositories/store-repository"
import type { StoreWideReview, ReviewAggregate } from "@/lib/server/repositories/store-reviews-repository"
import { TESTIMONIAL_SOURCE_LABEL, type StoreTestimonial } from "@/lib/store-testimonials"

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
  testimonials: StoreTestimonial[]
}

export function StoreReviewsContent({ filterOptions, aggregate, reviews, testimonials }: StoreReviewsContentProps) {
  usePageHeader("Avaliações", "O que a galera está achando dos produtos da loja")

  // Média geral junta as duas origens, mas cada card diz de onde veio: o selo
  // "Compra verificada" só existe nas avaliações com pedido pago no site.
  const total = aggregate.count + testimonials.length
  const avgRating =
    total === 0
      ? 0
      : (aggregate.avgRating * aggregate.count + testimonials.reduce((sum, t) => sum + t.rating, 0)) / total

  return (
    <div>
      <StoreCategoryNav data={filterOptions} activeCategory={null} />

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
          {total > 0 ? (
            <div className="flex items-center gap-2.5">
              <StarRow value={Math.round(avgRating)} size="size-5" />
              <span className="text-[14px] font-semibold text-[#cfcfcf]">
                {avgRating.toFixed(1)} · {total} avaliaç{total === 1 ? "ão" : "ões"} de clientes
              </span>
            </div>
          ) : (
            <p className="text-[13px] font-semibold text-[#9a9a9a]">
              Ainda não há avaliações. Seja o primeiro a comprar e avaliar um produto.
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-10 pt-7 sm:pb-[72px] sm:pt-10 lg:px-8">
        {testimonials.length > 0 && (
          <section aria-label="Depoimentos de clientes" className="flex flex-col gap-3.5">
            <div className="flex flex-col gap-1">
              <h2 className="font-display text-xl font-bold text-white">Depoimentos de clientes</h2>
              <p className="text-[12.5px] text-[#9a9a9a]">
                Clientes que compraram direto com a gente. Quando há print da conversa ou foto do produto, ele aparece junto.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
              {testimonials.map((t) => (
                <div key={t.id} className="flex flex-col gap-3 rounded-[16px] border border-[#262626] bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <StarRow value={t.rating} />
                    <span className="shrink-0 rounded-full bg-sky-500/10 px-2 py-0.5 text-[10px] font-bold text-sky-400">
                      Cliente Sunano
                    </span>
                  </div>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{t.body}</p>
                  <p className="text-[10.5px] text-muted-foreground/60">
                    {t.customer_name} · via {TESTIMONIAL_SOURCE_LABEL[t.source]}
                    {t.purchased_on ? ` · ${new Date(`${t.purchased_on}T12:00:00`).toLocaleDateString("pt-BR")}` : ""}
                  </p>
                  {t.product_label && (
                    <p className="truncate rounded-[11px] border border-[#262626] bg-[#0e0e0e] px-3 py-2 text-[12.5px] font-semibold text-white">
                      {t.product_label}
                    </p>
                  )}
                  {t.proof_image_url && (
                    <a
                      href={t.proof_image_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group relative block h-56 overflow-hidden rounded-[11px] border border-[#262626] bg-[#0e0e0e]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={t.proof_image_url}
                        alt={`Prova do depoimento de ${t.customer_name}`}
                        loading="lazy"
                        className="size-full object-cover object-top transition-opacity group-hover:opacity-90"
                      />
                      <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-bold text-white">
                        <ImageIcon className="size-3" />
                        Ver prova
                      </span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {reviews.length > 0 && testimonials.length > 0 && (
          <h2 className="font-display text-xl font-bold text-white">Compras verificadas no site</h2>
        )}

        {reviews.length === 0 && testimonials.length > 0 ? null : reviews.length === 0 ? (
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
