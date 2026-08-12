"use client"

import Link from "next/link"
import { ShieldCheck } from "lucide-react"

import { Skeleton } from "@/components/ui/skeleton"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

const SIZE = 112
const STROKE_WIDTH = 10
const RADIUS = (SIZE - STROKE_WIDTH) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

function ReviewGaugeCardSkeleton() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-5 w-32 self-start" />
      <Skeleton className="size-28 rounded-full" />
      <Skeleton className="h-3 w-24" />
    </div>
  )
}

/**
 * Indicador circular de % de periféricos já revisados/aprovados — mesma
 * contagem usada no tile "Periféricos" e no bloco "Precisa de atenção"
 * (`stats.peripherals`), só que como meter em vez de número cru. Track e
 * preenchimento usam o mesmo tom (cyan), a cor já associada a "Periféricos"
 * no resto do dashboard.
 */
export function ReviewGaugeCard({
  total,
  pendingReview,
  href,
  loading,
}: {
  total: number | null
  pendingReview: number | null
  href: string
  loading: boolean
}) {
  const t = useT()
  const d = t.admin.dashboard

  if (loading || total === null || pendingReview === null) return <ReviewGaugeCardSkeleton />

  const approved = total - pendingReview
  const percent = total > 0 ? Math.round((approved / total) * 100) : 0
  const dash = (percent / 100) * CIRCUMFERENCE

  return (
    <Link
      href={href}
      className="group animate-in fade-in slide-in-from-bottom-2 flex h-full flex-col items-center rounded-2xl border border-border bg-card p-4 text-center transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/40 hover:bg-cyan-500/5 hover:shadow-lg hover:shadow-black/5"
    >
      <div className="flex w-full items-center gap-2 self-start">
        <div className="flex size-7 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
          <ShieldCheck className="size-3.5" />
        </div>
        <h3 className="text-sm font-semibold text-foreground">{d.gaugeTitle}</h3>
      </div>

      <div className="relative mt-3 flex items-center justify-center" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--color-cyan-500)" strokeOpacity={0.15} strokeWidth={STROKE_WIDTH} />
          {total > 0 && (
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--color-cyan-400)"
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${CIRCUMFERENCE - dash}`}
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
          )}
        </svg>
        <span className="absolute text-2xl font-bold tabular-nums text-foreground">{total > 0 ? `${percent}%` : "—"}</span>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">{total > 0 ? d.gaugeCaption(approved, total) : d.gaugeEmptyLabel}</p>
      {pendingReview > 0 && (
        <span
          className={cn(
            "mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-300"
          )}
        >
          {d.gaugePendingLabel(pendingReview)}
        </span>
      )}
    </Link>
  )
}
