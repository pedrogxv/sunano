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
 * categoria o vão entre seções é de 20px. Por isso o trilho não recebe clique
 * (`pointer-events-none`) e só os cards recebem (`*:pointer-events-auto`).
 * A roda/trackpad sobre um card continua rolando o trilho: o evento sobe do
 * card até ele.
 */
export const STORE_CARD_RAIL_CLASS =
  "pointer-events-none relative -mx-4 -mt-7 -mb-10 flex gap-3 overflow-x-auto px-4 pt-8 pb-12 scrollbar-hide *:pointer-events-auto sm:gap-3.5 lg:-mx-8 lg:px-8"
