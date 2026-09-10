"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  CalendarIcon,
  ChevronsUpDown,
  Copy,
  MapPin,
  Package,
  PackageCheck,
  QrCode,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Truck,
  X,
  XCircle,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

import { useCart } from "@/components/providers/cart-context"
import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"
import {
  useUserOrders,
  isMissingShippingAddress,
  pendingPaymentHref,
  type UserOrder,
} from "@/lib/hooks/use-user-orders"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { OrderShippingAddressDialog } from "@/components/store/OrderShippingAddressDialog"
import { OrderTimeline } from "@/components/store/OrderTimeline"
import { formatShippingAddressLine } from "@/components/store/ShippingAddressFields"

const STATUS_LABEL: Record<UserOrder["status"], string> = {
  pending: "Aguardando pagamento",
  paid: "Pago",
  awaiting_shipping_info: "Aguardando dados de entrega",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
  expired: "Expirado",
}

const STATUS_STYLE: Record<UserOrder["status"], string> = {
  pending: "bg-amber-500/15 text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  awaiting_shipping_info: "bg-blue-500/15 text-blue-300",
  shipped: "bg-violet-500/15 text-violet-300",
  delivered: "bg-teal-500/15 text-teal-300",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-sky-500/15 text-sky-400",
  expired: "bg-orange-500/15 text-orange-400",
}

const STATUS_FILTERS: Array<{ value: UserOrder["status"] | "all"; label: string }> = [
  { value: "all", label: "Todos os status" },
  { value: "pending", label: STATUS_LABEL.pending },
  { value: "paid", label: STATUS_LABEL.paid },
  { value: "awaiting_shipping_info", label: STATUS_LABEL.awaiting_shipping_info },
  { value: "shipped", label: STATUS_LABEL.shipped },
  { value: "delivered", label: STATUS_LABEL.delivered },
  { value: "cancelled", label: STATUS_LABEL.cancelled },
  { value: "refunded", label: STATUS_LABEL.refunded },
  { value: "expired", label: STATUS_LABEL.expired },
]

const PAGE_SIZE = 10

/** `true` = resgate de produto físico da Central pago com Aura, não compra em dinheiro. */
function isAuraOrder(order: UserOrder): boolean {
  return order.payment_method === "aura" || order.aura_cost_paid !== null
}

/** Valor a exibir no lugar do preço em BRL: custo em Aura para pedido de Aura, senão o total normal. */
function OrderPriceLabel({ order, className }: { order: UserOrder; className?: string }) {
  if (isAuraOrder(order)) {
    return (
      <span className={cn("inline-flex items-center gap-1 text-sm font-bold text-amber-400", className)}>
        <Sparkles className="size-3.5" />
        {(order.aura_cost_paid ?? 0).toLocaleString("pt-BR")} Aura
      </span>
    )
  }
  return <span className={cn("text-sm font-bold text-foreground", className)}>{formatBRL(order.total_cents)}</span>
}

/** yyyy-mm-dd local (sem componente de hora) — evita off-by-one por fuso ao converter de/para `Date`. */
function toDateInputValue(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

function fromDateInputValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number)
  return new Date(year, month - 1, day)
}

function formatDateShort(value: string): string {
  return fromDateInputValue(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function DateRangeFilter({
  dateFrom,
  dateTo,
  onChange,
}: {
  dateFrom: string
  dateTo: string
  onChange: (range: { dateFrom: string; dateTo: string }) => void
}) {
  const [open, setOpen] = useState(false)

  const range: DateRange | undefined = dateFrom
    ? { from: fromDateInputValue(dateFrom), to: dateTo ? fromDateInputValue(dateTo) : undefined }
    : undefined

  const label = dateFrom
    ? dateTo
      ? `${formatDateShort(dateFrom)} – ${formatDateShort(dateTo)}`
      : `A partir de ${formatDateShort(dateFrom)}`
    : "Filtrar por período"

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className={cn("w-full justify-between font-normal sm:w-56", !dateFrom && "text-muted-foreground")}
        >
          <span className="flex min-w-0 items-center gap-1.5 truncate">
            <CalendarIcon className="size-3.5 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          {dateFrom ? (
            <X
              className="ml-2 size-3.5 shrink-0 opacity-60 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation()
                onChange({ dateFrom: "", dateTo: "" })
              }}
            />
          ) : (
            <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="range"
          selected={range}
          defaultMonth={range?.from}
          onSelect={(next) => {
            onChange({
              dateFrom: next?.from ? toDateInputValue(next.from) : "",
              dateTo: next?.to ? toDateInputValue(next.to) : "",
            })
          }}
          numberOfMonths={1}
        />
      </PopoverContent>
    </Popover>
  )
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

const MAX_THUMBS = 3

function ItemThumb({ image, className }: { image?: string | null; className?: string }) {
  if (!image) {
    return (
      <div className={cn("flex items-center justify-center bg-muted", className)}>
        <Package className="size-4 text-muted-foreground" />
      </div>
    )
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" className={cn("object-cover", className)} />
  )
}

function OrderThumbs({ order }: { order: UserOrder }) {
  const shown = order.items.slice(0, MAX_THUMBS)
  const extra = order.items.length - shown.length

  return (
    <div className="flex shrink-0 -space-x-3">
      {shown.map((item, idx) => (
        <ItemThumb
          key={idx}
          image={item.image}
          className="size-10 rounded-lg border-2 border-background ring-1 ring-border/60"
        />
      ))}
      {extra > 0 && (
        <div className="flex size-10 items-center justify-center rounded-lg border-2 border-background bg-muted text-[11px] font-semibold text-muted-foreground ring-1 ring-border/60">
          +{extra}
        </div>
      )}
    </div>
  )
}

function CancelOrderButton({
  order,
  onCancelled,
  className,
}: {
  order: UserOrder
  onCancelled: () => void
  className?: string
}) {
  const [cancelling, setCancelling] = useState(false)

  async function handleCancel() {
    setCancelling(true)
    try {
      const res = await fetch(`/api/store/orders/${order.id}/cancel`, { method: "POST" })
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao cancelar pedido")
      toast.success("Pedido cancelado", { description: `#${orderNumber(order.id)}` })
      onCancelled()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao cancelar pedido"
      toast.error("Erro ao cancelar pedido", { description: message })
    } finally {
      setCancelling(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20",
            className
          )}
        >
          <XCircle className="size-3.5" />
          Cancelar pedido
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancelar este pedido?</AlertDialogTitle>
          <AlertDialogDescription>
            O pedido #{orderNumber(order.id)} será cancelado e a cobrança pendente será encerrada. Essa
            ação não pode ser desfeita; se ainda quiser comprar, será preciso fazer um novo pedido.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={cancelling}>Voltar</AlertDialogCancel>
          <AlertDialogAction onClick={handleCancel} disabled={cancelling}>
            {cancelling ? "Cancelando..." : "Confirmar cancelamento"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/**
 * Estados em que ainda faz sentido o cliente mexer no endereço. Depois de
 * `shipped` a etiqueta já saiu — o servidor recusa a alteração, então nem
 * oferecemos o botão. Espelha `SHIPPING_EDITABLE_STATUSES` no repositório.
 */
const SHIPPING_EDITABLE: UserOrder["status"][] = ["pending", "paid", "awaiting_shipping_info"]

/**
 * Cor de destaque do card por status. O pedido é o objeto mais concreto que
 * a pessoa tem na conta — a borda colorida deixa o estado legível antes de
 * ler qualquer texto, e é o mesmo vocabulário de cor dos badges.
 */
const STATUS_ACCENT: Record<UserOrder["status"], string> = {
  pending: "from-amber-500/60",
  paid: "from-emerald-500/60",
  awaiting_shipping_info: "from-blue-500/60",
  shipped: "from-violet-500/60",
  delivered: "from-teal-500/60",
  cancelled: "from-muted-foreground/40",
  refunded: "from-sky-500/60",
  expired: "from-orange-500/60",
}

function OrderCard({
  order,
  onViewDetails,
  onCancelled,
  onEditShipping,
}: {
  order: UserOrder
  onViewDetails: (order: UserOrder) => void
  onCancelled: () => void
  onEditShipping: (order: UserOrder) => void
}) {
  const itemCount = order.items.reduce((sum, i) => sum + (i.quantity ?? 1), 0)
  const summary = order.items.map((i) => i.name).filter(Boolean).join(", ")
  const missingAddress = isMissingShippingAddress(order)

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-xl border bg-muted/20 transition-colors",
        missingAddress ? "border-amber-500/40" : "border-border hover:border-border/80"
      )}
    >
      {/* Faixa de status: leitura de estado antes de qualquer texto. */}
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-0 left-0 w-1 bg-gradient-to-b to-transparent",
          STATUS_ACCENT[order.status]
        )}
      />

      <button
        type="button"
        onClick={() => onViewDetails(order)}
        className="flex w-full flex-col gap-3 p-4 pl-5 text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex min-w-0 items-start gap-3">
          <OrderThumbs order={order} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">
              <span className="font-mono text-xs text-muted-foreground">#{orderNumber(order.id)}</span>{" "}
              {summary || "Pedido"}
            </p>
            <p className="text-xs text-muted-foreground">
              {itemCount} {itemCount === 1 ? "item" : "itens"} · {formatDate(order.created_at)}
            </p>
            {order.tracking_code && (
              <p className="mt-0.5 truncate text-[11px] text-violet-300">
                <Truck className="mr-1 inline size-3" />
                {order.carrier ? `${order.carrier} · ` : ""}
                <span className="font-mono">{order.tracking_code}</span>
              </p>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
              STATUS_STYLE[order.status]
            )}
          >
            {STATUS_LABEL[order.status]}
          </span>
          {isAuraOrder(order) && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
              <Sparkles className="size-2.5" />
              Pago com Aura
            </span>
          )}
          <OrderPriceLabel order={order} />
        </div>
      </button>

      {/* Trilho de progresso — some nos estados sem jornada (cancelado etc.). */}
      <div className="px-4 pb-3 pl-5">
        <OrderTimeline order={order} />
      </div>

      {/* Aviso de endereço faltando: dentro do card do pedido em questão, não
          num alerta genérico no topo — o cliente precisa saber QUAL pedido
          está parado, não que "algum" está. */}
      {missingAddress && (
        <div className="flex flex-col gap-2 border-t border-amber-500/25 bg-amber-500/10 px-4 py-2.5 pl-5 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-1.5 text-[11px] text-amber-300">
            <MapPin className="mt-px size-3.5 shrink-0" />
            <span>
              Pagamento confirmado, mas falta o endereço de entrega: este pedido não é
              despachado enquanto isso.
            </span>
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => onEditShipping(order)}
            className="h-7 shrink-0 gap-1.5 bg-amber-500 text-xs font-semibold text-black hover:bg-amber-400"
          >
            <Truck className="size-3.5" />
            Informar endereço
          </Button>
        </div>
      )}

      {/* Ações de pagamento pendente */}
      {order.status === "pending" && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2.5 pl-5">
          <Link
            href={pendingPaymentHref(order)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <QrCode className="size-3.5" />
            {order.payment_method === "credit_card" ? "Continuar pagamento" : "Pagar com PIX"}
          </Link>
          <CancelOrderButton order={order} onCancelled={onCancelled} />
        </div>
      )}

      {/* Recompra de pedido que não foi pago. Um PIX vencido é a intenção de
          compra mais qualificada que existe — a pessoa escolheu tudo e só não
          pagou — e até aqui não havia caminho de volta. */}
      {(order.status === "expired" || order.status === "cancelled") && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 px-4 py-2.5 pl-5">
          <ReorderButton order={order} />
        </div>
      )}
    </div>
  )
}

/**
 * Recompõe o carrinho com os itens deste pedido e leva ao checkout.
 *
 * Não recria o pedido: preço e disponibilidade podem ter mudado, e o
 * checkout (com a revalidação de carrinho) é quem sabe disso. O que se
 * recupera aqui é o trabalho de escolher, que é o que trava a recompra.
 */
function ReorderButton({ order }: { order: UserOrder }) {
  const { add, setOpen } = useCart()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleReorder() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/store/orders/${order.id}/reorder`)
      const data = (await res.json()) as {
        items?: {
          productId: string
          variantId: string | null
          quantity: number
          slug: string
          name: string
          priceCents: number
          image: string | null
          stock: number | null
          available: boolean
        }[]
        error?: string
      }
      if (!res.ok || !data.items) {
        throw new Error(data.error ?? "Não foi possível recuperar os itens.")
      }

      const available = data.items.filter((i) => i.available)
      if (available.length === 0) {
        setError("Os itens deste pedido não estão mais disponíveis.")
        return
      }

      for (const item of available) {
        // `add` soma uma unidade por chamada — repete para chegar à
        // quantidade original, respeitando o teto de estoque do carrinho.
        for (let n = 0; n < item.quantity; n++) {
          add({
            productId: item.productId,
            variantId: item.variantId,
            variantLabel: null,
            variantColor: null,
            variantIcon: null,
            variantOptions: [],
            slug: item.slug,
            name: item.name,
            priceCents: item.priceCents,
            image: item.image,
            stock: item.stock,
            type: "store",
            condition: "new",
            sale_type: "normal",
          })
        }
      }
      setOpen(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível recuperar os itens.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={handleReorder}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-60"
      >
        <ShoppingCart className="size-3.5" />
        {loading ? "Recuperando..." : "Comprar de novo"}
      </button>
      {error && <span className="text-[11px] text-red-400">{error}</span>}
    </div>
  )
}

function OrderDetailsDialog({
  order,
  onOpenChange,
  onCancelled,
  onEditShipping,
}: {
  order: UserOrder | null
  onOpenChange: (open: boolean) => void
  onCancelled: () => void
  onEditShipping: (order: UserOrder) => void
}) {
  const auraOrder = order ? isAuraOrder(order) : false
  const receipt =
    order?.status === "paid" && !auraOrder ? order.asaas_payment_id ?? null : null
  const receiptUrl = order?.status === "paid" && !auraOrder ? order.asaas_receipt_url : null
  const showPix =
    order?.status === "pending" &&
    !auraOrder &&
    order.payment_method !== "credit_card" &&
    (order.pix_copy_paste || order.pix_qr_code_base64)
  const showCardContinue =
    order?.status === "pending" && !auraOrder && order.payment_method === "credit_card"

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>Pedido #{orderNumber(order.id)}</DialogTitle>
              <DialogDescription>{formatDateTime(order.created_at)}</DialogDescription>
            </DialogHeader>

            <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5">
              <div className="flex items-center justify-between">
                <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[order.status])}>
                  {STATUS_LABEL[order.status]}
                </span>
                <OrderPriceLabel order={order} />
              </div>
              {auraOrder && (
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-400/90">
                  <Sparkles className="size-3" />
                  Resgate da Central de Aura: pago com Aura, sem cobrança em dinheiro.
                </p>
              )}
              <OrderTimeline order={order} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Itens</p>
              <div className="space-y-2">
                {order.items.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <ItemThumb image={item.image} className="size-12 shrink-0 rounded-lg border border-border/60" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">{item.name ?? "Item"}</p>
                      <p className="text-xs text-muted-foreground">
                        {[item.variant_label, ...(item.variant_options ?? []).map((o) => o.label)]
                          .filter(Boolean)
                          .map((label) => `${label} · `)
                          .join("")}
                        {item.quantity ?? 1}x
                        {!auraOrder && typeof item.price_cents === "number"
                          ? ` · ${formatBRL(item.price_cents)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {order.status === "refunded" && (
              <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-2">
                <p className="text-xs text-sky-300">
                  O estorno deste pedido foi solicitado e passa por uma validação manual no gateway
                  de pagamento. O valor pode levar alguns dias úteis a mais para aparecer na sua
                  conta, além do prazo normal de reembolso.
                </p>
              </div>
            )}

            {order.status === "pending" && (
              <CancelOrderButton
                order={order}
                onCancelled={() => {
                  onCancelled()
                  onOpenChange(false)
                }}
                className="w-full justify-center"
              />
            )}

            <div className="space-y-2 border-t border-border/60 pt-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Endereço de entrega
              </p>
              {!order.requires_shipping_address ? (
                <p className="text-xs text-muted-foreground">
                  Este pedido não precisa de endereço; nada será enviado pelos Correios.
                </p>
              ) : order.shipping_address ? (
                <>
                  <p className="text-sm text-foreground">{order.shipping_address.recipient}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatShippingAddressLine(order.shipping_address)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-amber-400">
                  Ainda não informado; o pedido não é despachado até você preencher.
                </p>
              )}
              {order.requires_shipping_address && SHIPPING_EDITABLE.includes(order.status) && (
                <button
                  type="button"
                  onClick={() => onEditShipping(order)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:underline"
                >
                  <Truck className="size-3.5" />
                  {order.shipping_address ? "Alterar endereço" : "Informar endereço"}
                </button>
              )}
              {/* Depois do despacho a etiqueta já saiu: o servidor recusa a
                  alteração, então em vez de um botão que só devolve erro,
                  apontamos para onde a mudança ainda é possível. */}
              {order.requires_shipping_address &&
                !SHIPPING_EDITABLE.includes(order.status) &&
                (order.status === "shipped" || order.status === "delivered") && (
                  <p className="text-[11px] text-muted-foreground">
                    Pedido já despachado; o endereço não pode mais ser alterado por aqui.{" "}
                    <Link href="/suporte" className="font-medium text-emerald-400 hover:underline">
                      Fale com o suporte
                    </Link>
                    .
                  </p>
                )}
            </div>

            {order.tracking_code && (
              <div className="space-y-1 border-t border-border/60 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rastreio</p>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {order.carrier ? `${order.carrier} · ` : ""}
                    <span className="font-mono">{order.tracking_code}</span>
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 shrink-0 gap-1.5 text-xs"
                    onClick={() => {
                      navigator.clipboard
                        .writeText(order.tracking_code ?? "")
                        .then(() => toast.success("Código de rastreio copiado."))
                        .catch(() => toast.error("Não foi possível copiar."))
                    }}
                  >
                    <Copy className="size-3" />
                    Copiar
                  </Button>
                </div>
              </div>
            )}

            {(receipt || showPix || showCardContinue) && (
              <div className="space-y-2 border-t border-border/60 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Comprovante</p>
                {receipt && (
                  <p className="break-all rounded-lg bg-muted/40 px-3 py-2 font-mono text-[11px] text-foreground">
                    {receipt}
                  </p>
                )}
                {receiptUrl && (
                  <a
                    href={receiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block text-xs font-medium text-emerald-400 hover:underline"
                  >
                    Ver comprovante de pagamento
                  </a>
                )}
                {showPix && (
                  <div className="space-y-2">
                    {order.pix_qr_code_base64 && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`data:image/png;base64,${order.pix_qr_code_base64}`}
                        alt="QR Code PIX"
                        className="mx-auto size-40 rounded-lg border border-border/60"
                      />
                    )}
                    {order.pix_copy_paste && (
                      <p className="break-all rounded-lg bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
                        {order.pix_copy_paste}
                      </p>
                    )}
                    <Link
                      href={pendingPaymentHref(order)}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:underline"
                    >
                      <QrCode className="size-3.5" />
                      Abrir pagamento PIX
                    </Link>
                  </div>
                )}
                {showCardContinue && (
                  <Link
                    href={pendingPaymentHref(order)}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:underline"
                  >
                    Continuar pagamento com cartão
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OrderCardSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="size-10 shrink-0 rounded-lg bg-muted" />
        <div className="min-w-0 space-y-2">
          <div className="h-3.5 w-40 rounded bg-muted" />
          <div className="h-3 w-24 rounded bg-muted" />
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
        <div className="h-4 w-20 rounded-full bg-muted" />
        <div className="h-3.5 w-16 rounded bg-muted" />
      </div>
    </div>
  )
}

export default function PedidosPage() {
  const { profile, loading: profileLoading } = useOwnProfile()
  const [statusFilter, setStatusFilter] = useState<UserOrder["status"] | "all">("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  // Fila "falta endereço" — resolvida no banco (não filtrando a página já
  // carregada), senão o contador e a paginação passam a mentir.
  const [missingOnly, setMissingOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const { orders, total, hasMore, loading: ordersLoading, refetch } = useUserOrders({
    page,
    pageSize: PAGE_SIZE,
    filters: {
      status: statusFilter === "all" ? undefined : statusFilter,
      dateFrom: dateFrom ? fromDateInputValue(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
      missingShipping: missingOnly || undefined,
    },
  })
  const [selectedOrder, setSelectedOrder] = useState<UserOrder | null>(null)
  // Pedido cujo endereço de entrega está sendo informado/corrigido.
  const [shippingOrder, setShippingOrder] = useState<UserOrder | null>(null)

  // Busca por número do pedido ou nome de produto. Deliberadamente local, só
  // sobre a página atual: o servidor não indexa `items` por nome e uma busca
  // que varre jsonb em toda a tabela sairia cara para um filtro de conforto.
  const term = search.trim().toLowerCase()
  const visibleOrders = term
    ? orders.filter(
        (order) =>
          orderNumber(order.id).toLowerCase().includes(term) ||
          order.items.some((item) => (item.name ?? "").toLowerCase().includes(term))
      )
    : orders

  const missingCount = orders.filter(isMissingShippingAddress).length
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters =
    statusFilter !== "all" || dateFrom !== "" || dateTo !== "" || missingOnly || term !== ""

  // Qualquer mudança de filtro volta pra primeira página — aplicado no
  // próprio handler (não em efeito) pra não disparar uma renderização extra.
  function applyStatusFilter(next: UserOrder["status"] | "all") {
    setStatusFilter(next)
    setPage(1)
  }

  function applyDateRange(range: { dateFrom: string; dateTo: string }) {
    setDateFrom(range.dateFrom)
    setDateTo(range.dateTo)
    setPage(1)
  }

  function clearFilters() {
    setStatusFilter("all")
    setDateFrom("")
    setDateTo("")
    setMissingOnly(false)
    setSearch("")
    setPage(1)
  }

  function toggleMissingOnly() {
    setMissingOnly((v) => !v)
    setPage(1)
  }

  if (profileLoading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="pb-16">
      <AccountPageHeader profile={profile} />

      <div className="mx-auto max-w-4xl px-2 py-8 sm:px-4 md:px-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Meus Pedidos</h2>
            <p className="text-xs text-muted-foreground">
              {total > 0
                ? `${total} pedido${total === 1 ? "" : "s"} na Loja.`
                : "Histórico de compras na Loja."}
            </p>
          </div>
          <Link
            href="/loja"
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-medium text-emerald-400 transition-colors hover:bg-emerald-500/20"
          >
            <Sparkles className="size-3.5" />
            Ver a loja
          </Link>
        </div>

        {/* Chamada única para as pendências de endereço da página: o card de
            cada pedido continua trazendo o aviso específico, mas quem tem
            vários pedidos precisa ver de uma vez que há algo parado. */}
        {missingCount > 0 && !missingOnly && (
          <button
            type="button"
            onClick={toggleMissingOnly}
            className="mb-4 flex w-full items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-left transition-colors hover:bg-amber-500/15"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-400">
              <MapPin className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-amber-300">
                {missingCount === 1
                  ? "1 pedido pago está esperando seu endereço"
                  : `${missingCount} pedidos pagos estão esperando seu endereço`}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                Nada é despachado enquanto o endereço não for informado. Toque para ver só esses.
              </span>
            </span>
            <PackageCheck className="size-4 shrink-0 text-amber-400" />
          </button>
        )}

        <div className="mb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por número do pedido ou produto…"
              className="h-9 pl-9 text-sm"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Limpar busca"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={statusFilter} onValueChange={(v) => applyStatusFilter(v as UserOrder["status"] | "all")}>
            <SelectTrigger className="w-full border-border bg-card text-sm sm:w-56">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map(({ value, label }) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangeFilter dateFrom={dateFrom} dateTo={dateTo} onChange={applyDateRange} />

          <Button
            type="button"
            size="sm"
            variant={missingOnly ? "default" : "outline"}
            onClick={toggleMissingOnly}
            className={cn(
              "gap-1.5 text-xs",
              missingOnly && "bg-amber-500 text-black hover:bg-amber-400"
            )}
          >
            <MapPin className="size-3.5" />
            Falta endereço
            {missingCount > 0 && !missingOnly && (
              <span className="rounded-full bg-amber-500/20 px-1.5 text-[10px] font-bold text-amber-400">
                {missingCount}
              </span>
            )}
          </Button>

          {hasActiveFilters && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={clearFilters}>
              <X className="size-3.5" />
              Limpar filtros
            </Button>
          )}
        </div>

        {ordersLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <OrderCardSkeleton key={i} />
            ))}
          </div>
        ) : visibleOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <ShoppingBag className="size-8 text-muted-foreground" />
            {hasActiveFilters ? (
              <>
                <p className="text-sm text-muted-foreground">
                  {missingOnly && orders.length === 0
                    ? "Nenhum pedido esperando endereço: está tudo em dia."
                    : "Nenhum pedido encontrado com esses filtros."}
                </p>
                <Button variant="ghost" size="sm" className="gap-1.5 text-emerald-400" onClick={clearFilters}>
                  <X className="size-3.5" />
                  Limpar filtros
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
                <Link href="/loja" className="text-xs font-medium text-emerald-400 hover:underline">
                  Ir para a loja
                </Link>
              </>
            )}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {visibleOrders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  onViewDetails={setSelectedOrder}
                  onCancelled={refetch}
                  onEditShipping={setShippingOrder}
                />
              ))}
            </div>

            {(totalPages > 1 || total > 0) && (
              <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  Página {page} de {totalPages} · {total} pedido{total === 1 ? "" : "s"}
                </p>
                {totalPages > 1 && (
                  <div className="flex gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border text-xs disabled:opacity-40"
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      Anterior
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 border-border text-xs disabled:opacity-40"
                      onClick={() => setPage((p) => p + 1)}
                      disabled={!hasMore}
                    >
                      Próxima
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <OrderDetailsDialog
        order={selectedOrder}
        onOpenChange={(open) => !open && setSelectedOrder(null)}
        onCancelled={refetch}
        onEditShipping={(order) => {
          // Fecha o detalhe antes de abrir o endereço: dois dialogs
          // empilhados brigam pelo foco e pelo scroll lock.
          setSelectedOrder(null)
          setShippingOrder(order)
        }}
      />

      <OrderShippingAddressDialog
        orderId={shippingOrder?.id ?? null}
        existing={shippingOrder?.shipping_address ?? null}
        open={shippingOrder !== null}
        onOpenChange={(open) => !open && setShippingOrder(null)}
        onSaved={refetch}
      />
    </div>
  )
}
