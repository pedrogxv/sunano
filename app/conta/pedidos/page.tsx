"use client"

import { useState } from "react"
import Link from "next/link"
import { toast } from "sonner"
import {
  CalendarIcon,
  ChevronsUpDown,
  Package,
  QrCode,
  ShoppingBag,
  Truck,
  X,
  XCircle,
} from "lucide-react"
import type { DateRange } from "react-day-picker"

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
import { useUserOrders, pendingPaymentHref, type UserOrder } from "@/lib/hooks/use-user-orders"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { cn } from "@/lib/utils"
import { OrderShippingAddressDialog } from "@/components/store/OrderShippingAddressDialog"
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
            ação não pode ser desfeita — se ainda quiser comprar, será preciso fazer um novo pedido.
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

/** Pago e sem endereço = o pedido está parado esperando o cliente. */
function needsShippingAddress(order: UserOrder): boolean {
  return !order.shipping_address && (order.status === "paid" || order.status === "awaiting_shipping_info")
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

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
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
          <button
            type="button"
            onClick={() => onViewDetails(order)}
            className="mt-1 text-xs font-medium text-emerald-400 hover:underline"
          >
            Ver mais
          </button>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
        <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[order.status])}>
          {STATUS_LABEL[order.status]}
        </span>
        <span className="text-sm font-bold text-foreground">{formatBRL(order.total_cents)}</span>
        {order.status === "pending" && (
          <>
            <Link
              href={pendingPaymentHref(order)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
            >
              <QrCode className="size-3.5" />
              {order.payment_method === "credit_card" ? "Continuar pagamento" : "Pagar com PIX"}
            </Link>
            <CancelOrderButton order={order} onCancelled={onCancelled} />
          </>
        )}
        {needsShippingAddress(order) && (
          <button
            type="button"
            onClick={() => onEditShipping(order)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-blue-500/40 bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-300 transition-colors hover:bg-blue-500/20"
          >
            <Truck className="size-3.5" />
            Informar endereço
          </button>
        )}
      </div>
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
  const receipt =
    order?.status === "paid" ? order.misticpay_e2e ?? order.asaas_payment_id ?? null : null
  const receiptUrl = order?.status === "paid" ? order.asaas_receipt_url : null
  const showPix =
    order?.status === "pending" &&
    order.payment_method !== "credit_card" &&
    (order.pix_copy_paste || order.pix_qr_code_base64)
  const showCardContinue = order?.status === "pending" && order.payment_method === "credit_card"

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {order && (
          <>
            <DialogHeader>
              <DialogTitle>Pedido #{orderNumber(order.id)}</DialogTitle>
              <DialogDescription>{formatDateTime(order.created_at)}</DialogDescription>
            </DialogHeader>

            <div className="flex items-center justify-between rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[order.status])}>
                {STATUS_LABEL[order.status]}
              </span>
              <span className="text-sm font-bold text-foreground">{formatBRL(order.total_cents)}</span>
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
                        {typeof item.price_cents === "number" ? ` · ${formatBRL(item.price_cents)}` : ""}
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
              {order.shipping_address ? (
                <>
                  <p className="text-sm text-foreground">{order.shipping_address.recipient}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatShippingAddressLine(order.shipping_address)}
                  </p>
                </>
              ) : (
                <p className="text-xs text-amber-400">
                  Ainda não informado — o pedido não é despachado até você preencher.
                </p>
              )}
              {SHIPPING_EDITABLE.includes(order.status) && (
                <button
                  type="button"
                  onClick={() => onEditShipping(order)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:underline"
                >
                  <Truck className="size-3.5" />
                  {order.shipping_address ? "Alterar endereço" : "Informar endereço"}
                </button>
              )}
            </div>

            {order.tracking_code && (
              <div className="space-y-1 border-t border-border/60 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rastreio</p>
                <p className="text-sm text-foreground">
                  {order.carrier ? `${order.carrier} · ` : ""}
                  <span className="font-mono">{order.tracking_code}</span>
                </p>
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
  const [page, setPage] = useState(1)

  const { orders, total, hasMore, loading: ordersLoading, refetch } = useUserOrders({
    page,
    pageSize: PAGE_SIZE,
    filters: {
      status: statusFilter === "all" ? undefined : statusFilter,
      dateFrom: dateFrom ? fromDateInputValue(dateFrom).toISOString() : undefined,
      dateTo: dateTo ? new Date(`${dateTo}T23:59:59.999`).toISOString() : undefined,
    },
  })
  const [selectedOrder, setSelectedOrder] = useState<UserOrder | null>(null)
  // Pedido cujo endereço de entrega está sendo informado/corrigido.
  const [shippingOrder, setShippingOrder] = useState<UserOrder | null>(null)

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const hasActiveFilters = statusFilter !== "all" || dateFrom !== "" || dateTo !== ""

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
        <div className="mb-6 space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Meus Pedidos</h2>
          <p className="text-xs text-muted-foreground">Histórico de compras na Loja.</p>
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
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <ShoppingBag className="size-8 text-muted-foreground" />
            {hasActiveFilters ? (
              <>
                <p className="text-sm text-muted-foreground">Nenhum pedido encontrado com esses filtros.</p>
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
              {orders.map((order) => (
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
