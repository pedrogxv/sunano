"use client"

import Link from "next/link"
import { Star } from "lucide-react"

import { AuthorAvatarLink, AuthorNameLink, authorFrom } from "@/components/profile/AuthorLink"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { getCategoryIcon } from "@/lib/store-category-icons"
import { TESTIMONIAL_SOURCE_LABEL, type StoreTestimonial } from "@/lib/store-testimonials"
import { cn } from "@/lib/utils"
// `import type` é apagado no build: não puxa `server-only` para o bundle.
import type { ProductReview, StoreWideReview } from "@/lib/server/repositories/store-reviews-repository"

export function StarRow({ value, size = "size-4" }: { value: number; size?: string }) {
  return (
    <div className="flex gap-0.5" aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={cn(size, n <= value ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
      ))}
    </div>
  )
}

/**
 * Uma entrada do feed de avaliações, venha de onde vier: avaliação feita no
 * site (`store_product_reviews`) ou depoimento cadastrado pelo admin
 * (`store_testimonials`). O selo diz a origem: "Compra verificada" só existe
 * com pedido pago no site.
 */
export type StoreReviewEntry = {
  key: string
  rating: number
  title: string | null
  body: string
  images: string[]
  date: string
  badge: "verified" | "customer" | null
  author:
    | { kind: "member"; review: ProductReview }
    | { kind: "guest"; name: string; via: string | null }
  product: { slug: string; name: string; image: string | null; category: string | null } | null
  productLabel: string | null
}

export function entryFromReview(review: ProductReview | StoreWideReview): StoreReviewEntry {
  const product = "product" in review ? review.product : null
  return {
    key: `r-${review.id}`,
    rating: review.rating,
    title: review.title,
    body: review.body,
    images: review.image_urls,
    date: review.created_at,
    badge: review.origin === "grant" ? "customer" : review.is_verified_purchase ? "verified" : null,
    author: { kind: "member", review },
    product: product
      ? { slug: product.slug, name: product.name, image: product.images?.[0] ?? null, category: product.category }
      : null,
    productLabel: null,
  }
}

export function entryFromTestimonial(t: StoreTestimonial): StoreReviewEntry {
  return {
    key: `t-${t.id}`,
    rating: t.rating,
    title: null,
    body: t.body,
    images: t.proof_image_url ? [t.proof_image_url] : [],
    date: t.purchased_on ? `${t.purchased_on}T12:00:00` : t.created_at,
    badge: "customer",
    author: { kind: "guest", name: t.customer_name, via: TESTIMONIAL_SOURCE_LABEL[t.source] },
    product: null,
    productLabel: t.product_label,
  }
}

const BADGE = {
  verified: { label: "Compra verificada", className: "bg-emerald-500/10 text-emerald-400" },
  customer: { label: "Cliente Sunano", className: "bg-sky-500/10 text-sky-400" },
} as const

export function StoreReviewCard({ entry, clampBody = false }: { entry: StoreReviewEntry; clampBody?: boolean }) {
  const date = new Date(entry.date).toLocaleDateString("pt-BR")

  return (
    <article className="flex flex-col gap-3 rounded-[16px] border border-[#262626] bg-card p-4">
      <div className="flex items-center gap-2.5">
        {entry.author.kind === "member" ? (
          <MemberAuthor review={entry.author.review} date={date} />
        ) : (
          <>
            {/* Depoimento de quem não tem conta: sem perfil, então sem moldura. */}
            <ProfileAvatar name={entry.author.name} avatarUrl={null} size="sm" />
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium text-foreground">{entry.author.name}</p>
              <p className="text-[10.5px] text-muted-foreground/70">
                {entry.author.via ? `via ${entry.author.via} · ` : ""}
                {date}
              </p>
            </div>
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2">
        <StarRow value={entry.rating} />
        {entry.badge && (
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", BADGE[entry.badge].className)}>
            {BADGE[entry.badge].label}
          </span>
        )}
      </div>

      {entry.title && <p className="text-[13.5px] font-semibold text-foreground">{entry.title}</p>}
      <p
        className={cn(
          "whitespace-pre-line text-[13px] leading-relaxed text-muted-foreground",
          clampBody && "line-clamp-6"
        )}
      >
        {entry.body}
      </p>

      {entry.images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entry.images.map((url, i) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="block size-20 overflow-hidden rounded-[10px] border border-[#262626] bg-[#0e0e0e] transition-opacity hover:opacity-90"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Foto ${i + 1} da avaliação`} loading="lazy" className="size-full object-cover" />
            </a>
          ))}
        </div>
      )}

      {entry.product ? (
        <ProductChip product={entry.product} />
      ) : (
        entry.productLabel && (
          <p className="truncate rounded-[11px] border border-[#262626] bg-[#0e0e0e] px-3 py-2 text-[12.5px] font-semibold text-white">
            {entry.productLabel}
          </p>
        )
      )}
    </article>
  )
}

function MemberAuthor({ review, date }: { review: ProductReview; date: string }) {
  const author = authorFrom(review)
  return (
    <>
      <AuthorAvatarLink author={author} avatarUrl={review.author_avatar_url} size="sm" />
      <div className="min-w-0">
        <AuthorNameLink author={author} className="block truncate text-[13px]" />
        <p className="text-[10.5px] text-muted-foreground/70">{date}</p>
      </div>
    </>
  )
}

function ProductChip({ product }: { product: NonNullable<StoreReviewEntry["product"]> }) {
  const { icon: Icon, tint } = getCategoryIcon(product.category)
  return (
    <Link
      href={`/loja/${product.slug}`}
      className="mt-auto flex items-center gap-2.5 rounded-[11px] border border-[#262626] bg-[#0e0e0e] px-3 py-2.5 transition-colors hover:border-foreground/25"
    >
      {product.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={product.image} alt="" className="size-9 shrink-0 rounded-[8px] bg-[#171717] object-contain p-1" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-[#171717]">
          <Icon className="size-[18px] opacity-55" style={{ color: tint }} strokeWidth={1.6} />
        </span>
      )}
      <span className="min-w-0 truncate text-[12.5px] font-semibold text-white">{product.name}</span>
    </Link>
  )
}
