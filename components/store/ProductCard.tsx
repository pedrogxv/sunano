"use client"

import Link from "next/link"
import { ShoppingCart, Recycle, Store } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon } from "@/lib/store-category-icons"
import { formatBRL } from "@/lib/format"
import { useCart } from "@/components/providers/cart-context"
import { Skeleton } from "@/components/ui/skeleton"

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
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  opened: "Emb. aberta",
  used: "Usado",
}

const CONDITION_STYLE: Record<string, string> = {
  new: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  opened: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  used: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

export function ProductCard(props: ProductCardProps) {
  const { add, setOpen } = useCart()
  const href = `/${props.type === "bazaar" ? "bazar" : "loja"}/${props.slug}`
  const outOfStock = Boolean(props.is_sold_out) || (props.stock !== null && props.stock === 0)
  const hasVariants = props.has_variants ?? false
  const image = props.images?.[0] ?? null
  const hasDiscount = props.promo_price_cents != null && props.promo_price_cents < props.price_cents
  const effectivePriceCents = hasDiscount ? (props.promo_price_cents as number) : props.price_cents
  const discountPercent = hasDiscount
    ? Math.round((1 - (props.promo_price_cents as number) / props.price_cents) * 100)
    : null

  const { icon: CategoryIcon, tint } = getCategoryIcon(props.category)

  function handleAddToCart(e: React.MouseEvent) {
    e.preventDefault()
    // Produto com variantes não tem variante selecionada aqui no card —
    // deixa o clique navegar normalmente pro Link e o usuário escolhe na
    // página de detalhe.
    if (hasVariants) return
    if (outOfStock) return
    add({
      productId: props.id,
      variantId: null,
      variantLabel: null,
      variantColor: null,
      variantIcon: null,
      slug: props.slug,
      name: props.name,
      priceCents: effectivePriceCents,
      image,
      stock: props.stock,
      type: props.type,
      condition: props.condition,
    })
    setOpen(true)
  }

  const accentText = props.type === "bazaar" ? "text-amber-400" : "text-sky-400"
  const TypeIcon = props.type === "bazaar" ? Recycle : Store

  return (
    <Link href={href} className="group block">
      <div className={cn(
        "relative flex flex-col overflow-hidden rounded-[18px] border border-border/60 bg-secondary/45 transition-all duration-200",
        "hover:-translate-y-1 hover:border-border hover:shadow-xl hover:shadow-black/10",
        outOfStock && "opacity-60"
      )}>
        {/* Out of stock overlay */}
        {outOfStock && (
          <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[18px] bg-black/50">
            <span className="rounded-full bg-red-500/20 px-3 py-1 text-xs font-bold text-red-400">
              Esgotado
            </span>
          </div>
        )}

        {/* Image */}
        <div className="relative aspect-square overflow-hidden bg-[var(--card-image-bg)]">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={props.name}
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              className="flex h-full items-center justify-center"
              style={{ background: `radial-gradient(120% 120% at 50% 20%, color-mix(in oklab, ${tint} 16%, var(--card-image-bg)), var(--card-image-bg))` }}
            >
              <CategoryIcon
                className="size-24 opacity-45 transition-transform duration-300 group-hover:scale-105"
                style={{ color: tint }}
                strokeWidth={1.3}
              />
            </div>
          )}

          {/* Top badge: condição, sobreposto na imagem */}
          <div className="absolute inset-x-2.5 top-2.5 z-[1] flex items-start justify-between">
            <span className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide backdrop-blur-sm",
              CONDITION_STYLE[props.condition]
            )}>
              <span className={cn(
                "size-1.5 rounded-full",
                props.condition === "new" && "bg-emerald-400",
                props.condition === "opened" && "bg-amber-400",
                props.condition === "used" && "bg-orange-400"
              )} />
              {CONDITION_LABEL[props.condition]}
            </span>
          </div>

          {hasDiscount && (
            <span className="absolute bottom-2.5 left-2.5 z-[1] rounded-lg bg-emerald-500 px-2 py-1 text-[11px] font-extrabold text-emerald-950">
              -{discountPercent}%
            </span>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-1 flex-col gap-2.5 p-4">
          <div>
            <h3 className={cn("flex items-start gap-1.5 line-clamp-2 text-xs font-extrabold uppercase tracking-wide leading-snug", accentText)}>
              <TypeIcon className="mt-0.5 size-3.5 shrink-0" />
              <span className="line-clamp-2 text-foreground/90 group-hover:text-foreground">{props.name}</span>
            </h3>
            {(props.brand || props.category) && (
              <p className="mt-1 text-[10px] capitalize text-muted-foreground">
                {[props.brand, props.category].filter(Boolean).join(" · ")}
              </p>
            )}
          </div>

          <div>
            {hasDiscount ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="font-display text-lg font-bold text-emerald-400">{formatBRL(effectivePriceCents)}</p>
                <p className="text-xs text-muted-foreground line-through">{formatBRL(props.price_cents)}</p>
              </div>
            ) : (
              <p className="font-display text-lg font-bold text-emerald-400">{formatBRL(props.price_cents)}</p>
            )}
            {props.stock !== null && props.stock > 0 && props.stock <= 3 && (
              <p className="text-[10px] font-semibold text-amber-400">Últimas {props.stock} unidades!</p>
            )}
          </div>

          <button
            onClick={handleAddToCart}
            disabled={outOfStock}
            className={cn(
              "mt-auto flex w-full items-center justify-center gap-1.5 rounded-[11px] border px-3 py-2.5 text-xs font-extrabold transition-all",
              "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
              "hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:shadow-md hover:shadow-emerald-500/10",
              outOfStock && "cursor-not-allowed opacity-50 hover:border-emerald-500/30 hover:bg-emerald-500/10 hover:shadow-none"
            )}
          >
            <ShoppingCart className="size-3.5" />
            {hasVariants ? "Ver opções" : "Comprar"}
          </button>
        </div>
      </div>
    </Link>
  )
}

export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-[18px] border border-border/60 bg-secondary/45">
      <Skeleton className="aspect-square w-full rounded-none" />
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3 w-4/5" />
          <Skeleton className="h-2.5 w-2/5" />
        </div>
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="mt-auto h-9 w-full rounded-[11px]" />
      </div>
    </div>
  )
}
