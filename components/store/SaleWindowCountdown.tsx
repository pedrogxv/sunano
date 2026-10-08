"use client"

import { useEffect, useState } from "react"
import { Timer } from "lucide-react"

import { formatBRL } from "@/lib/format"
import { formatCountdown, saleWindowCountdownLabel, type SaleWindow, type SaleWindowKind } from "@/lib/store-sale-window"
import { cn } from "@/lib/utils"

/** Pré-venda é âmbar (o dourado do card), Lançamento é violeta (o selo dele). */
const TONE: Record<SaleWindowKind, { box: string; label: string }> = {
  preorder: { box: "border-amber-400/35 bg-amber-400/10", label: "text-amber-300" },
  launch: { box: "border-violet-400/35 bg-violet-500/10", label: "text-violet-300" },
}

/**
 * Contagem do prazo da pré-venda ou do lançamento (lib/store-sale-window.ts).
 * Sem prazo, ou com o prazo vencido e o cron ainda não rodou, não desenha
 * nada (em vez de "0 segundos").
 *
 * `priceAfterCents` acrescenta "Depois: R$ X" quando o preço muda no fim,
 * que é o que dá sentido à pressa.
 *
 * O relógio só liga depois de montar: o servidor não sabe a hora do cliente, e
 * renderizar `Date.now()` no SSR dá divergência de hidratação.
 */
export function SaleWindowCountdown({
  saleWindow,
  kind,
  priceAfterCents = null,
  compact = false,
  className,
}: {
  saleWindow: SaleWindow | null
  kind: SaleWindowKind
  priceAfterCents?: number | null
  compact?: boolean
  className?: string
}) {
  const endsAt = saleWindow?.endsAt ?? null
  const [now, setNow] = useState<number | null>(null)

  useEffect(() => {
    if (!endsAt) return
    const tick = () => setNow(Date.now())
    const first = window.setTimeout(tick, 0)
    const timer = window.setInterval(tick, 1000)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
    }
  }, [endsAt])

  if (!saleWindow || !endsAt) return null
  const showPriceAfter = priceAfterCents != null && !compact

  // Antes de montar, reserva a altura da faixa (CLS): sem isso o card inteiro
  // empurra para baixo quando o relógio liga.
  if (now === null) {
    return (
      <div aria-hidden="true" className={cn("rounded-xl border border-transparent px-3 py-2", className)}>
        <span className={cn("block", compact ? "text-[13px]" : "text-sm")}>&nbsp;</span>
        {showPriceAfter && <span className="block text-xs">&nbsp;</span>}
      </div>
    )
  }
  const targetMs = Date.parse(endsAt)
  if (!(targetMs > now)) return null

  const tone = TONE[kind]
  return (
    <div className={cn("rounded-xl border px-3 py-2", tone.box, className)} role="timer">
      <div className="flex items-center justify-between gap-2">
        <p className={cn("flex min-w-0 items-center gap-1.5 font-semibold", compact ? "text-[11px]" : "text-xs", tone.label)}>
          <Timer className="size-3.5 shrink-0" strokeWidth={2.2} />
          <span className="truncate">{saleWindowCountdownLabel(kind, saleWindow.endAction)}</span>
        </p>
        <span className={cn("shrink-0 font-display font-bold tabular-nums text-white", compact ? "text-[13px]" : "text-sm")}>
          {formatCountdown(targetMs - now)}
        </span>
      </div>
      {showPriceAfter && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          Depois: <span className="font-semibold text-foreground">{formatBRL(priceAfterCents)}</span> no PIX
        </p>
      )}
    </div>
  )
}
