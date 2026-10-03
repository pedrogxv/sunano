/**
 * Vagas das duas vitrines de curadoria manual da Loja: "Destaques"
 * (Selecionados da semana) e os fixados de "Mais vendidos". Mora aqui, e não
 * em cada ponta, porque a API recusa o 9º, a vitrine só lê 8 e o painel do
 * admin desenha 8 vagas — com números soltos, o admin fixava um produto que
 * a Loja nunca mostrava.
 */
export const STORE_SHOWCASE_SLOTS = 8
