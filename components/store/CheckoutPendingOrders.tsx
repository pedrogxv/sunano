"use client"

import Link from "next/link"
import { Clock, Loader2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { pendingPaymentHref, type UserOrder } from "@/lib/hooks/use-user-orders"
import { paymentDeadlineLabel } from "@/lib/store-pending-orders"

function orderSummary(order: UserOrder): string {
  const names = order.items.map((item) => item.name).filter(Boolean)
  const method = order.payment_method === "credit_card" ? "Cartão" : "PIX"
  return [names.join(", "), formatBRL(order.total_cents), method, paymentDeadlineLabel(order.payment_expires_at)]
    .filter(Boolean)
    .join(" · ")
}

/**
 * Aviso no topo do checkout: há pedido aguardando pagamento. Os que têm
 * produto do carrinho vêm destacados, porque são os que o servidor recusa
 * duplicar (ver `pending-order-conflicts-repository`).
 */
export function PendingOrdersNotice({
  orders,
  conflictIds,
  cancellingId,
  onCancel,
}: {
  orders: UserOrder[]
  conflictIds: Set<string>
  cancellingId: string | null
  onCancel: (order: UserOrder) => void
}) {
  if (orders.length === 0) return null
  const hasConflict = orders.some((order) => conflictIds.has(order.id))

  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex items-start gap-2">
        <Clock className="mt-0.5 size-4 shrink-0 text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">
            {hasConflict
              ? "Você já tem um pedido aguardando pagamento com este produto"
              : orders.length === 1
                ? "Você tem um pedido aguardando pagamento"
                : `Você tem ${orders.length} pedidos aguardando pagamento`}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {hasConflict
              ? "Pague esse pedido ou cancele antes de criar outro com o mesmo produto"
              : "Ele segura o estoque até vencer. Pague ou cancele se desistiu"}
          </p>
        </div>
      </div>

      <ul className="mt-3 space-y-2">
        {orders.map((order) => (
          <li
            key={order.id}
            className="flex flex-col gap-2 rounded-lg border border-border/60 bg-background/60 p-3 sm:flex-row sm:items-center"
          >
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">Pedido #{orderNumber(order.id)}</p>
              <p className="truncate text-xs text-muted-foreground">{orderSummary(order)}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={cancellingId !== null}
                onClick={() => onCancel(order)}
              >
                {cancellingId === order.id ? <Loader2 className="size-4 animate-spin" /> : "Cancelar"}
              </Button>
              <Button asChild size="sm">
                <Link href={pendingPaymentHref(order)}>Pagar</Link>
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Pergunta no clique de pagar quando o carrinho tem produto de um pedido
 * aberto. "Substituir" segue com a compra e o servidor cancela o anterior na
 * mesma chamada (`replacePendingOrderIds`), devolvendo o estoque antes de
 * reservar o novo.
 */
export function PendingOrderConflictDialog({
  orders,
  onOpenChange,
  onReplace,
}: {
  orders: UserOrder[]
  onOpenChange: (open: boolean) => void
  onReplace: () => void
}) {
  const single = orders.length === 1 ? orders[0] : null

  return (
    <AlertDialog open={orders.length > 0} onOpenChange={onOpenChange}>
      {/* Três ações no rodapé: no max-w-sm padrão elas estouravam a caixa */}
      <AlertDialogContent className="data-[size=default]:sm:max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {single ? "Este produto já está num pedido em aberto" : "Estes produtos já estão em pedidos em aberto"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Você pode pagar o pedido que já existe ou substituí-lo por esta compra. Ao substituir, o pedido
            anterior é cancelado e o pagamento dele deixa de valer: não pague mais o QR Code ou o link antigo
          </AlertDialogDescription>
        </AlertDialogHeader>

        <ul className="min-w-0 space-y-2">
          {orders.map((order) => (
            <li key={order.id} className="rounded-xl border border-border/60 bg-secondary/50 p-3">
              <p className="text-sm font-semibold text-foreground">Pedido #{orderNumber(order.id)}</p>
              <p className="break-words text-xs text-muted-foreground">{orderSummary(order)}</p>
            </li>
          ))}
        </ul>

        <AlertDialogFooter className="sm:flex-wrap">
          <AlertDialogCancel>Voltar</AlertDialogCancel>
          {single && (
            <Button asChild variant="outline">
              <Link href={pendingPaymentHref(single)}>Pagar o pedido #{orderNumber(single.id)}</Link>
            </Button>
          )}
          <Button type="button" onClick={onReplace}>
            {single ? "Substituir pelo novo" : "Substituir pelos novos"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
