"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ArrowRight, CalendarDays, Package, Rocket } from "lucide-react"

import { useCart } from "@/components/providers/cart-context"
import { PreorderAvailability, PreorderStatusChip } from "@/components/store/PreorderLotPanel"
import { VariantPickerDialog } from "@/components/store/VariantPickerDialog"
import { RouteLink } from "@/components/ui/route-link"
import { formatBRL } from "@/lib/format"
import { getCategoryIcon } from "@/lib/store-category-icons"
import { formatPreorderShipDate, PREORDER_CTA_LABEL } from "@/lib/store-preorder"
import { cardActiveVariant, computeEffectivePrice, isSinglePriceProduct } from "@/lib/store-pricing"
import { cn } from "@/lib/utils"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

/**
 * Card de pré-venda da seção "Lançamentos e Pré-venda". Diferente do card de
 * produto de propósito: pré-venda é reserva de algo que ainda vai chegar, e a
 * pessoa precisa ver o lote, a previsão de envio e quanto sobra ANTES do
 * preço, não depois de abrir a página.
 *
 * O botão diz o que acontece ("Reservar na pré-venda", direto ao checkout,
 * como na página). Lote que não está aberto troca o botão por "Ver detalhes",
 * onde mora o "avise-me".
 */
export function PreorderCard(props: StoreProductCard) {
  const router = useRouter()
  const { add } = useCart()
  const [pickerOpen, setPickerOpen] = useState(false)
  const href = `/loja/${props.slug}`
  const preorder = props.preorder
  const status = preorder?.status ?? "open"
  const open = status === "open"
  const activeVariant = cardActiveVariant(props)
  const image = activeVariant?.image_url ?? props.images?.[0] ?? null
  const { effectiveCents, baseCents, hasDiscount } = computeEffectivePrice(props, activeVariant)
  const requiresChoice = props.variants.length > 1 || props.has_option_groups
  const { icon: CategoryIcon, tint } = getCategoryIcon(props.category)

  function handleReserve() {
    if (!open) return
    if (requiresChoice) {
      setPickerOpen(true)
      return
    }
    add({
      productId: props.id,
      variantId: activeVariant?.id ?? null,
      variantLabel: activeVariant?.label ?? null,
      variantColor: activeVariant?.color ?? null,
      variantIcon: activeVariant?.icon ?? null,
      variantOptions: [],
      slug: props.slug,
      name: props.name,
      priceCents: effectiveCents,
      image,
      stock: null,
      type: props.type,
      condition: props.condition,
      sale_type: props.sale_type,
      singlePrice: isSinglePriceProduct(props),
    })
    router.push("/checkout")
  }

  return (
    <article
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-[22px] border bg-gradient-to-b to-card transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1",
        open
          ? "border-amber-400/30 from-amber-400/[0.09] hover:border-amber-400/60 hover:shadow-[0_20px_50px_-24px_rgba(251,191,36,0.45)]"
          : "border-[#2a2a2a] from-white/[0.03] hover:border-white/20"
      )}
    >
      <Link href={href} className="relative block aspect-[4/3] overflow-hidden">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={props.name}
            loading="lazy"
            decoding="async"
            className={cn(
              "h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105",
              !open && "opacity-60 grayscale"
            )}
          />
        ) : (
          <div
            className="flex h-full items-center justify-center"
            style={{ background: `radial-gradient(120% 120% at 50% 15%, color-mix(in oklab, ${tint} 13%, #141414), #141414)` }}
          >
            <CategoryIcon className="size-24 opacity-50" style={{ color: tint }} strokeWidth={1.15} />
          </div>
        )}
        <PreorderStatusChip status={status} className="absolute left-3 top-3 shadow-md shadow-black/30 backdrop-blur-sm" />
      </Link>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-1">
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-amber-300/80">
            <Package className="size-3" strokeWidth={2.4} />
            <span className="truncate">{[preorder?.batchName ?? "Pré-venda", props.brand].filter(Boolean).join(" · ")}</span>
          </p>
          <h3 className="line-clamp-2 min-h-[40px] font-sans text-[15.5px] font-semibold leading-[1.3] tracking-normal text-white">
            <Link href={href} className="hover:underline">
              {props.name}
            </Link>
          </h3>
        </div>

        <div>
          {hasDiscount && <p className="text-[11px] leading-tight text-[#6e6e6e] line-through">{formatBRL(baseCents)}</p>}
          <p className="font-display text-[22px] font-bold leading-tight text-white">
            {formatBRL(effectiveCents)}
            {!isSinglePriceProduct(props) && <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">no PIX</span>}
          </p>
        </div>

        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5 shrink-0 text-amber-300" />
          {preorder?.shipsAt ? (
            <span>
              Previsão de envio: <span className="font-semibold text-foreground">{formatPreorderShipDate(preorder.shipsAt)}</span>
            </span>
          ) : (
            "Envio quando o lote chegar"
          )}
        </p>

        {preorder && <PreorderAvailability limit={preorder.limit} remaining={preorder.remaining} status={status} compact />}

        <div className="mt-auto pt-1">
          {open ? (
            <button
              type="button"
              onClick={handleReserve}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 text-[13.5px] font-bold text-[#1a1200] transition-[filter] hover:brightness-105"
            >
              <Rocket className="size-4" />
              {PREORDER_CTA_LABEL}
            </button>
          ) : (
            <RouteLink
              href={href}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ver detalhes
              <ArrowRight className="size-4" />
            </RouteLink>
          )}
        </div>
      </div>

      {requiresChoice && (
        <VariantPickerDialog
          slug={props.slug}
          name={props.name}
          category={props.category}
          fallbackImage={image}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
        />
      )}
    </article>
  )
}
