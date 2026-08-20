"use client"

import { useState } from "react"
import Link from "next/link"
import { Package, QrCode, ShoppingBag } from "lucide-react"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import BoxLoader from "@/components/ui/box-loader"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"
import { useUserOrders, type UserOrder } from "@/lib/hooks/use-user-orders"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { cn } from "@/lib/utils"

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

function OrderCard({ order, onViewDetails }: { order: UserOrder; onViewDetails: (order: UserOrder) => void }) {
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
          <Link
            href={`/checkout/pix?orderId=${order.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-400 transition-colors hover:bg-amber-500/20"
          >
            <QrCode className="size-3.5" />
            Pagar com PIX
          </Link>
        )}
      </div>
    </div>
  )
}

function OrderDetailsDialog({ order, onOpenChange }: { order: UserOrder | null; onOpenChange: (open: boolean) => void }) {
  const receipt =
    order?.status === "paid" ? order.misticpay_e2e ?? order.asaas_payment_id ?? null : null
  const receiptUrl = order?.status === "paid" ? order.asaas_receipt_url : null
  const showPix = order?.status === "pending" && (order.pix_copy_paste || order.pix_qr_code_base64)

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

            {order.tracking_code && (
              <div className="space-y-1 border-t border-border/60 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Rastreio</p>
                <p className="text-sm text-foreground">
                  {order.carrier ? `${order.carrier} · ` : ""}
                  <span className="font-mono">{order.tracking_code}</span>
                </p>
              </div>
            )}

            {(receipt || showPix) && (
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
                      href={`/checkout/pix?orderId=${order.id}`}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-400 hover:underline"
                    >
                      <QrCode className="size-3.5" />
                      Abrir pagamento PIX
                    </Link>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export default function PedidosPage() {
  const { profile, loading: profileLoading } = useOwnProfile()
  const { orders, loading: ordersLoading } = useUserOrders()
  const [selectedOrder, setSelectedOrder] = useState<UserOrder | null>(null)

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

        {ordersLoading ? (
          <div className="flex justify-center py-12">
            <BoxLoader />
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <ShoppingBag className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
            <Link href="/loja" className="text-xs font-medium text-emerald-400 hover:underline">
              Ir para a loja
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((order) => (
              <OrderCard key={order.id} order={order} onViewDetails={setSelectedOrder} />
            ))}
          </div>
        )}
      </div>

      <OrderDetailsDialog order={selectedOrder} onOpenChange={(open) => !open && setSelectedOrder(null)} />
    </div>
  )
}
