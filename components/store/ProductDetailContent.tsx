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
  Package,
  Plus,
  ShoppingCart,
  Trophy,
  XCircle,
  Zap,
  ZoomIn,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { useCart } from "@/components/providers/cart-context"
import { featureLabel, isGoodFeature } from "@/lib/store-features"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { getVariantIcon } from "@/lib/variant-icons"
import type { LinkedPeripheralRef, StoreProductDetailResult } from "@/lib/server/repositories/store-repository"
import { WishlistButton } from "@/components/store/WishlistButton"
import { ProductReviews } from "@/components/store/ProductReviews"
import { FormattedText } from "@/components/ui/formatted-text"

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

export function ProductDetailContent({
  product,
  linkedProduct,
  linkedPeripheral,
  linkedPeripherals,
  specs,
  variants,
}: StoreProductDetailResult) {
  const router = useRouter()
  const { add, setOpen } = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const hasVariants = variants.length > 0
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants ? (variants.find((v) => v.stock === null || v.stock > 0)?.id ?? variants[0].id) : null
  )
  const activeVariant = hasVariants ? variants.find((v) => v.id === selectedVariantId) ?? null : null

  const baseEffectivePriceCents = activeVariant?.price_cents_override ?? product.price_cents
  const activePromoPriceCents =
    activeVariant?.promo_price_cents ??
    (activeVariant?.price_cents_override == null ? product.promo_price_cents : null)
  const hasDiscount = activePromoPriceCents != null && activePromoPriceCents < baseEffectivePriceCents
  const effectivePriceCents = hasDiscount ? (activePromoPriceCents as number) : baseEffectivePriceCents
  const discountPercent = hasDiscount
    ? Math.round((1 - (activePromoPriceCents as number) / baseEffectivePriceCents) * 100)
    : null
  const effectiveStock = activeVariant ? activeVariant.stock : product.stock

  const outOfStock = product.is_sold_out || (effectiveStock !== null && effectiveStock === 0)
  const baseImages: (string | null)[] = product.images?.length > 0 ? product.images : [null]
  const images =
    activeVariant?.image_url && !baseImages.includes(activeVariant.image_url)
      ? [activeVariant.image_url, ...baseImages]
      : baseImages
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
    for (let i = 0; i < qty; i++) {
      add({
        productId: product.id,
        variantId: activeVariant?.id ?? null,
        variantLabel: activeVariant?.label ?? null,
        variantColor: activeVariant?.color ?? null,
        variantIcon: activeVariant?.icon ?? null,
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href={backHref}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar à Loja
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Images */}
        <div className="space-y-3">
          <Dialog
            open={lightboxOpen}
            onOpenChange={(next) => {
              setLightboxOpen(next)
              if (!next) setZoomed(false)
            }}
          >
            <div className="group/zoom relative aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
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
                    className="h-full w-full object-contain p-6"
                  />
                  <span className="absolute right-3 top-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover/zoom:opacity-100">
                    <ZoomIn className="size-4" />
                  </span>
                </button>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Package className="size-16 text-muted-foreground" />
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
            <div className="flex gap-2">
              {images.map((img, idx) => (
                <button
                  key={idx}
                  onClick={() => setActiveImage(idx)}
                  className={cn(
                    "size-16 shrink-0 overflow-hidden rounded-lg border bg-muted",
                    idx === activeImage ? "border-emerald-500" : "border-border"
                  )}
                >
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="h-full w-full object-contain p-1" />
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="space-y-5">
          {product.type === "bazaar" && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-300">
              ♻️ Bazar
            </span>
          )}

          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-black tracking-tight text-foreground">{product.name}</h1>
              {product.category && (
                <p className="mt-1 text-sm capitalize text-muted-foreground">{product.category}</p>
              )}
            </div>
            <WishlistButton productId={product.id} />
          </div>

          {product.condition !== "new" && (
            <span
              className={cn(
                "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wide",
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

          {hasDiscount ? (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-3xl font-black text-emerald-400">{formatBRL(effectivePriceCents)}</p>
              <p className="text-base text-muted-foreground line-through">{formatBRL(baseEffectivePriceCents)}</p>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-bold text-emerald-400">
                -{discountPercent}%
              </span>
            </div>
          ) : (
            <p className="text-3xl font-black text-emerald-400">{formatBRL(effectivePriceCents)}</p>
          )}

          {hasVariants && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Variante</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const isActive = v.id === selectedVariantId
                  const variantOutOfStock = v.stock !== null && v.stock === 0
                  const VariantIcon = getVariantIcon(v.icon)
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => handleSelectVariant(v.id)}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        isActive
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-foreground/20",
                        variantOutOfStock && "opacity-50"
                      )}
                    >
                      {(v.color || VariantIcon) && (
                        <span
                          className="flex size-4 shrink-0 items-center justify-center rounded-full border border-black/10"
                          style={{ backgroundColor: v.color ?? "transparent" }}
                        >
                          {VariantIcon && (
                            <VariantIcon
                              className="size-2.5"
                              style={{ color: v.color ? "#fff" : undefined }}
                            />
                          )}
                        </span>
                      )}
                      {v.label}
                      {variantOutOfStock && " (esgotado)"}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {outOfStock ? (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400">
              Produto esgotado
            </div>
          ) : (
            <div className="space-y-3">
              {effectiveStock !== null && effectiveStock <= 3 && (
                <p className="text-xs text-amber-400">Últimas {effectiveStock} unidades!</p>
              )}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-border">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-foreground">{qty}</span>
                  <button
                    onClick={() => setQty((q) => (effectiveStock === null ? q + 1 : Math.min(effectiveStock, q + 1)))}
                    className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <Button
                  className="flex-1 gap-2"
                  variant="secondary"
                  onClick={handleAddToCart}
                  disabled={hasVariants && !activeVariant}
                >
                  <ShoppingCart className="size-4" />
                  {added ? "Adicionado!" : "Adicionar ao carrinho"}
                </Button>
                <Button
                  className="h-12 flex-1 gap-2 bg-orange-500 text-base font-bold text-white shadow-lg shadow-orange-500/20 hover:bg-orange-400 sm:flex-[1.3]"
                  onClick={handleBuyNow}
                  disabled={hasVariants && !activeVariant}
                >
                  <Zap className="size-5" />
                  Comprar Agora
                </Button>
              </div>
            </div>
          )}

          {product.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              <FormattedText text={product.description} />
            </p>
          )}

          {linkedProduct && (
            <Link
              href={`/${product.type === "bazaar" ? "loja" : "bazar"}/${linkedProduct.slug}`}
              className="block rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm transition-colors hover:border-foreground/20"
            >
              <span className="text-muted-foreground">
                {product.type === "bazaar" ? "Também disponível novo na Loja" : "Também disponível usado no Bazar"}
              </span>{" "}
              <span className="font-semibold text-foreground">— {formatBRL(linkedProduct.price_cents)}</span>
            </Link>
          )}

          {allLinkedPeripherals.length > 0 && (
            <div className="space-y-2">
              {allLinkedPeripherals.map((peripheral) => (
                <LinkedPeripheralCard key={peripheral.id} peripheral={peripheral} />
              ))}
            </div>
          )}
        </div>
      </div>

      {(product.features?.length > 0 || specs.length > 0) && (
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          {product.features?.length > 0 && (
            <div>
              <h2 className="mb-4 text-lg font-black text-foreground">Características</h2>
              <ul className="space-y-2.5">
                {product.features.map((feature, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-muted-foreground">
                    {isGoodFeature(feature) ? (
                      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    ) : (
                      <XCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
                    )}
                    <span>{featureLabel(feature)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {specs.length > 0 && (
            <div>
              <h2 className="mb-4 text-lg font-black text-foreground">Especificação Técnica</h2>
              <dl className="overflow-hidden rounded-xl border border-border">
                {specs.map((spec, idx) => (
                  <div
                    key={spec.id}
                    className={cn(
                      "grid grid-cols-2 gap-2 px-4 py-2.5 text-sm",
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
      )}

      <ProductReviews productId={product.id} productSlug={product.slug} productType={product.type} />
    </div>
  )
}
