"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, ShoppingCart, SlidersHorizontal, Truck } from "lucide-react"

import { useCart } from "@/components/providers/cart-context"
import { SaleWindowCountdown } from "@/components/store/SaleWindowCountdown"
import { VariantPickerDialog } from "@/components/store/VariantPickerDialog"
import { RouteLink } from "@/components/ui/route-link"
import { formatBRL } from "@/lib/format"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { STORE_CARD_BADGE } from "@/lib/store-card"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"
import { cardActiveVariant, computeEffectivePrice, computeItemCardPriceCents, isCardSoldOut, isSinglePriceProduct } from "@/lib/store-pricing"
import { hasFreeShipping } from "@/lib/store-shipping"
import { cn } from "@/lib/utils"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

/**
 * Card de Lançamento: o mesmo desenho do `PreorderCard`, em violeta (a cor do
 * selo "Lançamento"), com a contagem do prazo. A diferença é a compra:
 * lançamento é produto em estoque, então o botão põe no carrinho (como o card
 * comum) em vez de ir direto ao checkout como a reserva.
 *
 * Esgotado sai de cena como na pré-venda: sem o brilho, foto cinza e o
 * carimbo no meio.
 */
export function LaunchCard(props: StoreProductCard) {
  const { add, setOpen: setCartOpen } = useCart()
  const { cardSurchargePercent, cardMaxInstallments } = useStoreSettings()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [justAdded, setJustAdded] = useState(false)
  const href = `/loja/${props.slug}`
  const soldOut = isCardSoldOut(props)
  const activeVariant = cardActiveVariant(props)
  const image = props.images?.[0] ?? activeVariant?.image_url ?? null
  const stock = activeVariant ? activeVariant.stock : props.stock
  const singlePrice = isSinglePriceProduct(props)
  const { effectiveCents, baseCents, hasDiscount, discountPercent } = computeEffectivePrice(props, activeVariant)
  const requiresChoice = props.variants.length > 1 || props.has_option_groups
  const { icon: CategoryIcon, tint } = getCategoryIcon(props.category)
  const { icon: LaunchIcon, label: launchLabel, className: launchChip } = STORE_CARD_BADGE.launch
  const eyebrow = [getCategoryLabel(props.category), props.brand].filter(Boolean).join(" · ")

  useEffect(() => {
    if (!justAdded) return
    const timer = setTimeout(() => setJustAdded(false), 1600)
    return () => clearTimeout(timer)
  }, [justAdded])

  function handleAdd() {
    if (soldOut) return
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
      stock,
      type: props.type,
      condition: props.condition,
      sale_type: props.sale_type,
      singlePrice,
    })
    setJustAdded(true)
    setCartOpen(true)
  }

  const ActionIcon = justAdded ? Check : requiresChoice ? SlidersHorizontal : ShoppingCart

  return (
    <article
      className={cn(
        "@container group relative flex h-full flex-col overflow-hidden rounded-[22px] border transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-1",
        soldOut ? "border-[#2a2a2a] bg-gradient-to-b from-white/[0.03] to-card grayscale hover:border-white/20" : "launch-violet-card"
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
              soldOut && "opacity-40 grayscale"
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
        {soldOut ? (
          <span className="absolute inset-0 flex items-center justify-center bg-neutral-900/35">
            <span className="-rotate-[14deg] rounded-md border-2 border-white/75 px-4 py-1 font-display text-[15px] font-extrabold uppercase tracking-[0.28em] text-white/85 outline outline-1 outline-offset-[3px] outline-white/40 @[15rem]:text-lg">
              Esgotado
            </span>
          </span>
        ) : (
          <>
            <span
              className={cn(
                "absolute left-3 top-3 flex max-w-[calc(100%-4rem)] items-center gap-1 rounded-lg px-2 py-1 text-[10.5px] font-bold shadow-md shadow-black/30",
                launchChip
              )}
            >
              <LaunchIcon className="size-3 shrink-0" strokeWidth={2.5} />
              <span className="truncate">{launchLabel}</span>
            </span>
            {hasDiscount && (
              <span className="absolute bottom-3 left-3 rounded-lg bg-red-600 px-2 py-1 text-[11px] font-extrabold text-white">
                -{discountPercent}%
              </span>
            )}
          </>
        )}
      </Link>

      <div className="flex flex-1 flex-col gap-3 px-4 pb-4 pt-1">
        <div className="space-y-1">
          <p className="truncate text-[10.5px] font-bold uppercase tracking-[0.14em] text-violet-300/80">{eyebrow || launchLabel}</p>
          <h3 className="line-clamp-2 min-h-[40px] font-sans text-[15.5px] font-semibold leading-[1.3] tracking-normal text-white">
            <Link href={href} className="hover:underline">
              {props.name}
            </Link>
          </h3>
        </div>

        {props.highlights.length > 0 && (
          <ul className="flex h-[22px] flex-wrap gap-1 overflow-hidden" aria-label="Características">
            {props.highlights.slice(0, 3).map((label) => (
              <li
                key={label}
                className="flex h-[22px] items-center whitespace-nowrap rounded-md border border-white/10 bg-white/[0.04] px-1.5 text-[10.5px] font-semibold text-[#cfcfcf]"
              >
                {label}
              </li>
            ))}
          </ul>
        )}

        <div>
          {hasDiscount && <p className="text-[11px] leading-tight text-[#6e6e6e] line-through">{formatBRL(baseCents)}</p>}
          <p className="font-display text-[22px] font-bold leading-tight text-white">
            {formatBRL(effectiveCents)}
            {singlePrice ? (
              <span aria-hidden="true">*</span>
            ) : (
              <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400/80">no PIX</span>
            )}
          </p>
          {!singlePrice && (
            <p className="text-[10px] text-[#7a7a7a]">
              ou {formatBRL(computeItemCardPriceCents(effectiveCents, cardSurchargePercent, false))} no cartão
              {cardMaxInstallments > 1 && ` em até ${cardMaxInstallments}x sem juros`}
            </p>
          )}
        </div>

        {hasFreeShipping(props) && (
          <span className="flex w-fit items-center gap-1.5 rounded-md bg-emerald-500/15 px-2 py-1 text-[12px] font-bold text-emerald-400">
            <Truck className="size-3.5" strokeWidth={2.4} />
            Frete grátis
          </span>
        )}

        {!soldOut && <SaleWindowCountdown saleWindow={props.sale_window} kind="launch" compact />}

        <div className="mt-auto pt-1">
          {soldOut ? (
            <RouteLink
              href={href}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-xl border border-white/15 text-[13.5px] font-semibold text-white transition-colors hover:bg-white/10"
            >
              Ver detalhes
              <ArrowRight className="size-4" />
            </RouteLink>
          ) : (
            <button
              type="button"
              onClick={handleAdd}
              className={cn(
                "flex h-10 w-full items-center justify-center gap-2 rounded-xl text-[13.5px] font-bold text-white transition-[filter,background-color]",
                justAdded ? "bg-emerald-500" : "bg-gradient-to-r from-violet-400 via-violet-500 to-fuchsia-600 hover:brightness-110"
              )}
            >
              <ActionIcon className="size-4 shrink-0" />
              {justAdded ? (
                "Adicionado"
              ) : requiresChoice ? (
                "Escolher opções"
              ) : (
                <>
                  {/* Na grade de 2 colunas do celular o card tem ~165px. */}
                  <span className="@[15rem]:hidden">Adicionar</span>
                  <span className="hidden @[15rem]:inline">Adicionar ao carrinho</span>
                </>
              )}
            </button>
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
