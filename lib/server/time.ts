import "server-only"

// O site é 100% BR — datas e horas do dashboard precisam fechar no fuso de
// Brasília, não em UTC. Brasil não observa mais horário de verão (fixo em
// UTC-3), então esse offset é seguro de usar sem tabela de transições.
export const SITE_TIMEZONE = "America/Sao_Paulo"
const SITE_UTC_OFFSET_HOURS = 3

export function isoDateInTimeZone(date: Date, timeZone: string = SITE_TIMEZONE): string {
  // en-CA formata como YYYY-MM-DD, o mesmo formato do tipo `date` do Postgres.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

export function todayIso(): string {
  return isoDateInTimeZone(new Date())
}

export function hourInTimeZone(date: Date, timeZone: string = SITE_TIMEZONE): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone, hour: "2-digit", hour12: false }).format(date))
}

// Ancora em meio-dia UTC antes de formatar de volta no fuso do site: como o
// Brasil é fixo em UTC-3, meio-dia UTC nunca cruza a virada do dia local,
// então a data resultante é sempre exata.
export function addDaysIso(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number)
  return isoDateInTimeZone(new Date(Date.UTC(year, month - 1, day + days, 12)))
}

/** Instante UTC correspondente à meia-noite local (America/Sao_Paulo) de uma data ISO. */
export function startOfDayUtc(dateIso: string): Date {
  return new Date(`${dateIso}T${String(SITE_UTC_OFFSET_HOURS).padStart(2, "0")}:00:00.000Z`)
}
