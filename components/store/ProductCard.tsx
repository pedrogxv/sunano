"use client"

import Link from "next/link"
import { ShoppingCart } from "lucide-react"
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

/**
 * Tint por estado, na mesma linguagem oklch dos ícones de categoria — o
 * badge do mock é montado por color-mix a partir de uma cor só (borda 32%,
 * fundo 14% sobre preto), não por três utilitários de cor distintos.
 */
const CONDITION_TINT: Record<string, string> = {
  new: "oklch(0.7 0.15 160)",
  opened: "oklch(0.8 0.15 85)",
  used: "oklch(0.7 0.18 45)",
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

  const conditionTint = CONDITION_TINT[props.condition]

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
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image}
              alt={props.name}
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
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

          {/* Badge de estado — 12px do canto, contra os 10px do botão de
              carrinho: é assim que o mock desalinha os dois de propósito. */}
          <span
            className="absolute left-3 top-3 z-[1] inline-flex items-center gap-[5px] rounded-full border px-[9px] py-[3px] text-[9px] font-bold uppercase tracking-[0.06em]"
            style={{
              borderColor: `color-mix(in oklab, ${conditionTint} 32%, transparent)`,
              background: `color-mix(in oklab, ${conditionTint} 14%, #000)`,
              color: conditionTint,
            }}
          >
            <span className="size-[5px] rounded-full" style={{ background: conditionTint }} />
            {CONDITION_LABEL[props.condition]}
          </span>

          {!outOfStock && (
            <button
              type="button"
              onClick={handleAddToCart}
              aria-label={hasVariants ? "Ver opções" : "Adicionar ao carrinho"}
              title={hasVariants ? "Ver opções" : "Adicionar ao carrinho"}
              className="absolute right-2.5 top-2.5 z-[1] flex size-[34px] shrink-0 items-center justify-center rounded-[10px] border border-[#2e2e2e] bg-[rgba(10,10,10,0.82)] text-[#999999] backdrop-blur-sm transition-colors hover:border-emerald-500/50 hover:bg-emerald-500/20 hover:text-emerald-400"
            >
              <ShoppingCart className="size-[15px]" />
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

          <div className="mt-auto">
            {hasDiscount ? (
              <div className="flex flex-wrap items-baseline gap-2">
                <p className="font-display text-lg font-bold text-emerald-400">{formatBRL(effectivePriceCents)}</p>
                <p className="text-[11.5px] text-[#6e6e6e] line-through">{formatBRL(props.price_cents)}</p>
              </div>
            ) : (
              <p className="font-display text-lg font-bold text-white">{formatBRL(props.price_cents)}</p>
            )}
            {props.stock !== null && props.stock > 0 && props.stock <= 3 && (
              <p className="mt-1 text-[10px] font-semibold text-amber-400">Últimas {props.stock} unidades!</p>
            )}
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
