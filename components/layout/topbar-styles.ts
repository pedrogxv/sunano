/**
 * Botões da ilha do topo (TopBar e menu da Loja): UMA régua de tamanho, forma
 * e badge. Antes cada botão trazia a sua — o sino e o carrinho eram quadrados
 * com borda, o avatar um círculo solto, o badge de cada um num canto
 * diferente —, e lado a lado eles pareciam colados e de famílias distintas.
 *
 * - 44px no celular (alvo de toque), 36px no desktop: cabem na ilha de 56px
 *   com o mesmo respiro em cima e embaixo.
 * - Cápsula sem borda: o vidro já é a moldura; borda em botão dentro dele
 *   virava caixa dentro de caixa.
 * - O badge fica DENTRO do contorno do botão (`-right-0.5`), com anel da cor
 *   da ilha: transbordando, ele invadia o vizinho e encostava no avatar.
 */
export const TOPBAR_ICON_BUTTON =
  "relative flex size-11 shrink-0 items-center justify-center rounded-full text-[#b4b4b4] transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 md:size-9"

/** Mesmo botão, com rótulo a partir do `sm` (Pedidos, Carrinho na TopBar). */
export const TOPBAR_LABEL_BUTTON =
  "relative flex size-11 shrink-0 items-center justify-center gap-2 rounded-full text-[13px] font-semibold text-[#b4b4b4] transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/25 md:size-auto md:h-9 md:px-3"

/** Estado ativo (rota atual) dos botões acima. */
export const TOPBAR_BUTTON_ACTIVE = "bg-white/[0.09] text-white"

/** Contador no canto do botão. A cor de fundo é de quem usa (violeta = aviso, verde = carrinho). */
export const TOPBAR_BADGE =
  "pointer-events-none absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none text-white ring-2 ring-[#141416]"
