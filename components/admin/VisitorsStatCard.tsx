"use client"

import { useState } from "react"
import { Eye, TrendingDown, TrendingUp } from "lucide-react"

import { AnimatedCounter } from "@/components/animated-counter"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

export type VisitorsStats = {
  today: number
  uniqueToday: number
  returningToday: number
  yesterday: number
  week: number
  weekPrevious: number
  month: number
  monthPrevious: number
  total: number
}

type PeriodKey = "day" | "week" | "month" | "total"

function periodValues(stats: VisitorsStats, period: PeriodKey): { current: number; previous: number | null } {
  switch (period) {
    case "day":
      return { current: stats.today, previous: stats.yesterday }
    case "week":
      return { current: stats.week, previous: stats.weekPrevious }
    case "month":
      return { current: stats.month, previous: stats.monthPrevious }
    case "total":
      return { current: stats.total, previous: null }
  }
}

type Delta = { direction: "up" | "down" | "flat"; text: string }

/** Sem período anterior (aba Total) não há variação pra mostrar. Período anterior
 * zerado vira "novo" em vez de uma % absurda (ex.: 0 → 5 não é "+∞%"). */
function computeDelta(current: number, previous: number | null, newLabel: string): Delta | null {
  if (previous === null) return null
  if (previous === 0) {
    return current === 0 ? { direction: "flat", text: "0%" } : { direction: "up", text: newLabel }
  }
  const pct = Math.round(((current - previous) / previous) * 100)
  if (pct === 0) return { direction: "flat", text: "0%" }
  return { direction: pct > 0 ? "up" : "down", text: `${pct > 0 ? "+" : ""}${pct}%` }
}

function VisitorsStatCardSkeleton() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card p-3">
      <Skeleton className="size-7 shrink-0 rounded-lg" />
      <div className="flex-1">
        <Skeleton className="h-6 w-16" />
        <Skeleton className="mt-1.5 h-3 w-24" />
      </div>
      <Skeleton className="h-8 w-32 shrink-0 rounded-lg" />
    </div>
  )
}

/**
 * Card de Visitantes do dashboard admin — uma tira compacta (mesmo peso
 * visual dos outros tiles de visão geral) com abas Dia/Semana/Mês/Total
 * inline: número do período selecionado + variação % vs. período anterior
 * equivalente. Reaproveita `getVisitStats` (visits-repository.ts), já usado
 * pelos outros tiles.
 */
export function VisitorsStatCard({ stats, loading }: { stats: VisitorsStats | null; loading: boolean }) {
  const t = useT()
  const d = t.admin.dashboard
  const [period, setPeriod] = useState<PeriodKey>("day")

  if (loading || !stats) return <VisitorsStatCardSkeleton />

  const tabs: { key: PeriodKey; label: string }[] = [
    { key: "day", label: d.statVisitorsTabDay },
    { key: "week", label: d.statVisitorsTabWeek },
    { key: "month", label: d.statVisitorsTabMonth },
    { key: "total", label: d.statVisitorsTabTotal },
  ]

  const { current, previous } = periodValues(stats, period)
  const delta = computeDelta(current, previous, d.statVisitorsNewLabel)
  const previousLabel = period === "total" ? null : d.statVisitorsPreviousLabel(period)

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-3 duration-300">
      <div className="flex items-center gap-3">
        <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-300">
          <Eye className="size-3.5" />
        </div>
        <div className="flex items-baseline gap-x-2 gap-y-0.5 flex-wrap">
          <p className="text-2xl font-bold tabular-nums text-foreground">
            <AnimatedCounter value={current} duration={700} />
          </p>
          <span className="text-xs text-muted-foreground">{d.statVisitorsCardTitle}</span>
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium",
                delta.direction === "up" && "bg-emerald-500/15 text-emerald-300",
                delta.direction === "down" && "bg-rose-500/15 text-rose-300",
                delta.direction === "flat" && "bg-muted text-muted-foreground"
              )}
            >
              {delta.direction === "up" && <TrendingUp className="size-3" />}
              {delta.direction === "down" && <TrendingDown className="size-3" />}
              {delta.text}
            </span>
          )}
          {previousLabel && <span className="text-xs text-muted-foreground">{previousLabel}</span>}
        </div>
      </div>
      <Tabs value={period} onValueChange={(value) => setPeriod(value as PeriodKey)}>
        <TabsList>
          {tabs.map((tab) => (
            <TabsTrigger key={tab.key} value={tab.key} className="px-2.5 text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </div>
  )
}
