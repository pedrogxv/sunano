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
