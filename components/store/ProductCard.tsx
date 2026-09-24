"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, PackageX } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"
import { formatBRL } from "@/lib/format"
import { markImageSettled } from "@/lib/image-settled"
import { computeCardPriceCents, computeEffectivePrice } from "@/lib/store-pricing"
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
  /** `showcase`: cartão grande e mais vistoso, para seções com poucos itens (Serviços). */
  variant?: "default" | "showcase"
}

export function ProductCard(props: ProductCardProps) {
  const showcase = props.variant === "showcase"
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

  // Mesma função usada pela página de produto e pelo checkout — o preço que
  // o card anuncia é, por construção, o preço que será cobrado.
  const {
    baseCents: basePriceCents,
    effectiveCents: effectivePriceCents,
    hasDiscount,
    discountPercent,
  } = computeEffectivePrice(props, activeVariant)

  const { icon: CategoryIcon, tint } = getCategoryIcon(props.category)
  const saleType = props.sale_type ?? "normal"
  const SaleTypeIcon = saleType !== "normal" ? SALE_TYPE_ICON[saleType] : null

  return (
    <Link href={href} className="group flex h-full flex-col">
      <div className={cn(
        "relative z-0 flex h-full flex-col overflow-hidden border bg-card transition-all duration-200",
        showcase
          ? "rounded-[26px] border-[#2c2c2c] bg-gradient-to-b from-[#1a1a1f] to-card hover:z-10 hover:-translate-y-1.5 hover:border-violet-400/40 hover:shadow-[0_22px_60px_-24px_rgba(167,139,250,0.5)]"
          : "rounded-[18px] border-[#262626] hover:z-10 hover:-translate-y-1 hover:border-[#3a3a3a] hover:shadow-xl hover:shadow-black/40"
      )}>
        {/* Imagem sem placa própria: o fundo é o do card, então a foto (quase
            sempre PNG recortado em fundo branco) não fica dentro de um
            retângulo cinza destacado. O respiro da cor da categoria só
            aparece no fallback sem imagem, logo abaixo. No `showcase` a arte
            (pôster quadrado) ganha moldura arredondada com margem do card. */}
        <div className={cn(
          "relative aspect-square overflow-hidden",
          showcase ? "m-3 mb-0 rounded-[18px] bg-[radial-gradient(75%_65%_at_50%_40%,rgba(167,139,250,0.18),#141414_78%)]" : "bg-transparent"
        )}>
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
                  "h-full w-full object-contain transition-[opacity,transform] duration-300 group-hover:scale-105",
                  !showcase && "p-4",
                  imageLoaded === image ? (outOfStock ? "opacity-45 grayscale" : "opacity-100") : "opacity-0"
                )}
              />
            </>
          ) : (
            <div
              className={cn("flex h-full items-center justify-center", outOfStock && "opacity-50 grayscale")}
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

          {/* Selo de desconto some quando esgotou, igual ao selo de pré-venda:
              debaixo do escurecido ele vira um vermelho sujo e disputa a
              atenção com a única informação que importa ali. O desconto
              continua dito pelo preço riscado, logo abaixo. */}
          {hasDiscount && !outOfStock && (
            <span className="absolute bottom-3 left-3 z-[1] rounded-lg bg-red-600 px-2 py-1 text-[11px] font-extrabold text-white">
              -{discountPercent}%
            </span>
          )}

          {/* Esgotado: a foto sai de cena (dessatura + escurece, logo acima) e a
              etiqueta fica em contraste cheio por cima. O card inteiro NÃO perde
              opacidade: era isso que deixava a própria etiqueta a 55% e o preço
              ilegível — a mensagem que mais precisa ser lida saía a mais fraca. */}
          {outOfStock && (
            <div className="absolute inset-0 z-[2] flex items-center justify-center bg-gradient-to-b from-black/25 via-black/45 to-black/65">
              <span className={cn(
                "flex items-center gap-1.5 rounded-full border border-white/25 bg-black/75 font-display font-bold uppercase text-white shadow-lg shadow-black/60 backdrop-blur-[2px]",
                showcase ? "gap-2 px-4 py-2 text-[12px] tracking-[0.2em]" : "px-3 py-1.5 text-[10.5px] tracking-[0.18em]"
              )}>
                <PackageX className={showcase ? "size-3.5" : "size-3"} strokeWidth={2.5} />
                Esgotado
              </span>
            </div>
          )}
        </div>

        {/* Info */}
        <div className={cn(
          "flex flex-1 flex-col",
          showcase ? "gap-2.5 px-5 pb-5 pt-4" : "gap-2 px-[15px] pb-4 pt-3.5",
          outOfStock && "opacity-70"
        )}>
          {/* Altura fixa mesmo sem categoria, pra não desalinhar o card com os vizinhos. */}
          <p className={cn(
            "font-bold uppercase text-[#7a7a7a]",
            showcase ? "text-[10.5px] tracking-[0.16em] text-violet-300/70" : "text-[9.5px] tracking-[0.14em]"
          )}>
            {getCategoryLabel(props.category) || " "}
          </p>
          {/* `font-sans tracking-normal` desfaz o reset global de h3 (Space
              Grotesk + tracking negativo): no mock o nome do produto é Manrope.
              `min-h` reserva 2 linhas sempre, pra não variar a altura entre nomes de 1 e 2 linhas. */}
          <h3 className={cn(
            "line-clamp-2 font-sans tracking-normal text-white",
            showcase
              ? "min-h-[52px] text-[19px] font-bold leading-[1.3]"
              : "min-h-[38px] text-[14.5px] font-semibold leading-[1.35]"
          )}>
            {props.name}
          </h3>

          {/* Slot de altura fixa: info do produto (condição/marca) — evita
              cards com heights diferentes no grid. As opções de variante (cor/versão)
              só aparecem na página do produto, não na listagem. */}
          <div className={cn(
            "flex h-5 flex-wrap items-center gap-[5px]",
            showcase && props.condition === "new" && !props.brand && "hidden"
          )}>
            <p className="line-clamp-1 text-[10.5px] font-medium text-[#7a7a7a]">
              {props.condition !== "new" ? CONDITION_LABEL[props.condition] : (props.brand ?? " ")}
            </p>
          </div>

          <div className={cn("mt-auto", showcase ? "pt-2 text-left" : "text-center")}>
            {hasDiscount && (
              <p className={cn("leading-tight text-[#6e6e6e] line-through", showcase ? "text-[12.5px]" : "text-[11px]")}>
                {formatBRL(basePriceCents)}
              </p>
            )}
            <div className={cn("flex flex-wrap items-baseline gap-2", showcase ? "justify-start" : "justify-center")}>
              <p className={cn(
                "font-display font-bold leading-tight",
                showcase ? "text-[32px]" : "text-xl",
                hasDiscount ? "text-emerald-400" : "text-white"
              )}>
                {formatBRL(effectivePriceCents)}
              </p>
              <span className={cn(
                "font-semibold uppercase tracking-wide text-emerald-400/80",
                showcase ? "text-[11px]" : "text-[9.5px]"
              )}>no PIX</span>
            </div>
            <p className={cn("text-[#7a7a7a]", showcase ? "text-[12px]" : "text-[10px]")}>
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

          {showcase && (
            <span className="mt-1 flex h-11 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] text-[13.5px] font-bold text-white transition-colors group-hover:border-transparent group-hover:bg-white group-hover:text-black">
              {outOfStock ? "Ver detalhes" : "Ver serviço"}
              <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          )}
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
