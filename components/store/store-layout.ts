/**
 * Régua horizontal da Loja: TODO bloco de página (hero, selos, seções,
 * catálogo, ficha do produto) se alinha à mesma coluna, centrada na
 * superfície do conteúdo.
 *
 * Antes o hero ia de borda a borda da superfície e o resto vivia numa coluna
 * `max-w-7xl` por baixo: com a barra do topo virando uma ilha solta, o banner
 * colado nas bordas era o único bloco fora do alinhamento, e a página parecia
 * puxada para os lados.
 *
 * 88rem (1408px), não `max-w-7xl` (1280px): com a sidebar e a barra soltas,
 * num monitor de 1920px a coluna de 1280 deixava ~370px de superfície vazia
 * enquanto a barra do topo ia de ponta a ponta. A mais cabe um card no trilho.
 *
 * O padding (`px-4 lg:px-8`) tem de bater com o `--rail-pad` de
 * `STORE_CARD_RAIL_CLASS` (card-rail.ts): o trilho de cards vaza a coluna e
 * usa esse mesmo respiro para o primeiro card ficar alinhado aos títulos.
 */
export const STORE_CONTAINER = "mx-auto w-full max-w-[88rem] px-4 lg:px-8"

/**
 * Largura de um CARTÃO que ocupa a coluna inteira (hero, banner de
 * categoria/marca/avaliações): o mesmo miolo de `STORE_CONTAINER` (88rem
 * menos o padding), mas como largura do próprio elemento, para o cartão não
 * precisar de um wrapper só para ganhar o recuo.
 */
export const STORE_CARD_WIDTH = "mx-auto w-[calc(100%-2rem)] max-w-[84rem] lg:w-[calc(100%-4rem)]"

/** Pele dos banners arredondados (hero, categoria, marca, avaliações). */
export const STORE_BANNER_CARD =
  "relative isolate overflow-hidden rounded-3xl border border-white/[0.08] bg-[#0b0f14] shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_24px_60px_-32px_rgba(0,0,0,0.9)]"
