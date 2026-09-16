/**
 * Formata a data da "última atualização" da Tierlist.
 *
 * Antes `TierlistPageHeader` e `TierlistInfo` importavam `date-fns` +
 * `date-fns/locale` (enUS e ptBR) só para formatar uma data — bundle grande
 * para um `<time>` só. `Intl.DateTimeFormat` é nativo e cobre os dois idiomas.
 */
export function formatTierlistDate(iso: string, locale: "pt-BR" | "en-US"): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

/**
 * "há 3 dias" / "3 days ago" para o último acesso na listagem do admin.
 *
 * `Intl.RelativeTimeFormat` pelo mesmo motivo do formatador acima: importar
 * `date-fns/locale` só por um rótulo de tempo relativo por linha da lista não
 * se paga. Devolve só o trecho relativo — quem chama decide o entorno.
 */
export function formatRelativeTime(iso: string, locale: "pt-BR" | "en-US"): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  const seconds = Math.round((date.getTime() - Date.now()) / 1000)
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" })

  const steps: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 60 * 60 * 24 * 365],
    ["month", 60 * 60 * 24 * 30],
    ["day", 60 * 60 * 24],
    ["hour", 60 * 60],
    ["minute", 60],
  ]

  for (const [unit, secondsPerUnit] of steps) {
    if (Math.abs(seconds) >= secondsPerUnit) {
      return rtf.format(Math.round(seconds / secondsPerUnit), unit)
    }
  }
  return rtf.format(Math.round(seconds), "second")
}
