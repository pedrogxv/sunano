/** Máximo aceito no campo "Resumo / excerpt" do admin. */
export const EXCERPT_MAX_CHARS = 1500

/** Quanto do excerpt aparece no card de manchete antes do "Ler mais". */
export const HEADLINE_EXCERPT_LIMIT = 1200

/**
 * Corta o excerpt para o card de manchete sem partir palavra no meio.
 * Só recua até o último espaço se ele não estiver longe demais do limite —
 * caso contrário (texto sem espaços, como uma URL gigante) corta seco.
 */
export function truncateExcerpt(text: string, limit: number = HEADLINE_EXCERPT_LIMIT) {
  if (text.length <= limit) return { text, truncated: false as const }

  const slice = text.slice(0, limit)
  const lastSpace = slice.lastIndexOf(" ")
  const cut = lastSpace > limit * 0.8 ? slice.slice(0, lastSpace) : slice

  return { text: `${cut.trimEnd()}…`, truncated: true as const }
}
