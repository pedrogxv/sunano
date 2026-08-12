"use client"

import { useState } from "react"
import { Activity, Zap } from "lucide-react"
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis } from "recharts"

import { AnimatedCounter } from "@/components/animated-counter"
import { useLocale } from "@/components/providers/locale-context"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { PerformanceSeries } from "@/lib/server/repositories/dashboard-performance-repository"
import { useT } from "@/lib/use-t"

type RangeKey = "today" | "week"

const SITE_TIMEZONE = "America/Sao_Paulo"

function hourLabel(key: string): string {
  return `${key.padStart(2, "0")}h`
}

// `key` de um ponto diário é uma data ISO (YYYY-MM-DD); ancorado em meio-dia
// UTC pra formatar o dia da semana sem risco de cair no dia anterior por
// causa do fuso.
function weekdayLabel(key: string, locale: string): string {
  const date = new Date(`${key}T12:00:00Z`)
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: SITE_TIMEZONE }).format(date).replace(".", "")
}

function PerformanceCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <Skeleton className="h-5 w-40" />
      <Skeleton className="mt-4 h-8 w-28" />
      <Skeleton className="mt-6 h-[180px] w-full rounded-lg" />
    </div>
  )
}

type TooltipPayloadItem = { value?: number; payload?: { label?: string } }

function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
  if (!active || !payload?.length) return null
  const point = payload[0]
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-muted-foreground">{point.payload?.label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 font-semibold text-foreground">
        <span className="inline-block h-0.5 w-3 rounded-full bg-violet-400" />
        {point.value?.toLocaleString("pt-BR")}
      </p>
    </div>
  )
}

/**
 * Gráfico de "atividade da comunidade" do dashboard admin — novos posts +
 * comentários (fórum e blog), com toggle Hoje (por bloco de 3h) / Semana
 * (últimos 7 dias). Aura gerada no período aparece como estatística
 * secundária ao lado do total, sem entrar no gráfico (evita eixo duplo —
 * unidades diferentes, posts/comentários vs. pontos de aura).
 */
export function PerformanceCard({ data, loading }: { data: PerformanceSeries | null; loading: boolean }) {
  const t = useT()
  const d = t.admin.dashboard
  const { locale } = useLocale()
  const [range, setRange] = useState<RangeKey>("today")

  if (loading || !data) return <PerformanceCardSkeleton />

  const points = range === "today" ? data.hourly : data.daily
  const chartData = points.map((p) => ({
    label: range === "today" ? hourLabel(p.key) : weekdayLabel(p.key, locale),
    interactions: p.interactions,
    aura: p.aura,
  }))

  const totalInteractions = points.reduce((sum, p) => sum + p.interactions, 0)
  const totalAura = points.reduce((sum, p) => sum + p.aura, 0)

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 rounded-2xl border border-border bg-card p-4 duration-300">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="flex size-7 items-center justify-center rounded-lg bg-violet-500/15 text-violet-300">
            <Activity className="size-3.5" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{d.performanceCardTitle}</h3>
        </div>
        <Tabs value={range} onValueChange={(value) => setRange(value as RangeKey)}>
          <TabsList>
            <TabsTrigger value="today" className="px-2.5 text-xs">
              {d.performanceTabToday}
            </TabsTrigger>
            <TabsTrigger value="week" className="px-2.5 text-xs">
              {d.performanceTabWeek}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-1.5">
        <div>
          <p className="text-3xl font-bold text-foreground">
            <AnimatedCounter value={totalInteractions} duration={700} />
          </p>
          <p className="text-xs text-muted-foreground">{d.performanceInteractionsLabel}</p>
        </div>
        <div className="mb-1 flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-xs font-medium text-amber-300">
          <Zap className="size-3" />+{totalAura.toLocaleString("pt-BR")} {d.performanceAuraLabel}
        </div>
      </div>

      <div className="mt-4 h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="performanceFill" x1="0" y1="0" x2="0" y2="1">
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
              dataKey="interactions"
              stroke="var(--color-violet-400)"
              strokeWidth={2}
              fill="url(#performanceFill)"
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--card)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
