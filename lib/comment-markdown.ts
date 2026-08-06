/**
 * Markdown mínimo de comentários e posts do fórum: `**negrito**` e `*itálico*`.
 *
 * Devolve segmentos de texto em vez de uma string de HTML. Quem renderiza
 * monta `<strong>`/`<em>` como elemento React (ver `components/comments/CommentBody`),
 * então o corpo nunca passa por `dangerouslySetInnerHTML` — o React escapa cada
 * segmento sozinho. É por isso que não há DOMPurify aqui: sem string de HTML
 * no meio do caminho, não existe HTML a sanitizar, e o projeto não ganha uma
 * dependência (nem um sanitizador mal configurado) para suportar isso.
 *
 * O texto é guardado cru no banco (com os `**`/`*`), como o usuário digitou: a
 * formatação é decidida na exibição, então dá pra reabrir o mesmo texto na
 * edição e mudar o parser depois sem migrar dado nenhum.
 */

export type TextSegment = { text: string; bold: boolean; italic: boolean }

// Sem a flag `s` de propósito: `.` não atravessa quebra de linha, então um
// marcador solto no início não consegue engolir o texto inteiro caso apareça
// outro marcador parágrafos abaixo. Negrito/itálico são sempre dentro de uma linha.
const BOLD_PATTERN = /\*\*(.+?)\*\*/g
const ITALIC_PATTERN = /\*(.+?)\*/g

/** Quebra o corpo em trechos normais, negrito e itálico. */
export function parseTextMarkdown(body: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of body.matchAll(BOLD_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    if (start > cursor) segments.push(...parseItalic(body.slice(cursor, start)))
    segments.push({ text: match[1], bold: true, italic: false })
    cursor = start + match[0].length
  }

  if (cursor < body.length) segments.push(...parseItalic(body.slice(cursor)))
  return segments
}

function parseItalic(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  let cursor = 0

  for (const match of text.matchAll(ITALIC_PATTERN)) {
    const start = match.index ?? 0
    if (start < cursor) continue
    if (start > cursor) segments.push({ text: text.slice(cursor, start), bold: false, italic: false })
    segments.push({ text: match[1], bold: false, italic: true })
    cursor = start + match[0].length
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor), bold: false, italic: false })
  return segments
}
