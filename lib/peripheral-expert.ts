/**
 * Autor do card "Comentários de Especialista" na página do periférico.
 *
 * O texto do card sempre foi escrito por uma pessoa só (o Sunano), mas a
 * intenção é que a comunidade assuma parte das análises — então cada item
 * guarda quem assinou aquele comentário em `specs.details.expertAuthor`.
 *
 * É um retrato (snapshot) do perfil, não um join: `peripherals` não tem FK para
 * `profiles`, o preview do formulário de admin precisa renderizar o autor antes
 * de existir uma linha salva, e a página do periférico já é pesada de queries.
 * O preço disso é que trocar o nome de exibição não repropaga sozinho — quem
 * reabrir e salvar o item no admin regrava o retrato atualizado.
 */
/**
 * Teto do texto do card, contado no valor gravado em `specs.details.summary`
 * (o markdown, não só o que aparece). O card mostra o comentário inteiro, sem
 * rolagem interna — sem limite, um texto longo empurraria o resto da página.
 * Formulário e rotas de admin leem daqui, então os dois recusam igual.
 */
export const PERIPHERAL_EXPERT_COMMENT_MAX_LENGTH = 2500

export const PERIPHERAL_EXPERT_COMMENT_TOO_LONG = `O comentário pode ter no máximo ${PERIPHERAL_EXPERT_COMMENT_MAX_LENGTH} caracteres.`

/** true quando `specs.details.summary` passa do teto. Sem texto, não passa. */
export function isExpertCommentTooLong(specs: Record<string, unknown> | undefined): boolean {
  const details = specs?.details
  if (!details || typeof details !== "object") return false
  const summary = (details as Record<string, unknown>).summary
  return typeof summary === "string" && summary.length > PERIPHERAL_EXPERT_COMMENT_MAX_LENGTH
}

export type PeripheralExpertAuthor = {
  userId: string
  displayName: string
  displaySlug: string | null
  avatarUrl: string | null
}

/** Lê o retrato gravado em `specs.details.expertAuthor`, ignorando lixo/legado. */
export function parseExpertAuthor(value: unknown): PeripheralExpertAuthor | null {
  if (!value || typeof value !== "object") return null
  const raw = value as Record<string, unknown>
  if (typeof raw.userId !== "string" || !raw.userId) return null
  if (typeof raw.displayName !== "string" || !raw.displayName) return null

  return {
    userId: raw.userId,
    displayName: raw.displayName,
    displaySlug: typeof raw.displaySlug === "string" ? raw.displaySlug : null,
    avatarUrl: typeof raw.avatarUrl === "string" ? raw.avatarUrl : null,
  }
}
