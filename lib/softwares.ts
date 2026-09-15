/**
 * Tipos e regras compartilhadas da página /softwares (hub dos web softwares
 * das marcas). Módulo puro: usado pelo repositório, pelas rotas e pelos
 * componentes do cliente.
 */

export type Software = {
  id: string
  brandId: string
  /** Nome exibido no card: sempre o nome da marca. */
  name: string
  logoUrl: string
  hubUrl: string
}

/** Quantos cards aparecem em "Mais usados". */
export const MOST_USED_SOFTWARES_LIMIT = 4

/** Janela de cliques considerada em "Mais usados", em dias. */
export const MOST_USED_SOFTWARES_WINDOW_DAYS = 30

/** Ordem alfabética pelo nome da marca, sem diferenciar maiúscula e acento. */
export function compareSoftwareNames(a: Pick<Software, "name">, b: Pick<Software, "name">): number {
  return a.name.localeCompare(b.name, "pt-BR", { sensitivity: "base" })
}

/** Resposta de `GET /api/softwares/favorites`. */
export type SoftwareFavoritesState = {
  authenticated: boolean
  isVip: boolean
  /** Ids favoritados, na ordem salva. */
  ids: string[]
  limit: number
  /** Só VIP escolhe a ordem; conta comum vê os favoritos em ordem alfabética. */
  canReorder: boolean
}
