"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { ExternalLink, Minus, Plus, Rocket, ShoppingCart, Trophy, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StarRating } from "@/components/ui/star-rating"
import { useCart } from "@/components/providers/cart-context"
import { formatBRL } from "@/lib/format"
import { computeItemCardPriceCents } from "@/lib/store-pricing"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { cn } from "@/lib/utils"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { getCategoryLabel } from "@/lib/store-category-icons"
import { LOW_STOCK_MAX_UNITS, STORE_CARD_BADGE } from "@/lib/store-card"
import { hasFreeShipping } from "@/lib/store-shipping"
import { PREORDER_CTA_LABEL, PREORDER_STATUS_HINT, PREORDER_STATUS_LABEL, preorderRemaining } from "@/lib/store-preorder"
import { purchaseAuraFor } from "@/lib/store-purchase-aura"
import { getColorSwatchStyle } from "@/lib/color-swatch"
import type { LinkedPeripheralRef, StoreProductDetailResult, StoreFilterOptions } from "@/lib/server/repositories/store-repository"
import { ProductReviews } from "@/components/store/ProductReviews"
import { RestockAlertButton } from "@/components/store/RestockAlertButton"
import { ProductDeliveryInfo } from "@/components/store/ProductDeliveryInfo"
import { ProductGallery } from "@/components/store/ProductGallery"
import { ProductPurchaseBenefits } from "@/components/store/ProductPurchaseBenefits"
import { PreorderLotPanel, PreorderStatusChip } from "@/components/store/PreorderLotPanel"
import { useProductSelection } from "@/components/store/use-product-selection"
import { FavoriteButton } from "@/components/store/FavoriteButton"
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

const CONDITION_LABEL: Record<"used" | "opened", string> = {
  used: "Usado",
  opened: "Embalagem aberta",
}

function chipClass(active: boolean, soldOut: boolean) {
  return cn(
    "flex items-center gap-2.5 rounded-xl border-[1.5px] px-4 py-2.5 text-sm font-semibold transition-colors",
    active
      ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
      : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
    soldOut && !active && "opacity-60"
  )
}

interface ProductDetailContentProps extends StoreProductDetailResult {
  filterOptions: StoreFilterOptions
  /** Nota das avaliações publicadas; `null` = ninguém avaliou ainda. */
  rating: { average: number; count: number } | null
}

export function ProductDetailContent({ filterOptions, rating, ...detail }: ProductDetailContentProps) {
  const { product, linkedPeripheral, linkedPeripherals, specs, variants, variantGroups } = detail
  const router = useRouter()
  const { add, setOpen } = useCart()
  const { cardSurchargePercent, cardMaxInstallments } = useStoreSettings()
  const [qty, setQty] = useState(1)
  const [added, setAdded] = useState(false)

  // Cor, opções, SKU, preço, estoque e foto da combinação escolhida: a mesma
  // resolução do checkout (lib/store-sku.ts). Trocar de Mini para Max muda
  // tudo isso aqui, sem recarregar.
  const pick = useProductSelection(detail)!
  const { selection, activeVariant, preorderStatus, singlePrice, canBuy } = pick

  const isPreOrder = product.sale_type === "pre_order"
  const preorder = product.preorder
  const { effectiveCents, baseCents, hasDiscount, discountPercent } = selection.price
  const cardPriceCents = computeItemCardPriceCents(effectiveCents, cardSurchargePercent, singlePrice)
  const pixDiscountPercent = singlePrice ? 0 : cardSurchargePercent
  const freeShipping = hasFreeShipping(product)

  // Teto da quantidade: o estoque da combinação, ou o que sobra no lote.
  const lotRemaining = preorder ? preorderRemaining(preorder) : null
  const maxQty = isPreOrder ? lotRemaining : selection.stock

  // Fotos: a da combinação primeiro, depois as da cor (ou as do produto, se a
  // cor não tem fotos próprias).
  const variantImages = activeVariant
    ? [...(activeVariant.image_url ? [activeVariant.image_url] : []), ...activeVariant.images]
    : []
  const images = [...new Set([...(selection.image ? [selection.image] : []), ...(variantImages.length > 0 ? variantImages : product.images)])]

  function resetQty() {
    setQty(1)
    setAdded(false)
  }

  function addCurrentToCart() {
    const item = pick.toCartItem()
    if (!item) return false
    for (let i = 0; i < qty; i++) add(item)
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

  // `linkedPeripheral` (FK única) e `linkedPeripherals` (M:N) podem apontar
  // pro mesmo periférico — mostra cada um só uma vez.
  const allLinkedPeripherals = linkedPeripheral
    ? [linkedPeripheral, ...linkedPeripherals.filter((p) => p.id !== linkedPeripheral.id)]
    : linkedPeripherals

  const stockLine =
    isPreOrder || selection.soldOut
      ? null
      : selection.stock === null
        ? { text: "Em estoque", tone: "text-emerald-400", dot: "bg-emerald-400" }
        : selection.stock <= LOW_STOCK_MAX_UNITS
          ? { text: `Últimas ${selection.stock} unidades`, tone: "text-amber-400", dot: "bg-amber-400" }
          : { text: `Em estoque: ${selection.stock} unidades`, tone: "text-emerald-400", dot: "bg-emerald-400" }

  // Por que não dá para comprar, na ordem em que a pessoa precisa saber.
  const unavailable = (() => {
    if (canBuy) return null
    if (product.is_sold_out) return { label: "Produto esgotado", restock: { variantId: null, variantLabel: null } }
    if (selection.soldOut || pick.hasUnselectableGroup) {
      const label = pick.versionLabel ? `"${pick.versionLabel}" esgotado` : "Produto esgotado"
      // O aviso de volta é por cor: é o nível em que `notify_restock` avisa
      // (inclusive quando a combinação esgotada volta).
      return {
        label,
        restock: pick.hasUnselectableGroup
          ? null
          : { variantId: activeVariant?.id ?? null, variantLabel: activeVariant?.label ?? null },
      }
    }
    if (preorderStatus && preorderStatus !== "open") {
      return {
        label: `${PREORDER_STATUS_LABEL[preorderStatus]}: ${PREORDER_STATUS_HINT[preorderStatus]}`,
        restock: { variantId: null, variantLabel: null },
      }
    }
    return { label: "Indisponível no momento", restock: null }
  })()

  const ratingAverage = rating
    ? rating.average.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })
    : null
  const LaunchIcon = STORE_CARD_BADGE.launch.icon

  return (
    <>
      <StoreCategoryNav data={filterOptions} activeCategory={product.category} />
      <div className="mx-auto max-w-7xl px-4 pb-12 pt-5 md:px-6 lg:pb-16">
        <ProductBreadcrumb productName={product.name} category={product.category} brand={product.brand} />

        <div className="grid gap-8 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:items-start lg:gap-12">
          {/* Galeria: presa no topo enquanto a coluna de compra rola. */}
          <div className="lg:sticky lg:top-24">
            <ProductGallery
              key={images[0] ?? "sem-foto"}
              images={images}
              videoUrl={product.video_url}
              productName={product.name}
              category={product.category}
            />
          </div>

          {/* Compra */}
          <div className="space-y-5">
            <div className="space-y-3">
              {(isPreOrder || product.is_launch || product.condition !== "new") && (
                <div className="flex flex-wrap items-center gap-2">
                  {preorderStatus && <PreorderStatusChip status={preorderStatus} />}
                  {product.is_launch && (
                    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", STORE_CARD_BADGE.launch.className)}>
                      <LaunchIcon className="size-3.5" strokeWidth={2.4} />
                      {STORE_CARD_BADGE.launch.label}
                    </span>
                  )}
                  {product.condition !== "new" && (
                    <span className="inline-flex items-center rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] font-bold text-amber-300">
                      {CONDITION_LABEL[product.condition]}
                    </span>
                  )}
                </div>
              )}

              <div>
                {(product.brand || product.category) && (
                  <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {[product.brand, getCategoryLabel(product.category)].filter(Boolean).join(" · ")}
                  </p>
                )}
                <div className="flex items-start justify-between gap-4">
                  <h1 className="font-display text-[30px] font-bold leading-[1.08] tracking-tight text-foreground sm:text-[36px]">
                    {product.name}
                  </h1>
                  <FavoriteButton productId={product.id} productName={product.name} variant="inline" className="mt-1 h-10" />
                </div>
              </div>

              {(pick.versionLabel || selection.skuCode) && (
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                  {pick.versionLabel && (
                    <span>
                      Versão: <span className="font-semibold text-foreground">{pick.versionLabel}</span>
                    </span>
                  )}
                  {selection.skuCode && (
                    <span className="font-mono text-xs tracking-wide text-muted-foreground/80">SKU {selection.skuCode}</span>
                  )}
                </p>
              )}

              <a href="#avaliacoes" className="flex w-fit items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground">
                {rating ? (
                  <>
                    <StarRating value={Math.round(rating.average * 2) / 2} size="sm" className="gap-px" />
                    <span className="font-bold text-foreground">{ratingAverage}</span>
                    <span>
                      ({rating.count} {rating.count === 1 ? "avaliação" : "avaliações"} de compradores)
                    </span>
                  </>
                ) : (
                  <>
                    <StarRating value={0} size="sm" className="gap-px opacity-40" />
                    <span>Ainda sem avaliações de compradores</span>
                  </>
                )}
              </a>
            </div>

            {product.condition_notes && (
              <p className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-muted-foreground">
                {product.condition_notes}
              </p>
            )}

            {/* Preço: o da combinação escolhida, igual ao que o checkout cobra. */}
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-4 sm:px-6 sm:py-5">
              {hasDiscount && (
                <p className="text-sm text-muted-foreground">
                  De <span className="line-through">{formatBRL(baseCents)}</span>
                </p>
              )}
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <p className="font-display text-[40px] font-bold leading-none text-emerald-400">{formatBRL(effectiveCents)}</p>
                {!singlePrice && <span className="text-sm font-semibold text-emerald-400/90">no PIX</span>}
                {hasDiscount && (
                  <span className="rounded-full bg-red-600 px-2.5 py-1 text-xs font-bold text-white">-{discountPercent}%</span>
                )}
              </div>
              {singlePrice ? (
                <p className="mt-2 text-sm text-muted-foreground">
                  Preço único: o mesmo no PIX e no cartão
                  {cardMaxInstallments > 1 && (
                    <>
                      , ou em até <span className="font-semibold text-foreground">{cardMaxInstallments}x de {formatBRL(Math.ceil(cardPriceCents / cardMaxInstallments))}</span>{" "}
                      sem juros
                    </>
                  )}
                </p>
              ) : (
                <>
                  {pixDiscountPercent > 0 && (
                    <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-400/80">
                      {pixDiscountPercent}% de desconto à vista no PIX
                    </p>
                  )}
                  <p className="mt-2 text-sm text-muted-foreground">
                    ou <span className="font-semibold text-foreground">{formatBRL(cardPriceCents)}</span> no cartão
                    {cardMaxInstallments > 1 && (
                      <>
                        {" "}
                        em até <span className="font-semibold text-foreground">{cardMaxInstallments}x de {formatBRL(Math.ceil(cardPriceCents / cardMaxInstallments))}</span>{" "}
                        sem juros
                      </>
                    )}
                  </p>
                </>
              )}
            </div>

            {preorder && preorderStatus && <PreorderLotPanel info={preorder} status={preorderStatus} />}

            {variants.length > 0 && (
              <div className="space-y-2.5">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Cor{activeVariant && <span className="ml-1.5 normal-case tracking-normal text-foreground">{activeVariant.label}</span>}
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {variants.map((variant) => {
                    const isActive = variant.id === activeVariant?.id
                    const soldOut = pick.variantChoice(variant).soldOut
                    return (
                      /* Esgotado continua clicável: selecionar troca fotos, preço
                         e SKU normalmente — só o bloco de compra vira "esgotado"
                         + "avise-me". Bloquear o clique escondia as fotos da cor. */
                      <button
                        key={variant.id}
                        type="button"
                        aria-pressed={isActive}
                        onClick={() => {
                          pick.selectVariant(variant.id)
                          resetQty()
                        }}
                        className={chipClass(isActive, soldOut)}
                      >
                        {(variant.color || variant.icon) && (
                          <span
                            className="flex size-[18px] shrink-0 items-center justify-center rounded-full"
                            style={getColorSwatchStyle(variant.color).style}
                          >
                            {variant.icon && <span className="text-[11px] leading-none">{variant.icon}</span>}
                          </span>
                        )}
                        <span className={cn(soldOut && "line-through")}>{variant.label}</span>
                        {soldOut && <span className="text-xs font-medium">(esgotado)</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {variantGroups.map((group) => {
              const activeOption = pick.selectedOptions.find((option) => group.options.some((o) => o.id === option.id))
              return (
                <div key={group.id} className="space-y-2.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    {group.name}
                    {activeOption && <span className="ml-1.5 normal-case tracking-normal text-foreground">{activeOption.label}</span>}
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {group.options.map((option) => {
                      const isActive = option.id === pick.selectedOptionByGroup[group.id]
                      const choice = pick.optionChoice(group, option)
                      // A diferença de preço da opção, para a pessoa saber o
                      // que muda ANTES de clicar.
                      const delta = choice.price.effectiveCents - effectiveCents
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() => {
                            pick.selectOption(group.id, option.id)
                            resetQty()
                          }}
                          className={chipClass(isActive, choice.soldOut)}
                        >
                          <span className={cn(choice.soldOut && "line-through")}>{option.label}</span>
                          {choice.soldOut ? (
                            <span className="text-xs font-medium">(esgotado)</span>
                          ) : (
                            !isActive &&
                            delta !== 0 && (
                              <span className="text-xs font-medium text-muted-foreground">
                                {delta > 0 ? "+" : "−"}
                                {formatBRL(Math.abs(delta))}
                              </span>
                            )
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )
            })}

            {stockLine && (
              <p className={cn("flex items-center gap-2 text-sm font-semibold", stockLine.tone)}>
                <span className={cn("size-2 shrink-0 rounded-full", stockLine.dot)} />
                {stockLine.text}
              </p>
            )}

            {unavailable ? (
              /* Esgotado (ou lote fechado) continua visível e navegável: a
                 seleção acima segue trocando fotos, preço e SKU normalmente;
                 só este bloco perde o botão de compra e ganha o "avise-me". */
              <div className="space-y-3">
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400">
                  {unavailable.label}
                </div>
                {unavailable.restock && (
                  <RestockAlertButton
                    productId={product.id}
                    variantId={unavailable.restock.variantId}
                    variantLabel={unavailable.restock.variantLabel}
                  />
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="flex shrink-0 items-center rounded-xl border border-border">
                    <button
                      type="button"
                      onClick={() => setQty((q) => Math.max(1, q - 1))}
                      aria-label="Diminuir quantidade"
                      className="flex size-[50px] items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-[38px] text-center text-[15px] font-bold tabular-nums text-foreground" aria-live="polite">
                      {qty}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty((q) => (maxQty === null ? q + 1 : Math.min(maxQty, q + 1)))}
                      aria-label="Aumentar quantidade"
                      className="flex size-[50px] items-center justify-center text-muted-foreground hover:text-foreground"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>

                  {/* Pré-venda é reserva direta: não passa pelo carrinho, então
                      o único botão diz exatamente o que acontece. */}
                  {isPreOrder ? (
                    <Button
                      className="h-[50px] flex-1 gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 text-[16px] font-bold text-[#1a1200] shadow-lg shadow-amber-500/20 hover:brightness-105"
                      onClick={handleBuyNow}
                    >
                      <Rocket className="size-[18px]" />
                      {PREORDER_CTA_LABEL}
                    </Button>
                  ) : (
                    <Button
                      className="h-[50px] flex-1 gap-2 rounded-xl bg-gradient-to-r from-[#7F77DD] to-[#D4537E] text-[16px] font-bold text-white shadow-lg shadow-[#D4537E]/20 hover:brightness-110"
                      onClick={handleBuyNow}
                    >
                      <Zap className="size-[18px]" />
                      Comprar agora
                    </Button>
                  )}
                </div>
                {!isPreOrder && (
                  <Button className="h-12 w-full gap-2 rounded-xl text-[15px] font-bold" variant="secondary" onClick={handleAddToCart}>
                    <ShoppingCart className="size-[18px]" />
                    {added ? "Adicionado!" : "Adicionar ao carrinho"}
                  </Button>
                )}
              </div>
            )}

            <ProductPurchaseBenefits
              freeShipping={freeShipping}
              singlePrice={singlePrice}
              pixDiscountPercent={pixDiscountPercent}
              maxInstallments={cardMaxInstallments}
              aura={purchaseAuraFor(effectiveCents * qty)}
            />

            {freeShipping && canBuy && <ProductDeliveryInfo preOrder={isPreOrder} />}

            {/* Só aparece para afiliado aprovado — para o resto, nada. */}
            <AffiliateShareButton className="w-full justify-center" />

            {allLinkedPeripherals.length > 0 && (
              <div className="space-y-2.5">
                {allLinkedPeripherals.map((peripheral) => (
                  <LinkedPeripheralCard key={peripheral.id} peripheral={peripheral} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Descrição, ficha e avaliações: depois da decisão de compra, em
            largura cheia, em vez de espremidos embaixo da galeria. */}
        <div className="mt-14 grid gap-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,1fr)] lg:gap-12">
          {product.description && (
            <section className="space-y-4">
              <h2 className="font-display text-2xl font-bold text-foreground">Descrição</h2>
              <div className="whitespace-pre-line text-[16px] leading-relaxed text-foreground/85">
                <FormattedText text={product.description} />
              </div>
            </section>
          )}

          {specs.length > 0 && (
            <section className={cn(!product.description && "lg:col-span-2")}>
              <h2 className="font-display mb-5 text-2xl font-bold text-foreground">Especificação Técnica</h2>
              <dl className="overflow-hidden rounded-2xl border border-border">
                {specs.map((spec, idx) => (
                  <div
                    key={spec.id}
                    className={cn("grid grid-cols-2 gap-2 px-5 py-3.5 text-[14.5px]", idx % 2 === 0 ? "bg-muted/20" : "bg-transparent")}
                  >
                    <dt className="text-muted-foreground">{spec.label}</dt>
                    <dd className="font-medium text-foreground">{spec.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>

        <section id="avaliacoes" className="mt-14 scroll-mt-24">
          <ProductReviews productId={product.id} productSlug={product.slug} productType={product.type} />
        </section>
      </div>
    </>
  )
}
