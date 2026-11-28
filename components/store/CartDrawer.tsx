"use client"

import { useEffect, useState } from "react"
import { RouteLink } from "@/components/ui/route-link"
import { LogIn, Minus, Package, Plus, ShoppingBag, ShoppingCart, Trash2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { RemoveCartItemDialog, type PendingRemoval } from "@/components/store/RemoveCartItemDialog"
import { useCart } from "@/components/providers/cart-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { formatBRL } from "@/lib/format"
import { computeCardTotalCents } from "@/lib/store-pricing"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { cn } from "@/lib/utils"
import { TOPBAR_BADGE, TOPBAR_ICON_BUTTON } from "@/components/layout/topbar-styles"
import { SALE_TYPE_ICON, SALE_TYPE_LABEL } from "@/lib/store-sale-type"
import { cartLineMaxQuantity } from "@/lib/store-cart-limits"
import { storageImgProps } from "@/lib/storage-thumb"

export function CartButton() {
  const { count, setOpen } = useCart()

  if (count === 0) return null

  return (
    <button
      onClick={() => setOpen(true)}
      aria-label="Abrir carrinho"
      // 44px no mobile, como o sino e o botão de entrar ao lado: com h-8 ele
      // ficava visivelmente menor que os vizinhos na mesma fileira.
      className={TOPBAR_ICON_BUTTON}
    >
      <ShoppingCart className="size-[17px]" />
      {count > 0 && (
        <span className={cn(TOPBAR_BADGE, "bg-emerald-500")}>
          {count > 9 ? "9+" : count}
        </span>
      )}
    </button>
  )
}

export function CartDrawer() {
  const { items, count, remove, increment, decrement, clear, isOpen, setOpen } = useCart()
  const { cardSurchargePercent, cardEnabled } = useStoreSettings()
  const { user, loading: authLoading } = useAuthUser()
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)

  function requestRemoval(item: (typeof items)[number], fromDecrement: boolean) {
    setPendingRemoval({
      productId: item.productId,
      variantId: item.variantId,
      optionIds: item.variantOptions.map((o) => o.optionId),
      name: item.name,
      image: item.image,
      quantity: item.quantity,
      priceCents: item.priceCents,
      fromDecrement,
    })
  }

  function confirmRemoval() {
    if (!pendingRemoval) return
    remove(pendingRemoval.productId, pendingRemoval.variantId, pendingRemoval.optionIds)
    setPendingRemoval(null)
  }

  const total = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)
  const cardTotal = computeCardTotalCents(items, cardSurchargePercent)
  const hasPreOrderItem = items.some((i) => i.sale_type === "pre_order")

  useEffect(() => {
    if (!isOpen) return
    function onKeyDown(e: KeyboardEvent) {
      // Com um AlertDialog aberto por cima, o Escape é dele — fechar o
      // drawer junto levaria o usuário embora da tela sem querer.
      if (e.key === "Escape" && !pendingRemoval) setOpen(false)
    }
    document.addEventListener("keydown", onKeyDown)
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKeyDown)
      document.body.style.overflow = ""
    }
  }, [isOpen, setOpen, pendingRemoval])

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop: escurece e desfoca a página, mas a sidebar e a barra
          continuam lendo como a mesma moldura por baixo do vidro. */}
      <div
        className="fixed inset-0 z-[60] animate-in fade-in-0 duration-200 bg-black/50 backdrop-blur-[6px]"
        onClick={() => setOpen(false)}
      />

      {/* Drawer — a sidebar ESPELHADA: o mesmo painel de vidro
          (`.sidebar-glass`), flutuando com o mesmo respiro de 8px e o mesmo
          raio, só que do lado direito. A anatomia também espelha: cabeçalho
          da altura da barra do topo (h-14), lista com a pílula de rolagem e
          o véu nas bordas (`.sidebar-scroll`), e embaixo um card tingido —
          como o da Central de Aura na sidebar, mas no verde da Loja — que
          segura o total e o botão de finalizar. Separação por fundo e
          espaço, sem linha interna. No celular é gaveta de altura cheia,
          colada na borda (rounded só à esquerda), como a sidebar. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Carrinho de compras"
        className={cn(
          "sidebar-glass fixed inset-y-0 right-0 z-[61] flex h-dvh w-full max-w-sm flex-col overflow-hidden",
          "rounded-l-2xl border border-r-0 border-white/10",
          "md:inset-y-2 md:right-2 md:h-auto md:max-w-[400px] md:rounded-2xl md:border-r",
          "animate-in slide-in-from-right fade-in-0 duration-300 ease-out"
        )}
      >
        {/* Brilho esmeralda vindo do canto de baixo: a luz do card do total
            batendo no vidro. Só decoração, atrás de tudo. */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-64 bg-[radial-gradient(120%_70%_at_50%_100%,rgb(16_185_129/0.12),transparent_70%)]"
        />

        {/* Header */}
        <div className="relative flex h-14 shrink-0 items-center justify-between gap-2 pl-4 pr-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
              <ShoppingCart className="nav-bag-icon size-[17px]" />
            </span>
            <h2 className="text-[15px] font-bold tracking-tight text-foreground">Carrinho</h2>
            {count > 0 && (
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-emerald-400">
                {count} {count === 1 ? "item" : "itens"}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-0.5">
            {items.length > 0 && (
              <button
                onClick={() => clear()}
                className="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[#b4b4b4] transition-colors hover:bg-red-500/10 hover:text-red-400"
              >
                <Trash2 className="size-3.5" />
                Limpar
              </button>
            )}
            <button
              onClick={() => setOpen(false)}
              aria-label="Fechar carrinho"
              className={TOPBAR_ICON_BUTTON}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* Items */}
        <div className="sidebar-scroll relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-2.5 pt-2 pb-4">
          {items.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
              {/* A sacola da Loja acesa: o mesmo halo pulsante do item
                  "Loja" da sidebar, que é de onde a pessoa veio. */}
              <div className="relative flex size-20 items-center justify-center">
                <span aria-hidden className="absolute inset-0 rounded-full bg-emerald-500/10 blur-xl" />
                <span className="relative flex size-16 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-inset ring-emerald-500/20">
                  <ShoppingBag className="nav-bag-icon size-7 text-emerald-400" />
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">Seu carrinho está vazio</p>
                <p className="text-xs text-muted-foreground">Adicione produtos da loja</p>
              </div>
              <Button
                size="sm"
                onClick={() => setOpen(false)}
                className="h-9 rounded-full bg-emerald-500/15 px-4 font-semibold text-emerald-300 hover:bg-emerald-500/25"
                asChild
              >
                <RouteLink href="/loja">Explorar loja</RouteLink>
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {items.map((item) => {
                const optionIds = item.variantOptions.map((o) => o.optionId)
                return (
                <div
                  key={`${item.productId}:${item.variantId ?? "base"}:${optionIds.join(",")}`}
                  className="group flex items-center gap-3 rounded-xl bg-white/[0.03] p-2.5 transition-colors hover:bg-white/[0.055]"
                >
                  {/* Image */}
                  <div className="flex size-[68px] shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white/[0.04]">
                    {item.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img {...storageImgProps(item.image, 64)} alt={item.name} className="h-full w-full object-contain p-1.5" loading="lazy" decoding="async" />
                    ) : (
                      <Package className="size-6 text-muted-foreground" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
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
                      onClick={() => requestRemoval(item, false)}
                      aria-label={`Remover ${item.name}`}
                      className="flex size-8 items-center justify-center rounded-full text-muted-foreground/60 opacity-100 transition-all hover:bg-red-500/10 hover:text-red-400 md:size-7 md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    {/* Quantidade: uma cápsula só, como os botões da barra
                        do topo, em vez de dois quadrados com borda. */}
                    <div className="flex items-center rounded-full bg-white/[0.05] p-0.5">
                      <button
                        onClick={() =>
                          item.quantity <= 1
                            ? requestRemoval(item, true)
                            : decrement(item.productId, item.variantId, optionIds)
                        }
                        aria-label={item.quantity <= 1 ? `Remover ${item.name}` : "Diminuir quantidade"}
                        className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground md:size-7"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums text-foreground">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => increment(item.productId, item.variantId, optionIds)}
                        disabled={item.quantity >= cartLineMaxQuantity(item)}
                        aria-label="Aumentar quantidade"
                        className={cn(
                          "flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/[0.08] hover:text-foreground md:size-7",
                          item.quantity >= cartLineMaxQuantity(item) && "cursor-not-allowed opacity-40"
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
          <div className="relative shrink-0 px-2.5 pb-2.5">
          <div className="space-y-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] p-3.5">
            <div className="flex items-end justify-between gap-3">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#b4b4b4]">Total</span>
              <span className="text-2xl font-black leading-none tracking-tight tabular-nums text-foreground">{formatBRL(total)}</span>
            </div>

            {/* Carrinho só de serviço tem preço único: não há desconto de PIX a anunciar.
                Cartão desligado: o PIX é o único meio, sem comparação a fazer. */}
            <p className="text-[11px] text-muted-foreground">
              {!cardEnabled
                ? "Pagamento via PIX"
                : cardTotal > total
                  ? `PIX: ${formatBRL(total)} (${cardSurchargePercent}% de desconto) · Cartão: ${formatBRL(cardTotal)}`
                  : "Mesmo preço no PIX e no cartão"}
            </p>

            {hasPreOrderItem && (
              <p className="rounded-lg bg-amber-500/10 px-2.5 py-2 text-[11px] font-semibold text-amber-400">
                Seu carrinho tem item(ns) em pré-venda; o envio desses produtos só ocorre quando o estoque chegar.
              </p>
            )}

            {/* Sinaliza o login AQUI, e não só no fim do checkout: a compra
                exige conta, e descobrir isso depois de preencher tudo é o
                ponto de maior atrito do funil. O botão continua levando ao
                checkout — quem não tem conta encontra o login já sabendo. */}
            {!authLoading && !user && (
              <p className="flex items-center gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-2 text-[11px] text-muted-foreground">
                <LogIn className="size-3 shrink-0" />
                Você vai precisar entrar na sua conta para finalizar.
              </p>
            )}

            <Button
              className="h-12 w-full gap-2 rounded-xl bg-emerald-600 text-[15px] font-extrabold text-white shadow-[0_8px_24px_-8px_rgb(16_185_129/0.6)] hover:bg-emerald-500"
              asChild
            >
              <RouteLink href="/checkout" onClick={() => setOpen(false)}>
                Finalizar Compra
              </RouteLink>
            </Button>
          </div>
          </div>
        )}
      </div>

      <RemoveCartItemDialog
        pending={pendingRemoval}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null)
        }}
        onConfirm={confirmRemoval}
        elevated
      />
    </>
  )
}
