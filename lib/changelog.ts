/**
 * Modelo das Patch Notes (`/changelog`). Módulo puro: o tipo das entradas em
 * `lib/i18n.ts` e a página leem daqui.
 *
 * Entrada antiga é só `items` (lista corrida). A partir da v0.5.0 a entrada
 * pode trazer `sections` (as mudanças agrupadas por área) e `highlights`
 * (os cards de destaque do topo). A página trata as duas formas: quem só tem
 * `items` aparece como uma lista sem área.
 */

export const CHANGELOG_AREAS = [
  "loja",
  "pedidos",
  "perifericos",
  "perfil",
  "aura",
  "seguranca",
  "desempenho",
] as const

export type ChangelogArea = (typeof CHANGELOG_AREAS)[number]

export type ChangelogSection = { area: ChangelogArea; items: string[] }

export type ChangelogHighlight = { area: ChangelogArea; title: string; body: string }

export type ChangelogEntryData = {
  version: string
  /** Nome da edição especial ("Vox Imaginum"). Entradas antigas o traziam dentro de `version`. */
  codename?: string
  date: string
  title: string
  description: string
  items: string[]
  sections?: ChangelogSection[]
  highlights?: ChangelogHighlight[]
}

export type NormalizedChangelogEntry = ChangelogEntryData & {
  /** Âncora da entrada (`#v0-5-0`), estável para link compartilhado. */
  id: string
  /** Versão sem o codinome ("v0.3.7"). */
  label: string
  /** Mês da entrega, para agrupar no trilho ("setembro", "September"). */
  month: string
  /** Todas as mudanças, com a área quando a entrada tem `sections`. */
  changes: { area: ChangelogArea | null; text: string }[]
}

/** "v0.3.7 · Vox Imaginum" → label "v0.3.7" + codename "Vox Imaginum". */
function splitVersion(version: string, codename?: string) {
  const [label, ...rest] = version.split(" · ")
  return { label: label.trim(), codename: codename ?? (rest.join(" · ").trim() || undefined) }
}

export function changelogEntryId(label: string) {
  return (
    label
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "versao"
  )
}

/** "24 de setembro" (pt-BR) ou "September 24" (en-US) → o nome do mês. */
function monthOf(date: string) {
  const pt = date.match(/de\s+([\p{L}]+)/u)
  if (pt) return pt[1]
  return date.match(/[\p{L}]+/u)?.[0] ?? date
}

export function normalizeChangelogEntries(entries: ChangelogEntryData[]): NormalizedChangelogEntry[] {
  const seen = new Map<string, number>()
  return entries.map((entry) => {
    const { label, codename } = splitVersion(entry.version, entry.codename)
    // Entradas antigas repetem o rótulo ("Agosto 2026" duas vezes): a âncora
    // ganha sufixo para continuar única.
    const base = changelogEntryId(label)
    const count = seen.get(base) ?? 0
    seen.set(base, count + 1)
    const id = count === 0 ? base : `${base}-${count + 1}`

    const changes = [
      ...(entry.sections ?? []).flatMap((s) => s.items.map((text) => ({ area: s.area, text }))),
      ...entry.items.map((text) => ({ area: null, text })),
    ]
    return { ...entry, id, label, codename, month: monthOf(entry.date), changes }
  })
}

/** Texto sem acento e em minúsculas, para a busca casar "promocao" com "Promoção". */
export function foldForSearch(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
}

/**
 * Quebra `text` nos trechos que casam com `query` (sem acento, sem caixa),
 * preservando o texto ORIGINAL de cada pedaço para a tela marcar.
 */
export function splitByMatch(text: string, query: string): { text: string; match: boolean }[] {
  const needle = foldForSearch(query.trim())
  if (!needle) return [{ text, match: false }]

  // Dobra caractere a caractere guardando de onde cada um veio: "ç" vira "c"
  // sem mudar de posição, então o índice no texto dobrado aponta o original.
  let folded = ""
  const origin: number[] = []
  let offset = 0
  for (const char of text) {
    for (const piece of foldForSearch(char)) {
      folded += piece
      origin.push(offset)
    }
    offset += char.length
  }

  const parts: { text: string; match: boolean }[] = []
  let cursor = 0
  let from = folded.indexOf(needle)
  while (from !== -1) {
    const start = origin[from]
    const lastFolded = from + needle.length - 1
    const end = lastFolded + 1 < origin.length ? origin[lastFolded + 1] : text.length
    if (start > cursor) parts.push({ text: text.slice(cursor, start), match: false })
    parts.push({ text: text.slice(start, end), match: true })
    cursor = end
    from = folded.indexOf(needle, from + needle.length)
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false })
  return parts
}

export function matchesSearch(text: string, query: string) {
  const needle = foldForSearch(query.trim())
  return needle.length > 0 && foldForSearch(text).includes(needle)
}
