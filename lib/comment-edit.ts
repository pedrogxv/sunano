/**
 * Janela de edição de comentário: o autor pode reescrever o que publicou por
 * 15 minutos; depois disso o comentário fica imutável.
 *
 * Fica fora de `lib/server` de propósito, porque os dois lados precisam da
 * mesma regra: a UI decide se mostra o botão "Editar" e o repositório decide
 * se aplica o update. Quem autoriza é o servidor — o cliente só evita
 * oferecer um botão que ia falhar (o relógio dele pode estar adiantado, e aí
 * a API responde 403 com a mensagem certa).
 */

export const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000

/** Instante (ms epoch) em que a janela de edição fecha. `NaN` se a data for inválida. */
export function commentEditDeadline(createdAt: string | Date): number {
  const created = createdAt instanceof Date ? createdAt : new Date(createdAt)
  return created.getTime() + COMMENT_EDIT_WINDOW_MS
}

/** Se o comentário ainda está dentro da janela de edição no instante `now`. */
export function canEditComment(createdAt: string | Date, now: number = Date.now()): boolean {
  const deadline = commentEditDeadline(createdAt)
  return Number.isFinite(deadline) && now < deadline
}
