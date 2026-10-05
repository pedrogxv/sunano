"use client"

import { useEffect, useState } from "react"
import { Timer } from "lucide-react"

import { formatCountdown, preorderCountdown, type PreorderInfo } from "@/lib/store-preorder"
import { cn } from "@/lib/utils"

/**
 * Contagem regressiva da pré-venda. Duas fases com o mesmo relógio: "Preço de
 * lançamento acaba em" (desconto inicial) e "Pré-venda termina em" (7 dias
 * seguintes, já sem desconto). Sem prazo, ou com o prazo vencido, não desenha
 * nada.
 *
 * O relógio só liga depois de montar: o servidor não sabe a hora do cliente, e
 * renderizar `Date.now()` no SSR dá divergência de hidratação.
 */
export function PreorderCountdown({
  info,
  compact = false,
  className,
}: {
  info: Pick<PreorderInfo, "earlyEndsAt" | "endsAt">
  compact?: boolean
  className?: string
}) {
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (!info.earlyEndsAt) return
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [info.earlyEndsAt, info.endsAt])

  // Antes de montar, reserva a altura da faixa (CLS): sem isso o card inteiro
  // empurra para baixo quando o relógio liga.
  if (now === null) {
    if (!info.earlyEndsAt) return null
    return (
      <div
        aria-hidden="true"
        className={cn("rounded-xl border border-transparent px-3 py-2", className)}
      >
        <span className={cn("block", compact ? "text-[13px]" : "text-sm")}>&nbsp;</span>
      </div>
    )
  }
  const state = preorderCountdown(info, now)
  if (!state) return null

  const early = state.phase === "early"
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 rounded-xl border px-3 py-2",
        early ? "border-amber-400/35 bg-amber-400/10" : "border-white/10 bg-white/[0.04]",
        className
      )}
      role="timer"
    >
      <p className={cn("flex min-w-0 items-center gap-1.5 font-semibold", compact ? "text-[11px]" : "text-xs", early ? "text-amber-300" : "text-muted-foreground")}>
        <Timer className="size-3.5 shrink-0" strokeWidth={2.2} />
        <span className="truncate">{state.label}</span>
      </p>
      <span className={cn("shrink-0 font-display font-bold tabular-nums text-white", compact ? "text-[13px]" : "text-sm")}>
        {formatCountdown(state.targetMs - now)}
      </span>
    </div>
  )
}
