"use client"

import { useState } from "react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"
import { formatBRL } from "@/lib/format"
import { markImageSettled } from "@/lib/image-settled"
import { computeCardPriceCents } from "@/lib/store-pricing"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { Skeleton } from "@/components/ui/skeleton"
import { SALE_TYPE_ICON, SALE_TYPE_LABEL } from "@/lib/store-sale-type"
import type { StoreCardVariant } from "@/lib/server/repositories/store-repository"

const CONDITION_LABEL: Record<"new" | "used" | "opened", string> = {
  new: "Novo",
  used: "Usado",
  opened: "Emb. aberta",
}

interface ProductCardProps {
  id: string
  slug: string
  name: string
  price_cents: number
  promo_price_cents?: number | null
  /** `null` = sem controle de estoque (nunca esgota). */
  stock: number | null
  /** Esgotado manualmente pelo admin — produto continua visível, mas não pode ser comprado. */
  is_sold_out?: boolean
  images: string[]
  category: string | null
  brand?: string | null
  type: "store"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  has_variants?: boolean
  variants?: StoreCardVariant[]
  sale_type?: "pre_order" | "ready_stock" | "normal"
}

export function ProductCard(props: ProductCardProps) {
  const { cardSurchargePercent, cardMaxInstallments } = useStoreSettings()
  const href = `/loja/${props.slug}`
  const variants = props.variants ?? []
  const hasVariants = (props.has_variants ?? false) && variants.length > 0
  const activeVariant = hasVariants
    ? variants.find((v) => v.stock === null || v.stock > 0) ?? variants[0]
    : null
  const [imageLoaded, setImageLoaded] = useState<string | null>(null)

  const outOfStock = hasVariants
    ? Boolean(props.is_sold_out) || (activeVariant ? activeVariant.stock !== null && activeVariant.stock === 0 : false)
    : Boolean(props.is_sold_out) || (props.stock !== null && props.stock === 0)
  const image = activeVariant?.image_url ?? props.images?.[0] ?? null

  const basePriceCents = activeVariant?.price_cents_override ?? props.price_cents
  const promoPriceCents = activeVariant
    ? (activeVariant.promo_price_cents ?? (activeVariant.price_cents_override == null ? props.promo_price_cents : null))
    : props.promo_price_cents
  const hasDiscount = promoPriceCents != null && promoPriceCents < basePriceCents
  const effectivePriceCents = hasDiscount ? (promoPriceCents as number) : basePriceCents
  const discountPercent = hasDiscount
    ? Math.round((1 - (promoPriceCents as number) / basePriceCents) * 100)
    : null

  const { icon: CategoryIcon, tint } = getCategoryIcon(props.category)
  const saleType = props.sale_type ?? "normal"
  const SaleTypeIcon = saleType !== "normal" ? SALE_TYPE_ICON[saleType] : null

  return (
    <Link href={href} className="group flex h-full flex-col">
      <div className={cn(
        "relative z-0 flex h-full flex-col overflow-hidden rounded-[18px] border border-[#262626] bg-card transition-all duration-200",
        "hover:z-10 hover:-translate-y-1 hover:border-[#3a3a3a] hover:shadow-xl hover:shadow-black/40",
        outOfStock && "opacity-55"
      )}>
        {/* Imagem: fundo #141414 com um respiro da cor da categoria no topo,
            como no mock — não o --card-image-bg genérico dos outros cards. */}
        <div className="relative aspect-square overflow-hidden bg-[#141414]">
          {image ? (
            <>
              {imageLoaded !== image && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="size-6 animate-spin rounded-full border-2 border-white/15 border-t-emerald-500" />
                </div>
              )}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={image}
                src={image}
                alt={props.name}
                ref={(el) => markImageSettled(el, () => setImageLoaded(image))}
                onLoad={() => setImageLoaded(image)}
                onError={() => setImageLoaded(image)}
                className={cn(
                  "h-full w-full object-contain p-4 transition-[opacity,transform] duration-300 group-hover:scale-105",
                  imageLoaded === image ? "opacity-100" : "opacity-0"
                )}
              />
            </>
          ) : (
            <div
              className="flex h-full items-center justify-center"
              style={{ background: `radial-gradient(120% 120% at 50% 15%, color-mix(in oklab, ${tint} 13%, #141414), #141414)` }}
            >
              <CategoryIcon
                className="size-[108px] opacity-50 transition-transform duration-300 group-hover:scale-105"
                style={{ color: tint }}
                strokeWidth={1.15}
              />
            </div>
          )}

          {SaleTypeIcon && !outOfStock && (
            <span
              className={cn(
                "absolute left-2.5 top-2.5 z-[1] flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold",
                saleType === "pre_order"
                  ? "bg-amber-500/90 text-[#1a1200]"
                  : "bg-emerald-500/90 text-[#04140d]"
              )}
            >
              <SaleTypeIcon className="size-2.5" strokeWidth={2.5} />
              {SALE_TYPE_LABEL[saleType]}
            </span>
          )}

          {hasDiscount && (
            <span className="absolute bottom-3 left-3 z-[1] rounded-lg bg-red-600 px-2 py-1 text-[11px] font-extrabold text-white">
              -{discountPercent}%
            </span>
          )}

          {/* Esgotado: escurece só a imagem — o card inteiro já perde opacidade
              acima, então aqui é só reforçar o texto sem duplicar o efeito. */}
          {outOfStock && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black/55">
              <span className="font-display text-xs font-bold uppercase tracking-[0.1em] text-white">
                Esgotado
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-2 px-[15px] pb-4 pt-3.5">
          {/* Altura fixa mesmo sem categoria, pra não desalinhar o card com os vizinhos. */}
          <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#7a7a7a]">
            {getCategoryLabel(props.category) || " "}
          </p>
          {/* `font-sans tracking-normal` desfaz o reset global de h3 (Space
              Grotesk + tracking negativo): no mock o nome do produto é Manrope.
              `min-h` reserva 2 linhas sempre, pra não variar a altura entre nomes de 1 e 2 linhas. */}
          <h3 className="line-clamp-2 min-h-[38px] font-sans text-[14.5px] font-semibold leading-[1.35] tracking-normal text-white">
            {props.name}
          </h3>

          {/* Slot de altura fixa: info do produto (condição/marca) — evita
              cards com heights diferentes no grid. As opções de variante (cor/versão)
              só aparecem na página do produto, não na listagem. */}
          <div className="flex h-5 flex-wrap items-center gap-[5px]">
            <p className="line-clamp-1 text-[10.5px] font-medium text-[#7a7a7a]">
              {props.condition !== "new" ? CONDITION_LABEL[props.condition] : (props.brand ?? " ")}
            </p>
          </div>

          <div className="mt-auto text-center">
            {hasDiscount && (
              <p className="text-[11px] leading-tight text-[#6e6e6e] line-through">{formatBRL(basePriceCents)}</p>
            )}
            <div className="flex flex-wrap items-baseline justify-center gap-2">
              <p className={cn(
                "font-display text-xl font-bold leading-tight",
                hasDiscount ? "text-emerald-400" : "text-white"
              )}>
                {formatBRL(effectivePriceCents)}
              </p>
              <span className="text-[9.5px] font-semibold uppercase tracking-wide text-emerald-400/80">à vista no PIX</span>
            </div>
            <p className="text-[10px] text-[#7a7a7a]">
              ou {formatBRL(computeCardPriceCents(effectivePriceCents, cardSurchargePercent))} no cartão
              {cardMaxInstallments > 1 && ` em até ${cardMaxInstallments}x sem juros`}
            </p>
            {(() => {
              const displayStock = activeVariant ? activeVariant.stock : props.stock
              const lowStock = displayStock !== null && displayStock > 0 && displayStock <= 3
              return (
                <p className="mt-1 h-[14px] text-[10px] font-semibold text-amber-400">
                  {lowStock ? `Últimas ${displayStock} unidades!` : ""}
                </p>
              )
            })()}
          </div>
        </div>
      </div>
    </Link>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-[18px] border border-[#262626] bg-card">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2 px-[15px] pb-4 pt-3.5">
        <Skeleton className="h-2.5 w-2/5" />
        <Skeleton className="h-[36px] w-4/5" />
        <Skeleton className="h-5 w-16" />
        <Skeleton className="mt-auto h-5 w-1/2" />
        <Skeleton className="h-3 w-2/5" />
      </div>
    </div>
  )
}
