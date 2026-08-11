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
    <div className="rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-5 w-28" />
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-4 h-3 w-full" />
      <Skeleton className="mt-1.5 h-3 w-full" />
    </div>
  )
}

/**
 * Card de Visitantes do dashboard admin — abas Dia/Semana/Mês/Total (número do
 * período + variação % vs. período anterior equivalente) e, sempre visível
 * abaixo, uma barra comparando hoje com ontem. Reaproveita os mesmos dados de
 * `getVisitStats` (visits-repository.ts) já usados pelos tiles de visão geral.
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

  const compareMax = Math.max(stats.today, stats.yesterday, 1)
  const todayWidth = stats.today > 0 ? Math.max((stats.today / compareMax) * 100, 2) : 0
  const yesterdayWidth = stats.yesterday > 0 ? Math.max((stats.yesterday / compareMax) * 100, 2) : 0

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-border bg-card p-4 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-fuchsia-500/15 text-fuchsia-300">
            <Eye className="size-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{d.statVisitorsCardTitle}</h3>
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

      <div className="mt-4 flex flex-wrap items-end gap-x-3 gap-y-1">
        <p className="text-3xl font-bold text-foreground">
          <AnimatedCounter value={current} duration={700} />
        </p>
        {delta && (
          <div className="mb-1 flex items-center gap-2">
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
            {previousLabel && <span className="text-xs text-muted-foreground">{previousLabel}</span>}
          </div>
        )}
      </div>

      <div className="mt-4 space-y-1.5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground/70">{d.statVisitorsCompareTitle}</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground">{d.statVisitorsTodayLabel}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
              <div className="h-full rounded-full bg-fuchsia-400 transition-all" style={{ width: `${todayWidth}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-foreground">{stats.today.toLocaleString("pt-BR")}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 shrink-0 text-xs text-muted-foreground">{d.statVisitorsYesterdayLabel}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/40">
              <div className="h-full rounded-full bg-fuchsia-400/40 transition-all" style={{ width: `${yesterdayWidth}%` }} />
            </div>
            <span className="w-10 shrink-0 text-right text-xs tabular-nums text-foreground">{stats.yesterday.toLocaleString("pt-BR")}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
