"use client"

import { useEffect, useState } from "react"
import { Loader2, ShoppingCart } from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { getCategoryIcon } from "@/lib/store-category-icons"
import { useCart, type CartVariantOption } from "@/components/providers/cart-context"
import type {
  StoreProductDetailResult,
  StoreProductVariant,
  StoreProductVariantGroup,
} from "@/lib/server/repositories/store-repository"

interface VariantPickerDialogProps {
  slug: string
  name: string
  category: string | null
  fallbackImage: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Popup de seleção de variante ao clicar em "adicionar ao carrinho" num card
 * (home/listagens). O card só sabe `has_variants` (cor) sem custo extra —
 * grupos (Switch, Voltagem...) só existem no detalhe, então este componente
 * busca `/api/store/products/[slug]` sob demanda ao abrir.
 */
export function VariantPickerDialog({ slug, name, category, fallbackImage, open, onOpenChange }: VariantPickerDialogProps) {
  const { add, setOpen: setCartOpen } = useCart()
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [detail, setDetail] = useState<StoreProductDetailResult | null>(null)
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null)
  const [selectedOptionByGroup, setSelectedOptionByGroup] = useState<Record<string, string | null>>({})
  const [added, setAdded] = useState(false)

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
        if (cancelled || !data) return
        setDetail(data)
        const isColorSoldOut = (v: StoreProductVariant) => v.is_sold_out || (v.stock !== null && v.stock === 0)
        setSelectedVariantId(
          data.variants.length > 0 ? data.variants.find((v) => !isColorSoldOut(v))?.id ?? data.variants[0].id : null
        )
        setSelectedOptionByGroup(
          Object.fromEntries(
            data.variantGroups.map((g) => [g.id, g.options.find((o) => !o.is_sold_out)?.id ?? g.options[0]?.id ?? null])
          )
        )
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
  const hasVariants = variants.length > 0
  const activeVariant = hasVariants ? variants.find((v) => v.id === selectedVariantId) ?? null : null
  const { icon: CategoryIcon, tint: categoryTint } = getCategoryIcon(category)

  let baseEffectivePriceCents = activeVariant?.price_cents_override ?? product?.price_cents ?? 0
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
    : activeVariant?.promo_price_cents ?? (activeVariant?.price_cents_override == null ? product?.promo_price_cents ?? null : null)
  const hasDiscount = activePromoPriceCents != null && activePromoPriceCents < baseEffectivePriceCents
  const effectivePriceCents = hasDiscount ? (activePromoPriceCents as number) : baseEffectivePriceCents
  const effectiveStock = activeVariant ? activeVariant.stock : product?.stock ?? null
  const hasUnselectableGroup = variantGroups.some((g) => !selectedOptionByGroup[g.id])
  const outOfStock = Boolean(product?.is_sold_out) || (effectiveStock !== null && effectiveStock === 0) || hasUnselectableGroup
  const image = activeVariant?.image_url ?? product?.images?.[0] ?? fallbackImage

  const isColorSoldOut = (v: StoreProductVariant) => v.is_sold_out || (v.stock !== null && v.stock === 0)

  function handleSelectVariant(id: string) {
    setSelectedVariantId(id)
  }

  function handleSelectGroupOption(group: StoreProductVariantGroup, optionId: string) {
    setSelectedOptionByGroup((prev) => ({ ...prev, [group.id]: optionId }))
  }

  function handleConfirm() {
    if (!product || outOfStock || (hasVariants && !activeVariant)) return
    const cartVariantOptions: CartVariantOption[] = selectedOptions.map((option) => {
      const group = variantGroups.find((g) => g.options.some((o) => o.id === option.id))!
      return { groupId: group.id, groupName: group.name, optionId: option.id, label: option.label }
    })
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
      image,
      stock: effectiveStock,
      type: product.type,
      condition: product.condition,
      sale_type: product.sale_type,
    })
    setAdded(true)
    onOpenChange(false)
    setCartOpen(true)
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
        ) : !product ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Não foi possível carregar as opções.</p>
        ) : (
          <div className="space-y-5">
            <div className="flex items-center gap-3">
              <div className="relative size-16 shrink-0 overflow-hidden rounded-xl border border-border bg-[var(--card-image-bg)]">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={image} src={image} alt={name} className="h-full w-full object-contain p-1.5" />
                ) : (
                  <div
                    className="flex h-full items-center justify-center"
                    style={{ background: `radial-gradient(120% 120% at 50% 15%, color-mix(in oklab, ${categoryTint} 13%, var(--card-image-bg)), var(--card-image-bg))` }}
                  >
                    <CategoryIcon className="size-8 opacity-50" style={{ color: categoryTint }} strokeWidth={1.15} />
                  </div>
                )}
              </div>
              <div>
                {hasDiscount ? (
                  <div className="flex flex-wrap items-baseline gap-2">
                    <p className="font-display text-xl font-bold text-emerald-400">{formatBRL(effectivePriceCents)}</p>
                    <p className="text-xs text-muted-foreground line-through">{formatBRL(baseEffectivePriceCents)}</p>
                  </div>
                ) : (
                  <p className="font-display text-xl font-bold text-foreground">{formatBRL(effectivePriceCents)}</p>
                )}
                {effectiveStock !== null && effectiveStock > 0 && effectiveStock <= 3 && (
                  <p className="text-xs font-semibold text-amber-400">Últimas {effectiveStock} unidades!</p>
                )}
              </div>
            </div>

            {hasVariants && (
              <div className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cor</p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const isActive = v.id === selectedVariantId
                    const variantSoldOut = isColorSoldOut(v)
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => !variantSoldOut && handleSelectVariant(v.id)}
                        disabled={variantSoldOut}
                        className={cn(
                          "flex items-center gap-2 rounded-xl border-[1.5px] px-3 py-2 text-[13px] font-semibold transition-colors",
                          isActive
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                            : "border-border text-muted-foreground hover:border-foreground/20",
                          variantSoldOut && "cursor-not-allowed opacity-50 hover:border-border"
                        )}
                      >
                        {(v.color || v.icon) && (
                          <span
                            className="flex size-[16px] shrink-0 items-center justify-center rounded-full border border-black/10"
                            style={{ backgroundColor: v.color ?? "transparent" }}
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

            {variantGroups.map((group) => (
              <div key={group.id} className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.name}</p>
                <div className="flex flex-wrap gap-2">
                  {group.options.map((option) => {
                    const isActive = option.id === selectedOptionByGroup[group.id]
                    const optionSoldOut = option.is_sold_out
                    return (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => !optionSoldOut && handleSelectGroupOption(group, option.id)}
                        disabled={optionSoldOut}
                        className={cn(
                          "rounded-xl border-[1.5px] px-3 py-2 text-[13px] font-semibold transition-colors",
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
              <Button
                className="h-11 w-full gap-2 rounded-xl text-[15px] font-bold"
                variant="secondary"
                onClick={handleConfirm}
                disabled={hasVariants && !activeVariant}
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
