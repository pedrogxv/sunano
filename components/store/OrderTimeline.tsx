"use client"

import { CheckCircle2, ClipboardCheck, CreditCard, MapPin, PackageCheck, Truck, Warehouse } from "lucide-react"

import { cn } from "@/lib/utils"
import type { UserOrder } from "@/lib/hooks/use-user-orders"

/**
 * Trilho de progresso do pedido — a resposta visual para "cadê minha
 * compra?", que hoje só existia como um badge de status solto.
 *
 * Os passos são a jornada real da loja, na mesma ordem de
 * `ORDER_FULFILLMENT_FLOW`: pagou, deu o endereço, pedido feito (esperando o
 * produto chegar ao armazém), chegou ao armazém, enviado, entregue. "No
 * armazém" não é status: é o marco `warehouse_arrived_at` dentro de `paid`,
 * que o admin marca. Endereço e pedido feito não são
 * cliques do admin: o banco decide pelo endereço
 * (`trg_store_orders_shipping_stage`), então o trilho nunca diz "falta
 * endereço" para quem já deu um.
 *
 * Pedido de serviço (`requires_shipping_address` false) não tem endereço,
 * armazém nem pacote: prometer "a caminho" para uma mentoria é pior que
 * mostrar só pagamento e conclusão.
 */
const PHYSICAL_STEPS = [
  { key: "payment", label: "Pagamento", icon: CreditCard },
  { key: "address", label: "Endereço", icon: MapPin },
  { key: "placed", label: "Pedido feito", icon: ClipboardCheck },
  { key: "warehouse", label: "No armazém", icon: Warehouse },
  { key: "shipped", label: "Enviado", icon: Truck },
  { key: "delivered", label: "Entregue", icon: PackageCheck },
] as const

const SERVICE_STEPS = [
  { key: "payment", label: "Pagamento", icon: CreditCard },
  { key: "delivered", label: "Concluído", icon: PackageCheck },
] as const

/**
 * Índice do último passo concluído (-1 = nenhum), ou null quando o pedido
 * saiu do trilho feliz (cancelado, estornado, expirado).
 */
function lastDoneIndex(order: UserOrder): number | null {
  const { status } = order
  if (!order.requires_shipping_address) {
    switch (status) {
      case "pending":
        return -1
      case "paid":
      case "awaiting_shipping_info":
        return 0
      case "shipped":
      case "delivered":
        return 1
      default:
        return null
    }
  }
  switch (status) {
    case "pending":
      return -1
    case "awaiting_shipping_info":
      return 0
    case "paid":
      return order.warehouse_arrived_at ? 3 : 2
    case "shipped":
      return 4
    case "delivered":
      return 5
    default:
      return null
  }
}

export function OrderTimeline({
  order,
  className,
}: {
  order: UserOrder
  className?: string
}) {
  const lastDone = lastDoneIndex(order)
  if (lastDone === null) return null

  const steps = order.requires_shipping_address ? PHYSICAL_STEPS : SERVICE_STEPS

  // O passo seguinte fica em destaque quando depende do CLIENTE: pagar ou
  // informar o endereço. É o ponto exato onde o pedido para, e dizer isso no
  // próprio trilho evita o cliente procurar o motivo em outro lugar. O que
  // depende da loja (chegar ao armazém, postar) não pede nada dele.
  const waitingOnCustomer = order.status === "pending" || order.status === "awaiting_shipping_info"

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {steps.map((step, idx) => {
        const done = idx <= lastDone
        const pending = waitingOnCustomer && idx === lastDone + 1
        const Icon = done ? CheckCircle2 : step.icon
        const isLast = idx === steps.length - 1
        // Só os passos com linha depois crescem: o último é só o nó, senão ele
        // ocupa uma fatia inteira e fica encalhado no meio do trilho.
        return (
          <div
            key={step.key}
            className={cn("flex min-w-0 items-center gap-1", isLast ? "shrink-0" : "flex-1")}
          >
            <div className="flex min-w-0 flex-col items-center gap-1">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors",
                  done
                    ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-400"
                    : pending
                      ? "border-amber-500/40 bg-amber-500/15 text-amber-400"
                      : "border-border/60 bg-muted/30 text-muted-foreground/50"
                )}
              >
                <Icon className="size-3" strokeWidth={2.5} />
              </span>
              <span
                className={cn(
                  "max-w-full truncate text-[9px] font-medium uppercase tracking-wide",
                  done
                    ? "text-emerald-400/90"
                    : pending
                      ? "text-amber-400/90"
                      : "text-muted-foreground/50"
                )}
              >
                {pending && step.key === "address" ? "Falta endereço" : step.label}
              </span>
            </div>
            {!isLast && (
              <span
                aria-hidden
                className={cn(
                  "-mt-4 h-px flex-1 rounded-full",
                  idx < lastDone ? "bg-emerald-500/40" : "bg-border/60"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
