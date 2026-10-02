"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { Loader2, Rocket, ShoppingCart } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { getCategoryIcon } from "@/lib/store-category-icons"
import { getColorSwatchStyle } from "@/lib/color-swatch"
import { LOW_STOCK_MAX_UNITS } from "@/lib/store-card"
import { PREORDER_CTA_LABEL, PREORDER_STATUS_LABEL } from "@/lib/store-preorder"
import { useCart } from "@/components/providers/cart-context"
import { useProductSelection } from "@/components/store/use-product-selection"
import type { StoreProductDetailResult, StoreProductVariantGroup } from "@/lib/server/repositories/store-repository"

interface VariantPickerDialogProps {
  slug: string
  name: string
  category: string | null
  fallbackImage: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * "Escolher opções" do card da vitrine: o produto tem mais de uma cor ou um
 * grupo de opção (Switch, Voltagem...). O card não traz as opções, então este
 * componente busca `/api/store/products/[slug]` sob demanda ao abrir.
 *
 * A seleção é a MESMA da página do produto (`useProductSelection`): preço,
 * estoque, SKU e foto da combinação saem de `resolveSelection`. Este popup
 * recalculava o preço à mão, e foi uma cópia assim que fazia a loja anunciar
 * um valor e cobrar outro.
 */
export function VariantPickerDialog({ slug, name, category, fallbackImage, open, onOpenChange }: VariantPickerDialogProps) {
  const router = useRouter()
  const { add, setOpen: setCartOpen } = useCart()
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [detail, setDetail] = useState<StoreProductDetailResult | null>(null)
  const [added, setAdded] = useState(false)
  const pick = useProductSelection(detail)

  // O caller controla `open` de fora (abre ao clicar no botão do card), então
  // o Radix `onOpenChange` (só dispara em interação: ESC/overlay/X) não serve
  // pra saber quando buscar os dados — sincroniza com a prop `open` aqui.
  useEffect(() => {
    if (!open || loaded) return
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sincroniza busca com a prop `open` controlada de fora
    setLoading(true)
    setAdded(false)
    fetch(`/api/store/products/${slug}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: (StoreProductDetailResult & { ok: true }) | null) => {
        if (!cancelled && data) setDetail(data)
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          setLoaded(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, loaded, slug])

  const product = detail?.product ?? null
  const variants = detail?.variants ?? []
  const variantGroups = detail?.variantGroups ?? []
  const isPreOrder = product?.sale_type === "pre_order"
  const { icon: CategoryIcon, tint: categoryTint } = getCategoryIcon(category)
  const selection = pick?.selection ?? null
  const image = selection?.image ?? pick?.activeVariant?.image_url ?? product?.images?.[0] ?? fallbackImage
  const stock = selection?.stock ?? null

  function handleConfirm() {
    const item = pick?.toCartItem()
    if (!item) return
    add(item)
    setAdded(true)
    onOpenChange(false)
    // Pré-venda é reserva: segue direto para o checkout, como na página do produto.
    if (isPreOrder) router.push("/checkout")
    else setCartOpen(true)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        onClick={(e) => e.stopPropagation()}
        className="max-w-md sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle className="pr-6 text-base font-bold leading-snug">{name}</DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="size-6 animate-spin text-emerald-500" />
          </div>
        ) : !product || !pick || !selection ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Não foi possível carregar as opções.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-[var(--card-image-bg)]">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={image} src={image} alt={name} className="h-full w-full object-contain p-1.5" loading="lazy" decoding="async" />
                ) : (
                  <div
                    className="flex h-full items-center justify-center"
                    style={{ background: `radial-gradient(120% 120% at 50% 15%, color-mix(in oklab, ${categoryTint} 13%, var(--card-image-bg)), var(--card-image-bg))` }}
                  >
                    <CategoryIcon className="size-8 opacity-50" style={{ color: categoryTint }} strokeWidth={1.15} />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                {selection.price.hasDiscount ? (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="font-display text-xl font-bold text-emerald-400">{formatBRL(selection.price.effectiveCents)}</p>
                    <p className="text-xs text-muted-foreground line-through">{formatBRL(selection.price.baseCents)}</p>
                  </div>
                ) : (
                  <p className="font-display text-xl font-bold text-foreground">{formatBRL(selection.price.effectiveCents)}</p>
                )}
                {pick.versionLabel && <p className="truncate text-xs text-muted-foreground">{pick.versionLabel}</p>}
                {stock !== null && stock > 0 && stock <= LOW_STOCK_MAX_UNITS && (
                  <p className="text-xs font-semibold text-amber-400">Últimas {stock} unidades!</p>
                )}
              </div>
            </div>

            {variants.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cor</p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isActive = v.id === pick.activeVariant?.id
                    const variantSoldOut = pick.variantChoice(v).soldOut
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => pick.selectVariant(v.id)}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-[13px] font-semibold transition-colors",
                          isActive
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                            : "border-border text-muted-foreground hover:border-foreground/20",
                          variantSoldOut && !isActive && "opacity-60"
                        )}
                      >
                        {(v.color || v.icon) && (
                          <span
                            className="flex size-[16px] shrink-0 items-center justify-center rounded-full"
                            style={getColorSwatchStyle(v.color).style}
                          >
                            {v.icon && <span className="text-[10px] leading-none">{v.icon}</span>}
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

            {variantGroups.map((group: StoreProductVariantGroup) => (
              <div key={group.id} className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.name}</p>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const isActive = option.id === pick.selectedOptionByGroup[group.id]
                    const optionSoldOut = pick.optionChoice(group, option).soldOut
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => pick.selectOption(group.id, option.id)}
                        className={cn(
                          "rounded-xl border-[1.5px] px-3 py-2 text-[13px] font-semibold transition-colors",
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

            {!pick.canBuy ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm font-semibold text-red-400">
                {product.is_sold_out
                  ? "Produto esgotado"
                  : pick.preorderStatus && pick.preorderStatus !== "open"
                    ? `Pré-venda: ${PREORDER_STATUS_LABEL[pick.preorderStatus]}`
                    : "Essa combinação está esgotada"}
              </div>
            ) : isPreOrder ? (
              <Button
                className="h-11 w-full gap-2 rounded-xl bg-gradient-to-r from-amber-300 to-amber-500 text-[15px] font-bold text-[#1a1200] hover:brightness-105"
                onClick={handleConfirm}
              >
                <Rocket className="size-[18px]" />
                {PREORDER_CTA_LABEL}
              </Button>
            ) : (
              <Button
                className="h-11 w-full gap-2 rounded-xl text-[15px] font-bold"
                variant="secondary"
                onClick={handleConfirm}
              >
                <ShoppingCart className="size-[18px]" />
                {added ? "Adicionado!" : "Adicionar ao carrinho"}
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
