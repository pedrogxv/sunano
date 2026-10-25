/**
 * Trilho horizontal de cards da Loja (Destaques, seções da Home, Pré-venda e
 * Lançamentos). Uma classe só para os três: estavam copiados à mão.
 *
 * `overflow-x-auto` também corta na VERTICAL (CSS não deixa um eixo rolar e o
 * outro vazar), e o trilho tinha só 4px em cima e 8px embaixo. O brilho do
 * card de pré-venda/lançamento (`.preorder-gold-card`, sombra de 28–50px) e o
 * `hover:-translate-y` saíam recortados num retângulo. O respiro abaixo cabe
 * a sombra inteira; a margem negativa devolve o espaçamento de antes, então a
 * página não muda de altura.
 *
 * O respiro fica POR CIMA do cabeçalho (setas) e do que vem depois — na
 * categoria o vão entre seções é de 20px. Com mouse/trackpad o trilho não
 * recebe clique (`pointer-events-none`) e só os cards recebem
 * (`*:pointer-events-auto`): a roda sobre um card sobe até ele e rola.
 *
 * **Só com ponteiro fino (`pointer-fine:`).** No toque, o Safari do iOS
 * (WebKit) não reconhece como rolável um contêiner com `pointer-events:
 * none`: o dedo caía no card e o arrasto não movia nada — o trilho ficava
 * travado no celular, enquanto o modo responsivo do Chrome rolava normal.
 * No toque o trilho recebe o gesto, e o cabeçalho da seção fica acima dele
 * com `STORE_CARD_RAIL_HEADER_CLASS`, para "Ver tudo" continuar tocável.
 *
 * **Até a borda do `<main>`.** A margem negativa e o padding laterais leem
 * `--rail-bleed-l`/`--rail-bleed-r`, que `useCardRailBleed` mede: o trilho
 * vaza a coluna `max-w-7xl` até a sidebar e até a borda da tela, e o padding
 * igual mantém o primeiro e o último card alinhados à coluna. Sem a medida
 * (SSR), vale `--rail-pad`, o respiro da página — quem usa o trilho numa
 * página de padding diferente troca só o `--rail-pad`. Todo trilho chama o hook.
 */
export const STORE_CARD_RAIL_CLASS =
  "relative -mt-7 -mb-10 flex gap-3 overflow-x-auto pt-8 pb-12 scrollbar-hide pointer-fine:pointer-events-none pointer-fine:*:pointer-events-auto sm:gap-3.5 [--rail-pad:1rem] lg:[--rail-pad:2rem] -ml-[var(--rail-bleed-l,var(--rail-pad))] -mr-[var(--rail-bleed-r,var(--rail-pad))] pl-[var(--rail-bleed-l,var(--rail-pad))] pr-[var(--rail-bleed-r,var(--rail-pad))]"

/** Cabeçalho da seção acima do respiro do trilho (ver `STORE_CARD_RAIL_CLASS`). */
export const STORE_CARD_RAIL_HEADER_CLASS = "relative z-10"
