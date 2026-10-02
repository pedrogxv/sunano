import { CalendarDays, Package } from "lucide-react"

import {
  formatPreorderShipDate,
  PREORDER_STATUS_HINT,
  PREORDER_STATUS_LABEL,
  PREORDER_STATUS_STYLE,
  preorderRemaining,
  type PreorderInfo,
  type PreorderStatus,
} from "@/lib/store-preorder"
import { cn } from "@/lib/utils"

/** Pílula do status do lote. A mesma na página, no card e na seção da Home. */
export function PreorderStatusChip({ status, className }: { status: PreorderStatus; className?: string }) {
  const { icon: Icon, chip } = PREORDER_STATUS_STYLE[status]
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold", chip, className)}>
      <Icon className="size-3.5" strokeWidth={2.4} />
      {PREORDER_STATUS_LABEL[status]}
    </span>
  )
}

/**
 * Barra "Restam N de M": só quando o lote tem teto (sem teto não há o que
 * contar) e só enquanto ele está aberto. Num lote encerrado, "Restam 12" leria
 * como convite para algo que já não se pode comprar.
 */
export function PreorderAvailability({
  limit,
  remaining,
  status,
  compact = false,
}: {
  limit: number | null
  remaining: number | null
  status: PreorderStatus
  compact?: boolean
}) {
  if (remaining === null || limit == null || limit === 0 || status !== "open") return null
  const filled = Math.min(100, Math.round(((limit - remaining) / limit) * 100))
  const urgent = remaining <= Math.max(3, Math.ceil(limit * 0.15))

  return (
    <div className={cn("space-y-1.5", compact && "space-y-1")}>
      <div className={cn("flex items-baseline justify-between gap-2", compact ? "text-[11px]" : "text-xs")}>
        <span className={cn("font-bold", urgent ? "text-red-400" : "text-amber-300")}>
          {remaining === 1 ? "Resta 1 unidade" : `Restam ${remaining} unidades`}
        </span>
        <span className="tabular-nums text-muted-foreground">
          {limit - remaining} de {limit} reservadas
        </span>
      </div>
      <div className={cn("overflow-hidden rounded-full bg-white/10", compact ? "h-1.5" : "h-2")}>
        <div className={cn("h-full rounded-full", urgent ? "bg-red-500" : PREORDER_STATUS_STYLE.open.bar)} style={{ width: `${filled}%` }} />
      </div>
    </div>
  )
}

/**
 * O lote na página do produto: nome do lote, o que o status significa,
 * previsão de envio e quanto sobra. Pré-venda tem de parecer diferente de
 * produto em estoque: é uma reserva que chega depois, e a pessoa precisa ler
 * isso ANTES do botão. O status em si fica na pílula ao lado do nome do
 * produto (`PreorderStatusChip`); repetida aqui, eram duas pílulas iguais a
 * um palmo de distância.
 */
export function PreorderLotPanel({ info, status }: { info: PreorderInfo; status: PreorderStatus }) {
  return (
    <div className="space-y-3 rounded-2xl border border-amber-400/25 bg-gradient-to-br from-amber-400/[0.08] via-transparent to-transparent px-5 py-4">
      <p className="flex items-center gap-2 text-sm font-bold text-foreground">
        <Package className="size-4 text-amber-300" />
        {info.batchName ? `Pré-venda · ${info.batchName}` : "Pré-venda"}
      </p>

      <p className={cn("text-sm", PREORDER_STATUS_STYLE[status].text)}>{PREORDER_STATUS_HINT[status]}</p>

      {info.shipsAt && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <CalendarDays className="size-4 shrink-0 text-amber-300" />
          <span>
            Previsão de envio: <span className="font-semibold text-foreground">{formatPreorderShipDate(info.shipsAt)}</span>
          </span>
        </p>
      )}

      <PreorderAvailability limit={info.limit} remaining={preorderRemaining(info)} status={status} />
    </div>
  )
}
