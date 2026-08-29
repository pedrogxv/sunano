/**
 * Markdown mínimo de comentários, posts do fórum e descrições de produto:
 * `**negrito**`, `*itálico*`, `__sublinhado__`, `==destaque==`,
 * `[texto](url)` para link, `- item` (início de linha) para lista com bolinha
 * e `#`/`##`/`###` (início de linha) para título (h1/h2/h3). URL digitada solta
 * também vira link, com o próprio endereço como texto (ver `parseAutoLinks`).
 *
 * Devolve segmentos de texto em vez de uma string de HTML. Quem renderiza
 * monta `<strong>`/`<em>`/`<u>`/`<a>` como elemento React (ver `components/comments/CommentBody`),
 * então o corpo nunca passa por `dangerouslySetInnerHTML` — o React escapa cada
 * segmento sozinho. É por isso que não há DOMPurify aqui: sem string de HTML
 * no meio do caminho, não existe HTML a sanitizar, e o projeto não ganha uma
 * dependência (nem um sanitizador mal configurado) para suportar isso.
 *
 * O texto é guardado cru no banco (com os marcadores), como o usuário digitou:
 * a formatação é decidida na exibição, então dá pra reabrir o mesmo texto na
 * edição e mudar o parser depois sem migrar dado nenhum.
 */

export type TextSegment = {
  text: string
  bold: boolean
  italic: boolean
  underline: boolean
  highlight: boolean
  /** URL de destino quando o segmento veio de `[texto](url)`; `null` senão. */
  href: string | null
}

// Sem a flag `s` de propósito: `.` não atravessa quebra de linha, então um
// marcador solto no início não consegue engolir o texto inteiro caso apareça
// outro marcador parágrafos abaixo. Negrito/itálico/sublinhado/link são
// sempre dentro de uma linha.
const LINK_PATTERN = /\[([^[\]]+)\]\((https?:\/\/[^\s()]+)\)/g
// URL solta, digitada sem o `[texto](url)`. Cobre só http(s): esquemas como
// `javascript:` nunca viram link (e `classifyLink` recusaria de novo na hora
// de renderizar). O `[^\s<>"']` deixa o link terminar no primeiro espaço.
const BARE_URL_PATTERN = /https?:\/\/[^\s<>"']+/g
// Pontuação de fechamento colada no fim ("veja https://x.com/a." ou
// "(https://x.com/a)") é do texto, não do link — mesma limpeza de `extractFirstUrl`.
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/
const BOLD_PATTERN = /\*\*(.+?)\*\*/g
const ITALIC_PATTERN = /\*(.+?)\*/g
const UNDERLINE_PATTERN = /__(.+?)__/g
const HIGHLIGHT_PATTERN = /==(.+?)==/g

const PLAIN_SEGMENT = { bold: false, italic: false, underline: false, highlight: false, href: null }

export type TextLine = {
  /** true quando a linha começa com "- " — vira item de lista com bolinha. */
  bullet: boolean
  /** 1/2/3 quando a linha começa com "#"/"##"/"###", null senão — vira h1/h2/h3. */
  heading: 1 | 2 | 3 | null
  segments: TextSegment[]
}

// Só no início da linha (após espaços) — "- " no meio do texto é hífen normal.
const BULLET_PATTERN = /^[ \t]*-[ \t]+/
// Idem para "#": só conta como heading no início da linha, até 3 níveis
// (h4+ não tem caso de uso aqui — descrição de produto, não documento longo).
const HEADING_PATTERN = /^[ \t]*(#{1,3})[ \t]+/

/**
 * Quebra o corpo em linhas, marcando quais começam com "- " (bullet) ou
 * "#"/"##"/"###" (heading). Cada linha já vem com o markdown inline
 * (`parseTextMarkdown`) aplicado ao restante do texto. Quem renderiza agrupa
 * linhas-bullet consecutivas num `<ul>` e as demais em parágrafos (ver
 * `FormattedText`/`CommentBody`).
 */
export function parseTextLines(body: string): TextLine[] {
  return body.split("\n").map((line) => {
    const bulletMatch = line.match(BULLET_PATTERN)
    if (bulletMatch) {
      return { bullet: true, heading: null, segments: parseTextMarkdown(line.slice(bulletMatch[0].length)) }
    }
    const headingMatch = line.match(HEADING_PATTERN)
    if (headingMatch) {
      const level = headingMatch[1].length as 1 | 2 | 3
      return { bullet: false, heading: level, segments: parseTextMarkdown(line.slice(headingMatch[0].length)) }
    }
    return { bullet: false, heading: null, segments: parseTextMarkdown(line) }
  })
}

/** Quebra o corpo em trechos normais, negrito, itálico, sublinhado e link. */
export function parseTextMarkdown(body: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of body.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    if (start > cursor) segments.push(...parseAutoLinks(body.slice(cursor, start)))
    // O texto do link não passa pelas outras camadas (negrito/itálico dentro
    // de um link não é um caso que a UI precisa cobrir) — mesma simplicidade
    // do resto do parser: um marcador, um tipo de segmento.
    segments.push({ text: match[1], ...PLAIN_SEGMENT, href: match[2] })
    cursor = start + match[0].length
  }

  if (cursor < body.length) segments.push(...parseAutoLinks(body.slice(cursor)))
  return segments
}

/**
 * Transforma URL digitada solta em link, com o próprio endereço como texto.
 *
 * Roda depois do `[texto](url)` (a URL de dentro dos parênteses já foi
 * consumida ali) e antes de negrito/itálico, senão um `*` no meio de uma
 * query string viraria marcador de itálico e picaria o endereço no meio.
 */
function parseAutoLinks(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(BARE_URL_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    const url = match[0].replace(TRAILING_PUNCTUATION, "")
    // Sobrou só pontuação depois de limpar ("https://." e afins): não é link.
    if (!/^https?:\/\/[^\s.]/.test(url)) continue
    if (start > cursor) segments.push(...parseBold(text.slice(cursor, start)))
    segments.push({ text: url, ...PLAIN_SEGMENT, href: url })
    cursor = start + url.length
  }

  if (cursor < text.length) segments.push(...parseBold(text.slice(cursor)))
  return segments
}

function parseBold(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(BOLD_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    if (start > cursor) segments.push(...parseItalic(text.slice(cursor, start)))
    segments.push({ text: match[1], ...PLAIN_SEGMENT, bold: true })
    cursor = start + match[0].length
  }

  if (cursor < text.length) segments.push(...parseItalic(text.slice(cursor)))
  return segments
}

function parseItalic(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(ITALIC_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    if (start > cursor) segments.push(...parseUnderline(text.slice(cursor, start)))
    segments.push({ text: match[1], ...PLAIN_SEGMENT, italic: true })
    cursor = start + match[0].length
  }

  if (cursor < text.length) segments.push(...parseUnderline(text.slice(cursor)))
  return segments
}

function parseUnderline(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(UNDERLINE_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    if (start > cursor) segments.push(...parseHighlight(text.slice(cursor, start)))
    segments.push({ text: match[1], ...PLAIN_SEGMENT, underline: true })
    cursor = start + match[0].length
  }

  if (cursor < text.length) segments.push(...parseHighlight(text.slice(cursor)))
  return segments
}

function parseHighlight(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(HIGHLIGHT_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    if (start > cursor) segments.push({ text: text.slice(cursor, start), ...PLAIN_SEGMENT })
    segments.push({ text: match[1], ...PLAIN_SEGMENT, highlight: true })
    cursor = start + match[0].length
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), ...PLAIN_SEGMENT })
  return segments
}
