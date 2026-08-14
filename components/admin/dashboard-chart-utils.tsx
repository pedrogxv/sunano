"use client"

// Fuso fixo do site (ver lib/server/time.ts) — os labels de eixo X dos
// gráficos do dashboard admin (Atividade da comunidade, Visitantes) usam o
// mesmo fuso pra não desalinhar dia/mês exibido do dado agregado no servidor.
const SITE_TIMEZONE = "America/Sao_Paulo"

export function hourLabel(key: string): string {
  return `${key.padStart(2, "0")}h`
}

// `key` de um ponto diário é uma data ISO (YYYY-MM-DD); ancorado em meio-dia
// UTC pra formatar o dia da semana sem risco de cair no dia anterior por
// causa do fuso.
export function weekdayLabel(key: string, locale: string): string {
  const date = new Date(`${key}T12:00:00Z`)
  return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: SITE_TIMEZONE }).format(date).replace(".", "")
}

// `key` de um ponto mensal é "YYYY-MM"; ancorado no dia 15 pra não cruzar de
// mês por causa do fuso.
export function monthLabel(key: string, locale: string): string {
  const date = new Date(`${key}-15T12:00:00Z`)
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: SITE_TIMEZONE }).format(date).replace(".", "")
}

// Rótulo fixo de valor sobre cada ponto do gráfico (além do tooltip on hover).
// `showAll` quando há poucos pontos (dia/semana); com muitos pontos (ex. ano,
// 12 meses) mostra só o valor de pico pra não poluir o gráfico.
export type ValueLabelProps = {
  x?: number | string
  y?: number | string
  value?: number | string | boolean | null
}

export function makeValueLabel(showAll: boolean, peakValue: number) {
  return function ValueLabel({ x, y, value }: ValueLabelProps) {
    if (typeof value !== "number" || (!showAll && value !== peakValue)) return null
    return (
      <text x={x} y={Number(y ?? 0) - 8} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--foreground)">
        {value.toLocaleString("pt-BR")}
      </text>
    )
  }
}

export type TooltipPayloadItem = { value?: number; payload?: { label?: string } }

export function ChartTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayloadItem[] }) {
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
