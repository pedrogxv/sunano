"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Minus,
  Plus,
  QrCode,
  ShieldCheck,
  ShoppingCart,
  Trophy,
  Zap,
  ZoomIn,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useCart } from "@/components/providers/cart-context"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { getVariantIcon } from "@/lib/variant-icons"
import { getCategoryIcon } from "@/lib/store-category-icons"
import type { LinkedPeripheralRef, StoreProductDetailResult, StoreProductVariantGroup, StoreFilterOptions, StoreProductCard } from "@/lib/server/repositories/store-repository"
import { ProductReviews } from "@/components/store/ProductReviews"
import { FormattedText } from "@/components/ui/formatted-text"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  opened: "Embalagem aberta",
  used: "Usado",
}

const CONDITION_STYLE: Record<string, string> = {
  new: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  opened: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  used: "bg-orange-500/15 text-orange-400 border-orange-500/30",
}

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
          Ver periférico no Ranking
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
  linkedProduct,
  linkedPeripheral,
  linkedPeripherals,
  specs,
  variants,
  variantGroups,
  filterOptions,
  previewPool,
}: ProductDetailContentProps) {
  const router = useRouter()
  const { add, setOpen } = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const hasVariants = variants.length > 0
  const isColorSoldOut = (v: { is_sold_out: boolean; stock: number | null }) =>
    v.is_sold_out || (v.stock !== null && v.stock === 0)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants ? (variants.find((v) => !isColorSoldOut(v))?.id ?? variants[0].id) : null
  )
  const activeVariant = hasVariants ? variants.find((v) => v.id === selectedVariantId) ?? null : null

  const isOptionSoldOut = (o: { is_sold_out: boolean }) => o.is_sold_out
  const [selectedOptionByGroup, setSelectedOptionByGroup] = useState<Record<string, string | null>>(() =>
    Object.fromEntries(
      variantGroups.map((g) => [g.id, g.options.find((o) => !isOptionSoldOut(o))?.id ?? g.options[0]?.id ?? null])
    )
  )

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
  const outOfStock =
    product.is_sold_out || (effectiveStock !== null && effectiveStock === 0) || hasUnselectableGroup
  const baseImages: (string | null)[] = product.images?.length > 0 ? product.images : [null]
  const variantImages = activeVariant
    ? [...(activeVariant.image_url ? [activeVariant.image_url] : []), ...activeVariant.images].filter(
        (url, idx, arr) => arr.indexOf(url) === idx
      )
    : []
  const images = variantImages.length > 0 ? variantImages : baseImages
  const [activeImage, setActiveImage] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  const [zoomed, setZoomed] = useState(false)
  const [loadedDialog, setLoadedDialog] = useState<number | null>(null)

  function handleSelectVariant(id: string) {
    setSelectedVariantId(id)
    setQty(1)
    setActiveImage(0)
  }

  function goToImage(delta: number, event?: React.MouseEvent) {
    event?.stopPropagation()
    setActiveImage((prev) => (prev + delta + images.length) % images.length)
    setZoomed(false)
  }
  const backHref = "/loja"

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
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-6 lg:py-16">
        <Link
          href={backHref}
          className="mb-7 flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Voltar à Loja
        </Link>

      <div className="grid gap-10 md:grid-cols-2 lg:gap-16">
        {/* Images */}
        <div className="space-y-4">
          <Dialog
            open={lightboxOpen}
            onOpenChange={(next) => {
              setLightboxOpen(next)
              if (!next) setZoomed(false)
            }}
          >
            <div className="group/zoom relative aspect-square overflow-hidden rounded-[24px] border border-border bg-[var(--card-image-bg)]">
              {images[activeImage] ? (
                <button
                  type="button"
                  onClick={() => setLightboxOpen(true)}
                  className="block h-full w-full cursor-zoom-in"
                  aria-label="Ampliar imagem"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={images[activeImage] as string}
                    alt={product.name}
                    className="h-full w-full object-contain p-8"
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
                <button
                  type="button"
                  onClick={() => setZoomed((z) => !z)}
                  className={cn(
                    "relative mx-auto h-[85vh] w-full overflow-hidden rounded-lg",
                    zoomed ? "cursor-zoom-out" : "cursor-zoom-in"
                  )}
                >
                  {images[activeImage] && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={images[activeImage] as string}
                      src={images[activeImage] as string}
                      alt={product.name}
                      onLoad={() => setLoadedDialog(activeImage)}
                      className={cn(
                        "h-full w-full object-contain transition-[opacity,transform] duration-200",
                        zoomed ? "scale-[2]" : "scale-100",
                        loadedDialog === activeImage ? "opacity-100" : "opacity-0"
                      )}
                    />
                  )}
                </button>

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
                    "size-[84px] shrink-0 overflow-hidden rounded-2xl border-[1.5px] bg-[var(--card-image-bg)]",
                    idx === activeImage ? "border-emerald-500" : "border-border"
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

          <div className="pt-2">
            <ProductReviews productId={product.id} productSlug={product.slug} productType={product.type} />
          </div>
        </div>

        {/* Info */}
        <div className="space-y-6 pt-1.5">
          {product.type === "bazaar" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300">
              ♻️ Bazar
            </span>
          )}

          <div>
            <h1 className="font-display text-[38px] font-bold leading-[1.05] tracking-tight text-foreground">{product.name}</h1>
            {product.category && (
              <p className="mt-2 text-[15px] capitalize text-muted-foreground">{product.category}</p>
            )}
          </div>

          {product.condition !== "new" && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide",
                CONDITION_STYLE[product.condition]
              )}
            >
              {CONDITION_LABEL[product.condition]}
            </span>
          )}

          {product.condition_notes && (
            <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
              {product.condition_notes}
            </p>
          )}

          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-6 py-5">
            {hasDiscount ? (
              <div className="flex flex-wrap items-baseline gap-3">
                <p className="font-display text-[42px] font-bold leading-none text-emerald-400">{formatBRL(effectivePriceCents)}</p>
                <p className="text-base text-muted-foreground line-through">{formatBRL(baseEffectivePriceCents)}</p>
                <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-400">
                  -{discountPercent}%
                </span>
              </div>
            ) : (
              <p className="font-display text-[42px] font-bold leading-none text-emerald-400">{formatBRL(effectivePriceCents)}</p>
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
                  const VariantIcon = getVariantIcon(v.icon)
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => !variantSoldOut && handleSelectVariant(v.id)}
                      disabled={variantSoldOut}
                      className={cn(
                        "flex items-center gap-2.5 rounded-xl border-[1.5px] px-4 py-3 text-sm font-semibold transition-colors",
                        isActive
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-foreground/20",
                        variantSoldOut && "cursor-not-allowed opacity-50 hover:border-border"
                      )}
                    >
                      {(v.color || VariantIcon) && (
                        <span
                          className="flex size-[18px] shrink-0 items-center justify-center rounded-full border border-black/10"
                          style={{ backgroundColor: v.color ?? "transparent" }}
                        >
                          {VariantIcon && (
                            <VariantIcon
                              className="size-3"
                              style={{ color: v.color ? "#fff" : undefined }}
                            />
                          )}
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
                  const optionSoldOut = isOptionSoldOut(option)
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => !optionSoldOut && handleSelectGroupOption(group, option.id)}
                      disabled={optionSoldOut}
                      className={cn(
                        "rounded-xl border-[1.5px] px-4 py-3 text-sm font-semibold transition-colors",
                        isActive
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-foreground/20",
                        optionSoldOut && "cursor-not-allowed opacity-50 hover:border-border"
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
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400">
              Produto esgotado
            </div>
          ) : (
            <div className="space-y-4">
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
                className="h-16 w-full gap-2 rounded-xl bg-orange-500 text-[18px] font-bold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-400"
                onClick={handleBuyNow}
                disabled={hasVariants && !activeVariant}
              >
                <Zap className="size-5" />
                Comprar Agora
              </Button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-5 pt-1">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <QrCode className="size-3.5 text-emerald-400" />
              Pagamento via PIX
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              Testado pelo Sunano
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              Compra acompanhada na sua conta
            </div>
          </div>

          {product.description && (
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-muted-foreground">
              <FormattedText text={product.description} />
            </p>
          )}

          {linkedProduct && (
            <Link
              href={`/${product.type === "bazaar" ? "loja" : "bazar"}/${linkedProduct.slug}`}
              className="block rounded-2xl border border-border bg-muted/20 px-5 py-4 text-sm transition-colors hover:border-foreground/20"
            >
              <span className="text-muted-foreground">
                {product.type === "bazaar" ? "Também disponível novo na Loja" : "Também disponível usado no Bazar"}
              </span>{" "}
              <span className="font-semibold text-foreground">— {formatBRL(linkedProduct.price_cents)}</span>
            </Link>
          )}
        </div>
      </div>

      {specs.length > 0 && (
        <div className="mt-20">
          <h2 className="font-display mb-5 text-2xl font-bold text-foreground">Especificação Técnica</h2>
          <dl className="overflow-hidden rounded-2xl border border-border md:max-w-xl">
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
    </>
  )
}
