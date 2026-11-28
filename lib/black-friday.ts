/**
 * Campanha de Black Friday da Loja. Fonte única do prazo e do visual: a
 * seção de Destaques (StoreContent) e o card (ProductCard) leem daqui.
 *
 * Fim: 01/12 à meia-noite, horário de Brasília (virada para 02/12). Passado o
 * prazo, a Home volta sozinha para "Selecionados da semana" com os cards
 * normais, sem deploy.
 */
export const BLACK_FRIDAY_ENDS_AT = "2026-12-02T00:00:00-03:00"

const ENDS_AT_MS = new Date(BLACK_FRIDAY_ENDS_AT).getTime()

export function blackFridayMsLeft(now: number = Date.now()): number {
  return Math.max(0, ENDS_AT_MS - now)
}

export function isBlackFridayActive(now: number = Date.now()): boolean {
  return blackFridayMsLeft(now) > 0
}

/** Card preto com borda dourada girando (estilos `.bf-card*` em globals.css). */
export const BLACK_FRIDAY_CARD_CLASS = "bf-card border-0 bg-transparent"
