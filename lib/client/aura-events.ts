/**
 * Evento disparado no `window` sempre que uma reação de aura (like/dislike em
 * comentário) é confirmada pelo servidor — o badge de saldo na TopBar
 * (`AuraMissionsBadge`) escuta isso pra refazer o fetch na hora, em vez de
 * esperar o próximo tick do polling.
 */
export const AURA_CHANGED_EVENT = "aura:changed"

export function notifyAuraChanged() {
  window.dispatchEvent(new Event(AURA_CHANGED_EVENT))
}
