"use client"

import { useState } from "react"
import Link from "next/link"
import { Plus, ShoppingCart } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon } from "@/lib/store-category-icons"
import { getVariantIcon } from "@/lib/variant-icons"
import { formatBRL } from "@/lib/format"
import { useCart } from "@/components/providers/cart-context"
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
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  has_variants?: boolean
  variants?: StoreCardVariant[]
  sale_type?: "pre_order" | "ready_stock" | "normal"
}

export function ProductCard(props: ProductCardProps) {
  const { add, setOpen } = useCart()
  const href = `/${props.type === "bazaar" ? "bazar" : "loja"}/${props.slug}`
  const variants = props.variants ?? []
  const hasVariants = (props.has_variants ?? false) && variants.length > 0
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants ? (variants.find((v) => v.stock === null || v.stock > 0)?.id ?? variants[0].id) : null
  )
  const activeVariant = hasVariants ? variants.find((v) => v.id === selectedVariantId) ?? null : null
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

  function handleSelectVariant(e: React.MouseEvent, variantId: string) {
    e.preventDefault()
    setSelectedVariantId(variantId)
  }

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault()
    if (outOfStock) return
    if (hasVariants && !activeVariant) return
    add({
      productId: props.id,
      variantId: activeVariant?.id ?? null,
      variantLabel: activeVariant?.label ?? null,
      variantColor: activeVariant?.color ?? null,
      variantIcon: activeVariant?.icon ?? null,
      variantOptions: [],
      slug: props.slug,
      name: props.name,
      priceCents: effectivePriceCents,
      image,
      stock: activeVariant ? activeVariant.stock : props.stock,
      type: props.type,
      condition: props.condition,
      sale_type: saleType,
    })
    setOpen(true)
  }

  return (
    <Link href={href} className="group block">
      <div className={cn(
        "relative flex flex-col overflow-hidden rounded-[18px] border border-[#262626] bg-card transition-all duration-200",
        "hover:-translate-y-1 hover:border-[#3a3a3a] hover:shadow-xl hover:shadow-black/40",
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
                onLoad={() => setImageLoaded(image)}
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

          {!outOfStock && (
            <button
              type="button"
              onClick={handleAddToCart}
              aria-label="Adicionar ao carrinho"
              title="Adicionar ao carrinho"
              className="absolute right-2.5 top-2.5 z-[1] flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-[#2e2e2e] bg-[rgba(10,10,10,0.82)] text-[#999999] backdrop-blur-sm transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:text-emerald-400"
            >
              <span className="relative">
                <ShoppingCart className="size-[15px]" />
                <Plus className="absolute -right-[7px] -top-[7px] size-[10px] rounded-full bg-emerald-500 p-[1px] text-[#04140d]" strokeWidth={3} />
              </span>
            </button>
          )}

          {hasDiscount && (
            <span className="absolute bottom-3 left-3 z-[1] rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-extrabold text-[#04140d]">
              -{discountPercent}%
            </span>
          )}

          {/* Esgotado: escurece só a imagem — o card inteiro já perde opacidade
              acima, então aqui é só reforçar o texto sem duplicar o efeito. */}
          {outOfStock && (
            <div className="absolute inset-0 z-[1] flex items-center justify-center bg-black/55">
              <span className="font-display text-xs font-bold uppercase tracking-[0.1em] text-red-400">
                Esgotado
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-2 px-[15px] pb-4 pt-3.5">
          {props.category && (
            <p className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-[#7a7a7a]">{props.category}</p>
          )}
          {/* `font-sans tracking-normal` desfaz o reset global de h3 (Space
              Grotesk + tracking negativo): no mock o nome do produto é Manrope. */}
          <h3 className="line-clamp-2 font-sans text-[13.5px] font-semibold leading-[1.35] tracking-normal text-white">
            {props.name}
          </h3>

          {/* Slot de altura fixa: variantes quando existem, senão uma info do
              produto (condição/marca) — evita cards com heights diferentes no grid. */}
          <div className="flex h-5 flex-wrap items-center gap-[5px]" onClick={hasVariants ? (e) => e.stopPropagation() : undefined}>
            {hasVariants ? (
              variants.map((v) => {
                const isActive = v.id === selectedVariantId
                const variantOutOfStock = v.stock !== null && v.stock === 0
                const VariantIcon = getVariantIcon(v.icon)
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={(e) => handleSelectVariant(e, v.id)}
                    title={v.label}
                    aria-label={v.label}
                    aria-pressed={isActive}
                    disabled={variantOutOfStock}
                    className={cn(
                      "flex size-[20px] items-center justify-center rounded-full border-[1.5px] transition-colors",
                      isActive ? "border-emerald-500" : "border-[#333333] hover:border-[#5a5a5a]",
                      variantOutOfStock && "cursor-not-allowed opacity-35"
                    )}
                    style={{ backgroundColor: v.color ?? "#1c1c1c" }}
                  >
                    {VariantIcon && (
                      <VariantIcon className="size-[10px]" style={{ color: v.color ? "#fff" : "#9a9a9a" }} strokeWidth={2.2} />
                    )}
                  </button>
                )
              })
            ) : (
              <p className="line-clamp-1 text-[10.5px] font-medium text-[#7a7a7a]">
                {props.condition !== "new" ? CONDITION_LABEL[props.condition] : (props.brand ?? " ")}
              </p>
            )}
          </div>

          <div className="mt-auto">
            {hasDiscount ? (
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-display text-lg font-bold text-emerald-400">{formatBRL(effectivePriceCents)}</p>
                <p className="text-[11.5px] text-[#6e6e6e] line-through">{formatBRL(basePriceCents)}</p>
              </div>
            ) : (
              <p className="font-display text-lg font-bold text-white">{formatBRL(basePriceCents)}</p>
            )}
            {(() => {
              const displayStock = activeVariant ? activeVariant.stock : props.stock
              return displayStock !== null && displayStock > 0 && displayStock <= 3 && (
                <p className="mt-1 text-[10px] font-semibold text-amber-400">Últimas {displayStock} unidades!</p>
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
    <div className="flex flex-col overflow-hidden rounded-[18px] border border-[#262626] bg-card">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2 px-[15px] pb-4 pt-3.5">
        <Skeleton className="h-2.5 w-2/5" />
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="mt-auto h-5 w-1/2" />
      </div>
    </div>
  )
}
