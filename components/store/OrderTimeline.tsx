"use client"

import { Check, ClipboardCheck, CreditCard, MapPin, PackageCheck, Truck, Warehouse } from "lucide-react"

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
 *
 * Layout que não quebra em largura nenhuma:
 *   • GRADE de colunas iguais (`minmax(0, 1fr)`), não flex: a soma nunca passa
 *     da largura do pai. No flex, o min-content dos rótulos empurrava o trilho
 *     para fora do card (e o card para fora do modal);
 *   • a linha entre os passos é desenhada de CENTRO a CENTRO, atrás dos nós,
 *     então ela aparece sempre — antes ela era o resto de espaço depois do
 *     rótulo e sumia quando o rótulo era comprido;
 *   • rótulo quebra em até duas linhas em vez de virar "PEDIDO FEI…";
 *   • abaixo de ~320px de LARGURA DO TRILHO (container query, não viewport:
 *     o mesmo trilho vive no card da lista e no modal), os rótulos saem e
 *     uma legenda única diz em que passo o pedido está.
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

type StepState = "done" | "customer" | "store" | "upcoming"

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
  const currentIdx = lastDone + 1 < steps.length ? lastDone + 1 : null

  // O passo seguinte fica em destaque quando depende do CLIENTE: pagar ou
  // informar o endereço. É o ponto exato onde o pedido para, e dizer isso no
  // próprio trilho evita o cliente procurar o motivo em outro lugar. O que
  // depende da loja (chegar ao armazém, postar) aparece "em andamento", sem
  // pedir nada dele.
  const waitingOnCustomer = order.status === "pending" || order.status === "awaiting_shipping_info"

  const stateOf = (idx: number): StepState =>
    idx <= lastDone ? "done" : idx === currentIdx ? (waitingOnCustomer ? "customer" : "store") : "upcoming"

  const labelOf = (idx: number) => {
    const step = steps[idx]
    return stateOf(idx) === "customer" && step.key === "address" ? "Falta endereço" : step.label
  }

  // Legenda do modo compacto: o passo em que o pedido está (ou o fim).
  const captionIdx = currentIdx ?? steps.length - 1
  const caption =
    currentIdx === null
      ? `${labelOf(captionIdx)} · concluído`
      : `${stateOf(captionIdx) === "customer" ? "Sua vez" : "Agora"}: ${labelOf(captionIdx)}`

  return (
    <div className={cn("@container min-w-0", className)}>
      <ol
        aria-label="Progresso do pedido"
        className="grid w-full"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, idx) => {
          const state = stateOf(idx)
          const isLast = idx === steps.length - 1
          const Icon = state === "done" ? Check : step.icon
          // Trecho entre este nó e o próximo: cheio quando os dois estão
          // feitos; em degradê quando leva ao passo atual.
          const segment =
            idx < lastDone
              ? "done"
              : idx === lastDone && currentIdx !== null
                ? stateOf(currentIdx)
                : "upcoming"

          return (
            <li
              key={step.key}
              aria-current={idx === currentIdx ? "step" : undefined}
              className="relative flex min-w-0 flex-col items-center gap-1.5 px-0.5 text-center"
            >
              {!isLast && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-3 left-[calc(50%+0.875rem)] right-[calc(-50%+0.875rem)] h-0.5 -translate-y-1/2 rounded-full",
                    segment === "done" && "bg-emerald-500/50",
                    segment === "customer" && "bg-gradient-to-r from-emerald-500/50 to-amber-400/60",
                    segment === "store" && "bg-gradient-to-r from-emerald-500/50 to-foreground/25",
                    segment === "upcoming" && "bg-border"
                  )}
                />
              )}

              <span className="relative flex size-6 shrink-0 items-center justify-center">
                {state === "customer" && (
                  <span
                    aria-hidden
                    className="absolute inset-0 animate-ping rounded-full bg-amber-400/25 motion-reduce:hidden"
                  />
                )}
                <span
                  className={cn(
                    "relative flex size-6 items-center justify-center rounded-full border transition-colors",
                    state === "done" && "border-emerald-500/50 bg-emerald-500 text-emerald-950",
                    state === "customer" && "border-amber-400/60 bg-amber-500/15 text-amber-300",
                    state === "store" && "border-dashed border-foreground/40 bg-foreground/5 text-foreground/80",
                    state === "upcoming" && "border-border bg-muted/40 text-muted-foreground/60"
                  )}
                >
                  <Icon className="size-3" strokeWidth={state === "done" ? 3 : 2.25} />
                </span>
              </span>

              <span
                className={cn(
                  "line-clamp-2 w-full text-[10px] leading-tight font-medium text-balance break-words hyphens-auto @max-xs:sr-only",
                  state === "done" && "text-emerald-400/90",
                  state === "customer" && "text-amber-300",
                  state === "store" && "text-foreground/80",
                  state === "upcoming" && "text-muted-foreground/60"
                )}
              >
                {labelOf(idx)}
                {state === "done" && <span className="sr-only"> (concluído)</span>}
              </span>
            </li>
          )
        })}
      </ol>

      <p
        aria-hidden
        className={cn(
          "mt-2 hidden truncate text-center text-[11px] font-medium @max-xs:block",
          currentIdx !== null && stateOf(currentIdx) === "customer" ? "text-amber-300" : "text-muted-foreground"
        )}
      >
        {caption} · {Math.min(captionIdx + 1, steps.length)}/{steps.length}
      </p>
    </div>
  )
}
