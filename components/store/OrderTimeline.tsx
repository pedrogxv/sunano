"use client"

import { CheckCircle2, Clock, CreditCard, MapPin, PackageCheck, Rocket, Truck } from "lucide-react"

import { cn } from "@/lib/utils"
import type { UserOrder } from "@/lib/hooks/use-user-orders"

/**
 * Trilho de progresso do pedido — a resposta visual para "cadê minha
 * compra?", que hoje só existia como um badge de status solto.
 *
 * Os quatro passos são a jornada real da loja, não os oito status do banco:
 * `awaiting_shipping_info` é a MESMA etapa de "pago" do ponto de vista de
 * quem comprou (o dinheiro saiu, falta despachar), e mostrá-lo como um passo
 * próprio faria parecer que o pedido regrediu.
 *
 * Pedido de serviço (`requires_shipping_address` false) pula a etapa de
 * endereço: prometer "a caminho" para uma mentoria é pior que não mostrar
 * trilho nenhum.
 */
const STEPS = [
  { key: "created", label: "Pedido feito", icon: Clock },
  { key: "paid", label: "Pagamento", icon: CreditCard },
  { key: "shipped", label: "Enviado", icon: Truck },
  { key: "delivered", label: "Entregue", icon: PackageCheck },
] as const

/** Índice do passo já concluído; -1 quando o pedido saiu do trilho feliz. */
function currentStepIndex(status: UserOrder["status"]): number {
  switch (status) {
    case "pending":
      return 0
    case "paid":
    case "awaiting_shipping_info":
      return 1
    case "shipped":
      return 2
    case "delivered":
      return 3
    default:
      // cancelled/refunded/expired não têm progresso a mostrar.
      return -1
  }
}

export function OrderTimeline({
  order,
  className,
}: {
  order: UserOrder
  className?: string
}) {
  const active = currentStepIndex(order.status)
  if (active < 0) return null

  const steps = order.requires_shipping_address
    ? STEPS
    : STEPS.filter((s) => s.key !== "shipped" && s.key !== "delivered")

  // O passo de envio fica travado enquanto falta endereço — é o ponto exato
  // onde o pedido para, e dizer isso no próprio trilho evita o cliente
  // procurar o motivo em outro lugar.
  const blockedByAddress =
    order.requires_shipping_address && !order.shipping_address && active >= 1

  // Pedido de pré-venda pago espera o lote chegar, não o despacho. Sem dizer
  // isso, ele mostra exatamente o mesmo trilho de quem comprou algo que sai
  // amanhã — e fica parado em "Pagamento" por semanas, sem explicação.
  const isPreOrder = order.items.some((item) => item.sale_type === "pre_order")
  const awaitingBatch = isPreOrder && active === 1 && !blockedByAddress

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {steps.map((step, idx) => {
        const done = idx <= active
        const isBlockedNext = blockedByAddress && idx === active + 1
        const isAwaitingBatch = awaitingBatch && idx === active + 1
        const pending = isBlockedNext || isAwaitingBatch
        const Icon = isBlockedNext
          ? MapPin
          : isAwaitingBatch
            ? Rocket
            : done
              ? CheckCircle2
              : step.icon
        return (
          <div key={step.key} className="flex min-w-0 flex-1 items-center gap-1">
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
                {isBlockedNext
                  ? "Falta endereço"
                  : isAwaitingBatch
                    ? "Aguardando lote"
                    : step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  "-mt-4 h-px flex-1 rounded-full",
                  idx < active ? "bg-emerald-500/40" : "bg-border/60"
                )}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
