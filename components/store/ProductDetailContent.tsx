"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, CheckCircle2, Minus, Package, Plus, ShoppingCart, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/components/providers/cart-context"
import { featureLabel, isGoodFeature } from "@/lib/store-features"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { extractYoutubeVideoId } from "@/lib/youtube-url"
import type { StoreProductDetailResult } from "@/lib/server/repositories/store-repository"
import { WishlistButton } from "@/components/store/WishlistButton"
import { ProductReviews } from "@/components/store/ProductReviews"

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

export function ProductDetailContent({ product, linkedProduct, specs, variants }: StoreProductDetailResult) {
  const { add, setOpen } = useCart()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  const hasVariants = variants.length > 0
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(
    hasVariants ? (variants.find((v) => v.stock > 0)?.id ?? variants[0].id) : null
  )
  const activeVariant = hasVariants ? variants.find((v) => v.id === selectedVariantId) ?? null : null

  const effectivePriceCents = activeVariant?.price_cents_override ?? product.price_cents
  const effectiveStock = activeVariant ? activeVariant.stock : product.stock

  const outOfStock = effectiveStock === 0
  const images = product.images?.length > 0 ? product.images : [null]
  const [activeImage, setActiveImage] = useState(0)
  const backHref = product.type === "bazaar" ? "/loja?type=bazaar" : "/loja"
  const videoId = product.video_url ? extractYoutubeVideoId(product.video_url) : null

  function handleAddToCart() {
    if (outOfStock || (hasVariants && !activeVariant)) return
    for (let i = 0; i < qty; i++) {
      add({
        productId: product.id,
        variantId: activeVariant?.id ?? null,
        variantLabel: activeVariant?.label ?? null,
        slug: product.slug,
        name: product.name,
        priceCents: effectivePriceCents,
        image: product.images?.[0] ?? null,
        stock: effectiveStock,
        type: product.type,
        condition: product.condition,
      })
    }
    setAdded(true)
    setOpen(true)
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <Link
        href={backHref}
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar {product.type === "bazaar" ? "ao Bazar" : "à Loja"}
      </Link>

      <div className="grid gap-8 md:grid-cols-2">
        {/* Images */}
        <div className="space-y-3">
          <div className="aspect-square overflow-hidden rounded-2xl border border-border bg-muted">
            {images[activeImage] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={images[activeImage] as string}
                alt={product.name}
                className="h-full w-full object-contain p-6"
              />
            ) : (
              <div className="flex h-full items-center justify-center">
                <Package className="size-16 text-muted-foreground" />
              </div>
            )}
          </div>
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

          <p className="text-3xl font-black text-emerald-400">{formatBRL(effectivePriceCents)}</p>

          {product.description && (
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          )}

          {hasVariants && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">Variante</p>
              <div className="flex flex-wrap gap-2">
                {variants.map((v) => {
                  const isActive = v.id === selectedVariantId
                  const variantOutOfStock = v.stock === 0
                  return (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => {
                        setSelectedVariantId(v.id)
                        setQty(1)
                      }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors",
                        isActive
                          ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                          : "border-border text-muted-foreground hover:border-foreground/20",
                        variantOutOfStock && "opacity-50"
                      )}
                    >
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
              {effectiveStock <= 3 && (
                <p className="text-xs text-amber-400">Últimas {effectiveStock} unidades!</p>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1 rounded-lg border border-border">
                  <button
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <Minus className="size-3.5" />
                  </button>
                  <span className="w-8 text-center text-sm font-bold text-foreground">{qty}</span>
                  <button
                    onClick={() => setQty((q) => Math.min(effectiveStock, q + 1))}
                    className="flex size-9 items-center justify-center text-muted-foreground hover:text-foreground"
                  >
                    <Plus className="size-3.5" />
                  </button>
                </div>

                <Button
                  className="flex-1 basis-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500 sm:basis-0"
                  onClick={handleAddToCart}
                  disabled={hasVariants && !activeVariant}
                >
                  <ShoppingCart className="size-4" />
                  {added ? "Adicionado!" : "Adicionar ao carrinho"}
                </Button>
              </div>
            </div>
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
        </div>
      </div>

      {(product.features?.length > 0 || specs.length > 0 || videoId) && (
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

      {videoId && (
        <div className="mt-12">
          <h2 className="mb-4 text-lg font-black text-foreground">Vídeo de análise</h2>
          <div className="aspect-video overflow-hidden rounded-2xl border border-border">
            <iframe
              src={`https://www.youtube.com/embed/${videoId}`}
              title={`Vídeo de análise — ${product.name}`}
              className="h-full w-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      <ProductReviews productId={product.id} productSlug={product.slug} productType={product.type} />
    </div>
  )
}
