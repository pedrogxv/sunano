/**
 * "O modal nasce de onde a pessoa clicou": guarda o último ponto tocado na
 * página e, quando um painel CENTRADO na viewport monta, aponta o
 * `transform-origin` dele para esse ponto. A animação de entrada (zoom) parte
 * dali, e o painel parece sair do botão/card que o abriu.
 *
 * Usado pelo `Dialog`/`AlertDialog` base e pelo `AdaptiveDialog`, então todo
 * modal do site abre do mesmo jeito.
 *
 * Por `ref` e não por estado: o `DialogContent` é renderizado mesmo fechado
 * (o Radix só monta o nó ao abrir), e o ref roda exatamente quando o nó
 * entra no DOM — antes do primeiro quadro da animação.
 */

let lastPointer: { x: number; y: number; at: number } | null = null

if (typeof document !== "undefined") {
  document.addEventListener(
    "pointerdown",
    (event) => {
      lastPointer = { x: event.clientX, y: event.clientY, at: Date.now() }
    },
    { capture: true, passive: true }
  )
}

/** Clique mais velho que isto (abertura por teclado, por código) cresce do centro. */
const MAX_AGE_MS = 1500

/**
 * Ref callback para o nó do painel. Só age na PRIMEIRA vez que vê o nó: a
 * origem é a do clique que abriu, não a de um clique depois, dentro do modal.
 * O nó é novo a cada abertura (o Radix desmonta ao fechar).
 */
export function applyPointerOrigin(node: HTMLElement | null): void {
  if (!node || node.dataset.pointerOrigin) return
  node.dataset.pointerOrigin = "1"
  const p = lastPointer && Date.now() - lastPointer.at < MAX_AGE_MS ? lastPointer : null
  if (!p) return
  // O painel está centrado na viewport: o centro dele (50% 50%) é o centro da
  // tela, e a origem é o deslocamento do clique até ali.
  const dx = Math.round(p.x - window.innerWidth / 2)
  const dy = Math.round(p.y - window.innerHeight / 2)
  node.style.transformOrigin = `calc(50% + ${dx}px) calc(50% + ${dy}px)`
}

/** Junta o ref de origem com um ref recebido por prop. */
export function withPointerOrigin<T extends HTMLElement>(ref: React.Ref<T> | undefined): React.RefCallback<T> {
  return (node: T | null) => {
    applyPointerOrigin(node)
    if (typeof ref === "function") ref(node)
    else if (ref) (ref as React.RefObject<T | null>).current = node
  }
}
