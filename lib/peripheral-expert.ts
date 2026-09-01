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
