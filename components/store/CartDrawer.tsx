"use client"

import { useEffect } from "react"
import Link from "next/link"
import { Minus, Package, Plus, ShoppingBag, ShoppingCart, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/components/providers/cart-context"
import { formatBRL } from "@/lib/format"
import { computeCardPriceCents } from "@/lib/store-pricing"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { cn } from "@/lib/utils"
import { SALE_TYPE_ICON, SALE_TYPE_LABEL } from "@/lib/store-sale-type"

export function CartButton() {
  const { count, setOpen } = useCart()

  if (count === 0) return null

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Abrir carrinho"
      className="relative flex h-8 items-center gap-2 rounded-lg border border-border bg-card/70 px-2.5 text-sm font-medium text-muted-foreground transition-all hover:bg-muted/40 hover:text-foreground"
    >
      <ShoppingCart className="size-[15px]" />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white ring-2 ring-card">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  )
}

export function CartDrawer() {
  const { items, count, remove, increment, decrement, clear, isOpen, setOpen } = useCart()
  const { cardSurchargePercent } = useStoreSettings()

  const total = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)
  const cardTotal = computeCardPriceCents(total, cardSurchargePercent)
  const hasPreOrderItem = items.some((i) => i.sale_type === "pre_order")

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = ""
    }
  }, [isOpen, setOpen])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200 bg-black/60 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carrinho de compras"
        className="fixed inset-y-0 right-0 z-[61] flex w-full max-w-sm animate-in slide-in-from-right fade-in-0 duration-300 ease-out flex-col border-l border-border bg-popover shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <ShoppingCart className="size-5 text-muted-foreground" />
            <h2 className="text-base font-bold text-foreground">Carrinho</h2>
            {count > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-semibold text-emerald-400">
                {count} {count === 1 ? "item" : "itens"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            {items.length > 0 && (
              <button
                onClick={clear}
                className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/10 hover:text-red-300"
              >
                <Trash2 className="size-3.5" />
                Limpar carrinho
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar carrinho"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
              <div className="flex size-16 items-center justify-center rounded-2xl bg-muted/40">
                <ShoppingBag className="size-7 text-muted-foreground" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Seu carrinho está vazio</p>
                <p className="text-xs text-muted-foreground">Adicione produtos da loja</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} asChild>
                <Link href="/loja">Explorar loja</Link>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const optionIds = item.variantOptions.map((o) => o.optionId)
                return (
                <div
                  key={`${item.productId}:${item.variantId ?? "base"}:${optionIds.join(",")}`}
                  className="group flex items-center gap-3.5 rounded-xl border border-border bg-muted/30 p-3.5 transition-colors hover:bg-muted/50"
                >
                  {/* Image */}
                  <div className="flex size-[70px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image} alt={item.name} className="h-full w-full object-contain p-1.5" />
                    ) : (
                      <Package className="size-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-foreground">
                      <span className="truncate">{item.name}</span>
                      {(() => {
                        if (!item.variantColor && !item.variantIcon) return null
                        return (
                          <span
                            className="flex size-4 shrink-0 items-center justify-center rounded-full border border-black/10"
                            style={{ backgroundColor: item.variantColor ?? "transparent" }}
                          >
                            {item.variantIcon && <span className="text-[9px] leading-none">{item.variantIcon}</span>}
                          </span>
                        )
                      })()}
                    </p>
                    {(item.variantLabel || item.variantOptions.length > 0) && (
                      <p className="truncate text-xs text-muted-foreground">
                        {[item.variantLabel, ...item.variantOptions.map((o) => `${o.groupName}: ${o.label}`)]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    )}
                    <p className="mt-1 text-sm font-bold text-emerald-400">{formatBRL(item.priceCents)}</p>
                    {item.sale_type !== "normal" && (() => {
                      const SaleTypeIcon = SALE_TYPE_ICON[item.sale_type]
                      return (
                        <span
                          className={cn(
                            "mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold",
                            item.sale_type === "pre_order"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-emerald-500/15 text-emerald-400"
                          )}
                        >
                          <SaleTypeIcon className="size-3" strokeWidth={2.5} />
                          {SALE_TYPE_LABEL[item.sale_type]}
                        </span>
                      )
                    })()}
                    {item.stock !== null && item.stock <= 3 && (
                      <p className="mt-1 text-[11px] font-semibold text-amber-400">
                        Últimas {item.stock} unidades!
                      </p>
                    )}
                  </div>

                  {/* Qty */}
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => remove(item.productId, item.variantId, optionIds)}
                      aria-label={`Remover ${item.name}`}
                      className="flex size-8 items-center justify-center rounded-md text-muted-foreground/60 opacity-100 transition-all hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => decrement(item.productId, item.variantId, optionIds)}
                        aria-label="Diminuir quantidade"
                        className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground md:size-7"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold text-foreground">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => increment(item.productId, item.variantId, optionIds)}
                        disabled={item.stock !== null && item.quantity >= item.stock}
                        aria-label="Aumentar quantidade"
                        className={cn(
                          "flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground md:size-7",
                          item.stock !== null && item.quantity >= item.stock && "cursor-not-allowed opacity-40"
                        )}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="space-y-3 border-t border-border px-5 py-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-black text-foreground">{formatBRL(total)}</span>
            </div>

            <p className="text-[10px] text-muted-foreground">
              PIX: {formatBRL(total)} ({cardSurchargePercent}% de desconto) · Cartão: {formatBRL(cardTotal)}
            </p>

            {hasPreOrderItem && (
              <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[10px] font-semibold text-amber-400">
                Seu carrinho tem item(ns) em pré-venda — o envio desses produtos só ocorre quando o estoque chegar.
              </p>
            )}

            <Button
              className="h-14 w-full gap-2 rounded-xl bg-emerald-600 text-base font-extrabold text-white hover:bg-emerald-500"
              asChild
            >
              <Link href="/checkout" onClick={() => setOpen(false)}>
                Finalizar Compra
              </Link>
            </Button>
          </div>
        )}
      </div>
    </>
  )
}
