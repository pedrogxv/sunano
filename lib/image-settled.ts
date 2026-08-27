/**
 * Imagem que já está no cache do browser dispara `load` antes do React anexar
 * o `onLoad`, então o evento nunca chega: o spinner fica girando pra sempre e a
 * foto nunca sai do `opacity-0`. Acontece principalmente ao voltar pra uma cor
 * já visitada num produto com muitas variantes.
 *
 * Usar como ref no <img>: quando o elemento monta já completo, marca como
 * carregado na hora, sem depender do evento.
 */
export function markImageSettled(el: HTMLImageElement | null, mark: () => void) {
  if (el && el.complete && el.naturalWidth > 0) mark()
}
