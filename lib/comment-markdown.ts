/**
 * Markdown mínimo de comentários e posts do fórum: `**negrito**`, `*itálico*`,
 * `__sublinhado__` e `[texto](url)` para link.
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
  /** URL de destino quando o segmento veio de `[texto](url)`; `null` senão. */
  href: string | null
}

// Sem a flag `s` de propósito: `.` não atravessa quebra de linha, então um
// marcador solto no início não consegue engolir o texto inteiro caso apareça
// outro marcador parágrafos abaixo. Negrito/itálico/sublinhado/link são
// sempre dentro de uma linha.
const LINK_PATTERN = /\[([^[\]]+)\]\((https?:\/\/[^\s()]+)\)/g
const BOLD_PATTERN = /\*\*(.+?)\*\*/g
const ITALIC_PATTERN = /\*(.+?)\*/g
const UNDERLINE_PATTERN = /__(.+?)__/g

const PLAIN_SEGMENT = { bold: false, italic: false, underline: false, href: null }

/** Quebra o corpo em trechos normais, negrito, itálico, sublinhado e link. */
export function parseTextMarkdown(body: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of body.matchAll(LINK_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    if (start > cursor) segments.push(...parseBold(body.slice(cursor, start)))
    // O texto do link não passa pelas outras camadas (negrito/itálico dentro
    // de um link não é um caso que a UI precisa cobrir) — mesma simplicidade
    // do resto do parser: um marcador, um tipo de segmento.
    segments.push({ text: match[1], ...PLAIN_SEGMENT, href: match[2] })
    cursor = start + match[0].length
  }

  if (cursor < body.length) segments.push(...parseBold(body.slice(cursor)))
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
    if (start > cursor) segments.push({ text: text.slice(cursor, start), ...PLAIN_SEGMENT })
    segments.push({ text: match[1], ...PLAIN_SEGMENT, underline: true })
    cursor = start + match[0].length
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), ...PLAIN_SEGMENT })
  return segments
}
