"use client"

import { useState } from "react"
import { Eye } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts"

import { AnimatedCounter } from "@/components/animated-counter"
import { useLocale } from "@/components/providers/locale-context"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartTooltip, hourLabel, makeValueLabel, monthLabel, weekdayLabel } from "@/components/admin/dashboard-chart-utils"
import type { VisitSeries } from "@/lib/server/repositories/visits-repository"
import { useT } from "@/lib/use-t"

type PeriodKey = "day" | "week" | "month" | "year"

function pointLabel(period: PeriodKey, key: string, locale: string, weekOfMonthLabel: (n: number) => string): string {
  switch (period) {
    case "day":
      return hourLabel(key)
    case "week":
      return weekdayLabel(key, locale)
    case "month":
      return weekOfMonthLabel(Number(key.replace("week-", "")))
    case "year":
      return monthLabel(key, locale)
  }
}

function VisitorsStatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-5 w-32" />
      <Skeleton className="mt-4 h-8 w-24" />
      <Skeleton className="mt-6 h-[180px] w-full rounded-lg" />
    </div>
  )
}

/**
 * Gráfico de "visitantes" do dashboard admin — mesmo estilo visual e mesma
 * estrutura do `PerformanceCard` (atividade da comunidade): número total do
 * período em destaque + área com linha roxa, com abas Dia/Semana/Mês/Ano.
 * Cada aba já vem pronta do servidor (`getVisitSeries`, visits-repository.ts)
 * num recorte diferente — dia por bloco de 3h, semana por dia, mês por
 * semana, ano por mês —, então trocar de aba não dispara nova requisição.
 * Sem dado real no período, mostra estado vazio em vez de forjar uma curva.
 */
export function VisitorsStatCard({ data, loading }: { data: VisitSeries | null; loading: boolean }) {
  const t = useT()
  const d = t.admin.dashboard
  const { locale } = useLocale()
  const [period, setPeriod] = useState<PeriodKey>("day")

  if (loading || !data) return <VisitorsStatCardSkeleton />

  const tabs: { key: PeriodKey; label: string }[] = [
    { key: "day", label: d.statVisitorsTabDay },
    { key: "week", label: d.statVisitorsTabWeek },
    { key: "month", label: d.statVisitorsTabMonth },
    { key: "year", label: d.statVisitorsTabYear },
  ]

  const points = data[period]
  const chartData = points.map((p) => ({
    label: pointLabel(period, p.key, locale, d.statVisitorsWeekOfMonth),
    count: p.count,
  }))

  const total = points.reduce((sum, p) => sum + p.count, 0)
  const peakCount = points.reduce((max, p) => Math.max(max, p.count), 0)
  const showAllLabels = chartData.length <= 8

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

      <div className="mt-4">
        <p className="text-3xl font-bold text-foreground">
          <AnimatedCounter value={total} duration={700} />
        </p>
        <p className="text-xs text-muted-foreground">{d.statVisitorsCaption(period)}</p>
      </div>

      {total === 0 ? (
        <div className="mt-4 flex h-[180px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/60 text-center">
          <Eye className="size-6 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">{d.statVisitorsEmpty}</p>
        </div>
      ) : (
        <div className="mt-4 h-[180px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="visitorsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--color-violet-400)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--color-violet-400)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
                interval="preserveStartEnd"
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
              <Area
                type="monotone"
                dataKey="count"
                stroke="var(--color-violet-400)"
                strokeWidth={2}
                fill="url(#visitorsFill)"
                activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
                label={makeValueLabel(showAllLabels, peakCount)}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
