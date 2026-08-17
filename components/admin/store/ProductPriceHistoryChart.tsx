"use client"

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"
import { formatBRL } from "@/lib/format"

export type PriceHistoryPoint = {
  id: string
  variant_id: string | null
  price_cents: number
  promo_price_cents: number | null
  final_price_cents: number
  created_at: string
}

const LINE_COLORS = [
  "var(--color-emerald-400)",
  "var(--color-violet-400)",
  "var(--color-amber-400)",
  "var(--color-sky-400)",
  "var(--color-rose-400)",
]

const SITE_TIMEZONE = "America/Sao_Paulo"

function pointLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: SITE_TIMEZONE }).format(
    new Date(iso)
  )
}

type ChartTooltipItem = { dataKey?: string; value?: number; color?: string }

function PriceHistoryTooltip({
  active,
  payload,
  label,
  seriesLabels,
}: {
  active?: boolean
  payload?: ChartTooltipItem[]
  label?: string
  seriesLabels: Record<string, string>
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-lg">
      <p className="text-muted-foreground">{label}</p>
      {payload
        .filter((item) => typeof item.value === "number")
        .map((item) => (
          <p key={item.dataKey} className="mt-0.5 flex items-center gap-1.5 font-semibold text-foreground">
            <span className="inline-block h-0.5 w-3 rounded-full" style={{ backgroundColor: item.color }} />
            {seriesLabels[item.dataKey as string] ?? item.dataKey}: {formatBRL(item.value as number)}
          </p>
        ))}
    </div>
  )
}

/**
 * Gráfico de histórico de preço/desconto do produto — admin only. Uma linha
 * por série (preço base + cada variante que já teve mudança de preço
 * registrada). Cada ponto é o preço final vigente (promo_price_cents, se
 * houver, senão o preço cheio) no momento do save que mudou o preço —
 * ver recordPriceHistoryIfChanged em store-repository.ts.
 */
export function ProductPriceHistoryChart({
  history,
  variantLabels,
}: {
  history: PriceHistoryPoint[]
  variantLabels: Record<string, string>
}) {
  if (history.length === 0) return null

  const seriesKeys = Array.from(new Set(history.map((h) => h.variant_id ?? "base")))
  const seriesLabels: Record<string, string> = {}
  for (const key of seriesKeys) {
    seriesLabels[key] = key === "base" ? "Preço base" : (variantLabels[key] ?? "Variante")
  }

  const timestamps = Array.from(new Set(history.map((h) => h.created_at))).sort()
  const chartData = timestamps.map((ts) => {
    const row: Record<string, number | string> = { label: pointLabel(ts) }
    for (const point of history.filter((h) => h.created_at === ts)) {
      row[point.variant_id ?? "base"] = point.final_price_cents / 100
    }
    return row
  })

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-foreground">Histórico de preço</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Preço final vigente ao longo do tempo, a cada mudança de preço ou desconto.
      </p>

      <div className="mt-4 flex flex-wrap gap-3">
        {seriesKeys.map((key, i) => (
          <span key={key} className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className="inline-block h-0.5 w-3 rounded-full"
              style={{ backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }}
            />
            {seriesLabels[key]}
          </span>
        ))}
      </div>

      <div className="mt-3 h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="0" />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
              tickFormatter={(value: number) => formatBRL(Math.round(value * 100))}
              width={72}
            />
            <Tooltip content={<PriceHistoryTooltip seriesLabels={seriesLabels} />} cursor={{ stroke: "var(--border)", strokeWidth: 1 }} />
            {seriesKeys.map((key, i) => (
              <Line
                key={key}
                type="monotone"
                dataKey={key}
                stroke={LINE_COLORS[i % LINE_COLORS.length]}
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
