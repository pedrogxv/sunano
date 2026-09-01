"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Minus,
  Plus,
  Rocket,
  ShoppingCart,
  Trophy,
  Zap,
  ZoomIn,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { markImageSettled } from "@/lib/image-settled"
import { useCart } from "@/components/providers/cart-context"
import { formatBRL } from "@/lib/format"
import { computeCardPriceCents } from "@/lib/store-pricing"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { cn } from "@/lib/utils"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"
import { SALE_TYPE_ICON, SALE_TYPE_LABEL } from "@/lib/store-sale-type"
import { getColorSwatchStyle } from "@/lib/color-swatch"
import type { LinkedPeripheralRef, StoreProductDetailResult, StoreProductVariantGroup, StoreFilterOptions, StoreProductCard } from "@/lib/server/repositories/store-repository"
import { ProductReviews } from "@/components/store/ProductReviews"
import { RestockAlertButton } from "@/components/store/RestockAlertButton"
import { FormattedText } from "@/components/ui/formatted-text"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"
import { ProductBreadcrumb } from "@/components/store/ProductBreadcrumb"
import { AffiliateShareButton } from "@/components/affiliates/AffiliateShareButton"

function LinkedPeripheralCard({ peripheral }: { peripheral: LinkedPeripheralRef }) {
  return (
    <Link
      href={`/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}`}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm transition-colors hover:border-foreground/20"
    >
      <div>
        <p className="flex items-center gap-1.5 text-muted-foreground">
          Ver Detalhes técnicos e review do Periférico
          <ExternalLink className="size-3.5 shrink-0" />
        </p>
        <p className="font-semibold text-foreground">
          {peripheral.brand ? `${peripheral.brand} ` : ""}
          {peripheral.name}
        </p>
      </div>
      {peripheral.rank && (
        <span className="flex shrink-0 items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-primary">
          <Trophy className="size-3.5 shrink-0" />
          {`#${peripheral.rank.position} de ${peripheral.rank.total}`}
        </span>
      )}
    </Link>
  )
}

interface ProductDetailContentProps extends StoreProductDetailResult {
  filterOptions: StoreFilterOptions
  previewPool: StoreProductCard[]
}

export function ProductDetailContent({
  product,
  linkedPeripheral,
  linkedPeripherals,
  specs,
  variants,
  variantGroups,
  combinations,
  filterOptions,
  previewPool,
}: ProductDetailContentProps) {
  const router = useRouter()
  const { add, setOpen } = useCart()
  const { cardSurchargePercent, cardMaxInstallments } = useStoreSettings()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const hasVariants = variants.length > 0
  const isColorSoldOut = (v: { is_sold_out: boolean; stock: number | null }) =>
    v.is_sold_out || (v.stock !== null && v.stock === 0)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants ? (variants.find((v) => !isColorSoldOut(v))?.id ?? variants[0].id) : null
  )
  const activeVariant = hasVariants ? variants.find((v) => v.id === selectedVariantId) ?? null : null

  // Combinações Cor × Variante esgotadas — só relevante quando o produto tem
  // Cor E Variante juntos. Cada grupo de variante forma sua própria matriz
  // com a cor, então esse mesmo set serve pra qualquer grupo.
  const comboSet = useMemo(
    () => new Set(combinations.map((c) => `${c.variant_id}|${c.option_id}`)),
    [combinations]
  )
  const isOptionSoldOut = (o: { id: string; is_sold_out: boolean }, variant: { id: string } | null) =>
    o.is_sold_out || (variant != null && comboSet.has(`${variant.id}|${o.id}`))
  const [selectedOptionByGroup, setSelectedOptionByGroup] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      variantGroups.map((g) => [
        g.id,
        g.options.find((o) => !isOptionSoldOut(o, activeVariant))?.id ?? g.options[0]?.id ?? null,
      ])
    )
  )

  // Nada de trocar a opção sozinho ao mudar de cor: agora que esgotado é
  // selecionável, escolher uma cor cuja combinação está esgotada é um estado
  // válido — a página mostra o produto e oferece o "avise-me". O fallback
  // automático só existe na seleção inicial (useState acima), pra abrir a
  // página já em algo comprável quando isso for possível.

  function handleSelectGroupOption(group: StoreProductVariantGroup, optionId: string) {
    setSelectedOptionByGroup((prev) => ({ ...prev, [group.id]: optionId }))
    setQty(1)
  }

  // Overrides se acumulam nesta ordem, o último presente vence: preço base →
  // cor selecionada → cada grupo de variantes selecionado (na ordem em que
  // os grupos foram cadastrados). Promoção só se aplica quando nenhum desses
  // overrides foi usado — mesma regra que já existia pra cor, estendida.
  let baseEffectivePriceCents = activeVariant?.price_cents_override ?? product.price_cents
  const selectedOptions = variantGroups
    .map((g) => g.options.find((o) => o.id === selectedOptionByGroup[g.id]) ?? null)
    .filter((o): o is NonNullable<typeof o> => o !== null)
  let groupOverrideApplied = false
  for (const option of selectedOptions) {
    if (option.price_cents_override != null) {
      baseEffectivePriceCents = option.price_cents_override
      groupOverrideApplied = true
    }
  }

  const activePromoPriceCents = groupOverrideApplied
    ? null
    : activeVariant?.promo_price_cents ?? (activeVariant?.price_cents_override == null ? product.promo_price_cents : null)
  const hasDiscount = activePromoPriceCents != null && activePromoPriceCents < baseEffectivePriceCents
  const effectivePriceCents = hasDiscount ? (activePromoPriceCents as number) : baseEffectivePriceCents
  const discountPercent = hasDiscount
    ? Math.round((1 - (activePromoPriceCents as number) / baseEffectivePriceCents) * 100)
    : null
  const effectiveStock = activeVariant ? activeVariant.stock : product.stock

  const hasUnselectableGroup = variantGroups.some((g) => !selectedOptionByGroup[g.id])
  // Uma opção esgotada agora pode ficar selecionada (o usuário clicou nela de
  // propósito), então ela também precisa derrubar a compra — antes isso era
  // garantido pelo fallback automático, que não existe mais.
  const hasSoldOutOption = selectedOptions.some((o) => isOptionSoldOut(o, activeVariant))
  const outOfStock =
    product.is_sold_out ||
    (activeVariant ? isColorSoldOut(activeVariant) : effectiveStock !== null && effectiveStock === 0) ||
    hasSoldOutOption ||
    hasUnselectableGroup
  const baseImages: (string | null)[] = product.images?.length > 0 ? product.images : [null]
  function getVariantImages(variant: typeof activeVariant) {
    const variantImages = variant
      ? [...(variant.image_url ? [variant.image_url] : []), ...variant.images].filter(
          (url, idx, arr) => arr.indexOf(url) === idx
        )
      : []
    return variantImages.length > 0 ? variantImages : baseImages
  }
  const images = getVariantImages(activeVariant)
  const [activeImage, setActiveImage] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const dragState = useState<{ startX: number; startY: number; panX: number; panY: number; moved: boolean } | null>(
    null
  )
  const [drag, setDrag] = dragState
  const [loadedDialog, setLoadedDialog] = useState<number | null>(null)
  const [mainImageLoaded, setMainImageLoaded] = useState<string | null>(null)

  function handleSelectVariant(id: string) {
    const nextVariant = variants.find((v) => v.id === id) ?? null
    const nextImages = getVariantImages(nextVariant)
    setSelectedVariantId(id)
    setQty(1)
    setActiveImage((prev) => Math.min(prev, nextImages.length - 1))
  }

  function goToImage(delta: number, event?: React.MouseEvent) {
    event?.stopPropagation()
    setActiveImage((prev) => (prev + delta + images.length) % images.length)
    setZoomed(false)
    setPan({ x: 0, y: 0 })
  }

  const ZOOM_SCALE = 2.5
  const PAN_LIMIT = 220

  function clampPan(x: number, y: number) {
    return {
      x: Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, x)),
      y: Math.min(PAN_LIMIT, Math.max(-PAN_LIMIT, y)),
    }
  }

  function handleZoomPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!zoomed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y, moved: false })
  }

  function handleZoomPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!zoomed || !drag) return
    const dx = e.clientX - drag.startX
    const dy = e.clientY - drag.startY
    const next = clampPan(drag.panX + dx, drag.panY + dy)
    setPan(next)
    if (!drag.moved && Math.hypot(dx, dy) > 4) setDrag({ ...drag, moved: true })
  }

  function handleZoomPointerUp() {
    setDrag(null)
  }

  function toggleZoom() {
    if (drag?.moved) return
    setZoomed((z) => {
      if (z) setPan({ x: 0, y: 0 })
      return !z
    })
  }
  // `linkedPeripheral` (FK única) e `linkedPeripherals` (M:N) podem apontar
  // pro mesmo periférico — mostra cada um só uma vez.
  const allLinkedPeripherals = linkedPeripheral
    ? [linkedPeripheral, ...linkedPeripherals.filter((p) => p.id !== linkedPeripheral.id)]
    : linkedPeripherals

  function addCurrentToCart() {
    if (outOfStock || (hasVariants && !activeVariant)) return false
    const cartVariantOptions = selectedOptions.map((option) => {
      const group = variantGroups.find((g) => g.options.some((o) => o.id === option.id))!
      return { groupId: group.id, groupName: group.name, optionId: option.id, label: option.label }
    })
    for (let i = 0; i < qty; i++) {
      add({
        productId: product.id,
        variantId: activeVariant?.id ?? null,
        variantLabel: activeVariant?.label ?? null,
        variantColor: activeVariant?.color ?? null,
        variantIcon: activeVariant?.icon ?? null,
        variantOptions: cartVariantOptions,
        slug: product.slug,
        name: product.name,
        priceCents: effectivePriceCents,
        image: activeVariant?.image_url ?? product.images?.[0] ?? null,
        stock: effectiveStock,
        type: product.type,
        condition: product.condition,
        sale_type: product.sale_type,
      })
    }
    return true
  }

  function handleAddToCart() {
    if (!addCurrentToCart()) return
    setAdded(true)
    setOpen(true)
  }

  function handleBuyNow() {
    if (!addCurrentToCart()) return
    router.push("/checkout")
  }

  const { icon: CategoryIcon, tint: categoryTint } = getCategoryIcon(product.category)

  return (
    <>
      <StoreCategoryNav
        categories={filterOptions.categories}
        categoryCounts={filterOptions.categoryCounts}
        brandsByCategory={filterOptions.brandsByCategory}
        activeCategory={product.category}
        previewPool={previewPool}
      />
      <div className="mx-auto max-w-7xl px-4 pb-12 md:px-6 lg:pb-16 pt-5">
      <ProductBreadcrumb
        productName={product.name}
        category={product.category}
        brand={product.brand}
      />
      <div className="flex flex-col gap-10 md:flex-row md:items-start lg:gap-16">
        {/* Images */}
        <div className="space-y-4 md:w-1/2">
          <Dialog
            open={lightboxOpen}
            onOpenChange={(next) => {
              setLightboxOpen(next)
              if (!next) {
                setZoomed(false)
                setPan({ x: 0, y: 0 })
              }
            }}
          >
            <div className="group/zoom relative aspect-square overflow-hidden rounded-[24px] border border-border/40 bg-transparent">
              {images[activeImage] ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="block h-full w-full cursor-zoom-in"
                  aria-label="Ampliar imagem"
                >
                  {mainImageLoaded !== images[activeImage] && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-emerald-500" />
                    </div>
                  )}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    key={images[activeImage] as string}
                    src={images[activeImage] as string}
                    alt={product.name}
                    ref={(el) => markImageSettled(el, () => setMainImageLoaded(images[activeImage] as string))}
                    onLoad={() => setMainImageLoaded(images[activeImage] as string)}
                    onError={() => setMainImageLoaded(images[activeImage] as string)}
                    className={cn(
                      "h-full w-full object-contain p-8 transition-opacity duration-150",
                      mainImageLoaded === images[activeImage] ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/zoom:opacity-100">
                    <ZoomIn className="size-5" />
                  </span>
                </button>
              ) : (
                <div
                  className="flex h-full items-center justify-center"
                  style={{ background: `radial-gradient(90% 90% at 50% 30%, color-mix(in oklab, ${categoryTint} 14%, var(--card-image-bg)), var(--card-image-bg))` }}
                >
                  <CategoryIcon className="size-44 opacity-40" style={{ color: categoryTint }} strokeWidth={1.1} />
                </div>
              )}
            </div>

            <DialogContent
              showCloseButton
              className="flex max-w-4xl items-center justify-center overflow-hidden border-none bg-transparent p-0 shadow-none ring-0 sm:max-w-4xl"
            >
              <DialogTitle className="sr-only">{product.name}</DialogTitle>
              <div className="relative w-full">
                <div
                  onPointerDown={handleZoomPointerDown}
                  onPointerMove={handleZoomPointerMove}
                  onPointerUp={handleZoomPointerUp}
                  onPointerLeave={handleZoomPointerUp}
                  onDoubleClick={toggleZoom}
                  className={cn(
                    "relative mx-auto h-[85vh] w-full touch-none overflow-hidden rounded-lg select-none",
                    zoomed ? (drag ? "cursor-grabbing" : "cursor-grab") : "cursor-zoom-in"
                  )}
                >
                  {images[activeImage] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={images[activeImage] as string}
                      src={images[activeImage] as string}
                      alt={product.name}
                      draggable={false}
                      onClick={toggleZoom}
                      ref={(el) => markImageSettled(el, () => setLoadedDialog(activeImage))}
                      onLoad={() => setLoadedDialog(activeImage)}
                      onError={() => setLoadedDialog(activeImage)}
                      className={cn(
                        "h-full w-full object-contain",
                        !drag && "transition-[opacity,transform] duration-200",
                        loadedDialog === activeImage ? "opacity-100" : "opacity-0"
                      )}
                      style={{
                        transform: zoomed
                          ? `scale(${ZOOM_SCALE}) translate(${pan.x / ZOOM_SCALE}px, ${pan.y / ZOOM_SCALE}px)`
                          : "scale(1)",
                      }}
                    />
                  )}
                  {!zoomed && (
                    <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur-sm">
                      Clique para ampliar
                    </span>
                  )}
                </div>

                {images.length > 1 && (
                  <>
                    <button
                      type="button"
                      onClick={(e) => goToImage(-1, e)}
                      className="absolute left-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                      aria-label="Imagem anterior"
                    >
                      <ChevronLeft className="size-6" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => goToImage(1, e)}
                      className="absolute right-3 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                      aria-label="Próxima imagem"
                    >
                      <ChevronRight className="size-6" />
                    </button>
                    <span className="absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 backdrop-blur-sm">
                      {images.map((img, i) => (
                        <span
                          key={img ?? i}
                          className={cn(
                            "size-1.5 rounded-full transition-colors",
                            i === activeImage ? "bg-white" : "bg-white/40"
                          )}
                        />
                      ))}
                    </span>
                  </>
                )}
              </div>
            </DialogContent>
          </Dialog>
          {images.length > 1 && (
            <div className="flex gap-3">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(idx)}
                  className={cn(
                    "size-[84px] shrink-0 overflow-hidden rounded-2xl border-[1.5px] bg-transparent",
                    idx === activeImage ? "border-emerald-500" : "border-border/60"
                  )}
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="h-full w-full object-contain p-1.5" />
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <CategoryIcon className="size-8 opacity-40" style={{ color: categoryTint }} strokeWidth={1.2} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="hidden space-y-10 md:block">
            <ProductReviews productId={product.id} productSlug={product.slug} productType={product.type} />

            {specs.length > 0 && (
              <div>
                <h2 className="font-display mb-5 text-2xl font-bold text-foreground">Especificação Técnica</h2>
                <dl className="overflow-hidden rounded-2xl border border-border">
                  {specs.map((spec, idx) => (
                    <div
                      key={spec.id}
                      className={cn(
                        "grid grid-cols-2 gap-2 px-5 py-3.5 text-[14.5px]",
                        idx % 2 === 0 ? "bg-muted/20" : "bg-transparent"
                      )}
                    >
                      <dt className="text-muted-foreground">{spec.label}</dt>
                      <dd className="font-medium text-foreground">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="space-y-6 pt-1.5 md:w-1/2">
          <div>
            {product.sale_type !== "normal" && (() => {
              const SaleTypeIcon = SALE_TYPE_ICON[product.sale_type]
              return (
                <span
                  className={cn(
                    "mb-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold",
                    product.sale_type === "pre_order"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-emerald-500/15 text-emerald-400"
                  )}
                >
                  <SaleTypeIcon className="size-3.5" strokeWidth={2.5} />
                  {SALE_TYPE_LABEL[product.sale_type]}
                </span>
              )
            })()}
            <h1 className="font-display text-[38px] font-bold leading-[1.05] tracking-tight text-foreground">{product.name}</h1>
            {product.category && (
              <p className="mt-2 text-[15px] text-muted-foreground">{getCategoryLabel(product.category)}</p>
            )}
          </div>

          {product.condition_notes && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
              {product.condition_notes}
            </p>
          )}

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-6 py-5">
            {hasDiscount && (
              <p className="text-base text-muted-foreground line-through">{formatBRL(baseEffectivePriceCents)}</p>
            )}
            <div className="flex flex-wrap items-baseline gap-3">
              <p className="font-display text-[42px] font-bold leading-none text-emerald-400">{formatBRL(effectivePriceCents)}</p>
              {hasDiscount && (
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
                  -{discountPercent}%
                </span>
              )}
            </div>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
              {cardSurchargePercent}% de desconto à vista no PIX
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              ou {formatBRL(computeCardPriceCents(effectivePriceCents, cardSurchargePercent))} no cartão de crédito
            </p>
            {cardMaxInstallments > 1 && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                em até {cardMaxInstallments}x sem juros de{" "}
                {formatBRL(Math.ceil(computeCardPriceCents(effectivePriceCents, cardSurchargePercent) / cardMaxInstallments))}
              </p>
            )}
          </div>

          {allLinkedPeripherals.length > 0 && (
            <div className="space-y-2.5">
              {allLinkedPeripherals.map((peripheral) => (
                <LinkedPeripheralCard key={peripheral.id} peripheral={peripheral} />
              ))}
            </div>
          )}

          {hasVariants && (
            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cor</p>
              <div className="flex flex-wrap gap-2.5">
                {variants.map((v) => {
                  const isActive = v.id === selectedVariantId
                  const variantSoldOut = isColorSoldOut(v)
                  return (
                    /* Esgotado continua clicável: selecionar troca fotos, preço
                       e specs normalmente — só o bloco de compra vira "esgotado"
                       + "avise-me". Bloquear o clique escondia as fotos da cor. */
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVariant(v.id)}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border-[1.5px] px-4 py-3 text-sm font-semibold transition-colors",
                        isActive
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-foreground/20",
                        variantSoldOut && !isActive && "opacity-60"
                      )}
                    >
                      {(v.color || v.icon) && (
                        <span
                          className="flex size-[18px] shrink-0 items-center justify-center rounded-full"
                          style={getColorSwatchStyle(v.color).style}
                        >
                          {v.icon && <span className="text-[11px] leading-none">{v.icon}</span>}
                        </span>
                      )}
                      <span className={cn(variantSoldOut && "line-through")}>{v.label}</span>
                      {variantSoldOut && " (esgotado)"}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {variantGroups.map((group) => (
            <div key={group.id} className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.name}</p>
              <div className="flex flex-wrap gap-2.5">
                {group.options.map((option) => {
                  const isActive = option.id === selectedOptionByGroup[group.id]
                  const optionSoldOut = isOptionSoldOut(option, activeVariant)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => handleSelectGroupOption(group, option.id)}
                      className={cn(
                        "rounded-xl border-[1.5px] px-4 py-3 text-sm font-semibold transition-colors",
                        isActive
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-foreground/20",
                        optionSoldOut && !isActive && "opacity-60"
                      )}
                    >
                      <span className={cn(optionSoldOut && "line-through")}>{option.label}</span>
                      {optionSoldOut && " (esgotado)"}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}

          {outOfStock ? (
            /* Esgotado continua visível e navegável — a seleção acima segue
               trocando fotos, preço e specs normalmente; só este bloco perde o
               botão de compra e ganha o "avise-me". A inscrição mira o que
               está esgotado: o produto inteiro (variantId null) ou a cor
               selecionada. */
            (() => {
              // Produto inteiro esgotado tem precedência: nem adianta assinar
              // uma cor se nada do produto está à venda.
              const productLevel = product.is_sold_out || !activeVariant
              const soldOutOption = selectedOptions.find((o) => isOptionSoldOut(o, activeVariant))
              const label = productLevel
                ? "Produto esgotado"
                : isColorSoldOut(activeVariant)
                  ? `Cor "${activeVariant.label}" esgotada`
                  : soldOutOption
                    ? `"${activeVariant.label}" com "${soldOutOption.label}" esgotado`
                    : "Produto esgotado"
              return (
                <div className="space-y-3">
                  <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400">
                    {label}
                  </div>
                  {!hasUnselectableGroup && (
                    <RestockAlertButton
                      productId={product.id}
                      variantId={productLevel ? null : activeVariant.id}
                      variantLabel={productLevel ? null : activeVariant.label}
                    />
                  )}
                </div>
              )
            })()
          ) : (
            <div className="space-y-4">
              {product.sale_type === "pre_order" && (
                <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-400">
                  <Rocket className="mt-0.5 size-4 shrink-0" />
                  <p>
                    <span className="font-bold">Produto em pré-venda:</span> Seja um dos primeiros no Brasil a ter
                    esse produto, alguns lançamentos são limitados então garanta já o seu!!!
                  </p>
                </div>
              )}
              {effectiveStock !== null && effectiveStock <= 3 && (
                <p className="text-sm font-semibold text-amber-400">Últimas {effectiveStock} unidades!</p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex shrink-0 items-center rounded-xl border border-border">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex size-[46px] items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-[42px] text-center text-[15px] font-bold text-foreground">{qty}</span>
                  <button
                    onClick={() => setQty((q) => (effectiveStock === null ? q + 1 : Math.min(effectiveStock, q + 1)))}
                    className="flex size-[46px] items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <Button
                  className="h-[46px] flex-1 gap-2 rounded-xl text-[15px] font-bold"
                  variant="secondary"
                  onClick={handleAddToCart}
                  disabled={hasVariants && !activeVariant}
                >
                  <ShoppingCart className="size-[18px]" />
                  {added ? "Adicionado!" : "Adicionar ao carrinho"}
                </Button>
              </div>
              <Button
                className="h-16 w-full gap-2 rounded-xl bg-gradient-to-r from-[#7F77DD] to-[#D4537E] text-[18px] font-bold text-white shadow-lg shadow-[#D4537E]/20 hover:brightness-110"
                onClick={handleBuyNow}
                disabled={hasVariants && !activeVariant}
              >
                <Zap className="size-5" />
                {product.sale_type === "pre_order" ? "Reservar Agora" : "Comprar Agora"}
              </Button>
              {/* Só aparece para afiliado aprovado — para o resto, nada. */}
              <AffiliateShareButton className="w-full justify-center" />
            </div>
          )}

          {product.description && (
            <div className="whitespace-pre-line text-[16.5px] leading-relaxed text-foreground/85">
              <FormattedText text={product.description} />
            </div>
          )}

          <div className="space-y-10 md:hidden">
            <ProductReviews productId={product.id} productSlug={product.slug} productType={product.type} />

            {specs.length > 0 && (
              <div>
                <h2 className="font-display mb-5 text-2xl font-bold text-foreground">Especificação Técnica</h2>
                <dl className="overflow-hidden rounded-2xl border border-border">
                  {specs.map((spec, idx) => (
                    <div
                      key={spec.id}
                      className={cn(
                        "grid grid-cols-2 gap-2 px-5 py-3.5 text-[14.5px]",
                        idx % 2 === 0 ? "bg-muted/20" : "bg-transparent"
                      )}
                    >
                      <dt className="text-muted-foreground">{spec.label}</dt>
                      <dd className="font-medium text-foreground">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>
      </div>
      </div>
    </>
  )
}
