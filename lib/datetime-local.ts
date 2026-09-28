/**
 * Ponte entre o `<input type="datetime-local">` e o banco.
 *
 * O banco guarda UTC (ISO); o input fala no fuso de quem está no painel e não
 * tem fuso na string ("2026-09-28T10:00"). Usado pelos agendamentos do
 * painel (banners da Home, Hero e barra comercial da Loja).
 */

export function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

/** "28/09, 10:00": data curta para listas do painel. */
export function formatShortDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}
