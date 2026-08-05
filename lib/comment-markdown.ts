/**
 * Markdown mínimo dos comentários: por ora, só `**negrito**`.
 *
 * Devolve segmentos de texto em vez de uma string de HTML. Quem renderiza
 * monta `<strong>` como elemento React (ver `components/comments/CommentBody`),
 * então o corpo do comentário nunca passa por `dangerouslySetInnerHTML` — o
 * React escapa cada segmento sozinho. É por isso que não há DOMPurify aqui:
 * sem string de HTML no meio do caminho, não existe HTML a sanitizar, e o
 * projeto não ganha uma dependência (nem um sanitizador mal configurado) para
 * suportar dois asteriscos.
 *
 * O texto é guardado cru no banco (com os `**`), como o usuário digitou: a
 * formatação é decidida na exibição, então dá pra reabrir o mesmo texto na
 * edição e mudar o parser depois sem migrar dado nenhum.
 */

export type CommentSegment = { text: string; bold: boolean }

// Sem a flag `s` de propósito: `.` não atravessa quebra de linha, então um
// `**` solto no início não consegue emborrachar o comentário inteiro caso
// apareça outro `**` parágrafos abaixo. Negrito é sempre dentro de uma linha.
const BOLD_PATTERN = /\*\*(.+?)\*\*/g

/** Quebra o corpo do comentário em trechos normais e trechos em negrito. */
export function parseCommentMarkdown(body: string): CommentSegment[] {
  const segments: CommentSegment[] = []
  let cursor = 0

  for (const match of body.matchAll(BOLD_PATTERN)) {
    const start = match.index ?? 0
    if (start > cursor) segments.push({ text: body.slice(cursor, start), bold: false })
    segments.push({ text: match[1], bold: true })
    cursor = start + match[0].length
  }

  if (cursor < body.length) segments.push({ text: body.slice(cursor), bold: false })
  return segments
}
