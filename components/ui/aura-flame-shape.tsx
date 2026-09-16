/**
 * A SILHUETA DA CHAMA DA AURA — o desenho, num lugar só.
 *
 * Este módulo não é um componente de tela: ele guarda só a FORMA, para que
 * `AuraIcon` (chapada, o ícone do dia a dia) e `AuraFlame` (viva, animada em
 * três camadas) desenhem o MESMO símbolo.
 *
 * Nunca redesenhe a silhueta dentro de um dos dois. Quando a chama nova
 * nasceu só dentro do `AuraFlame`, o site passou a ter DOIS símbolos — a
 * Central de Aura com o desenho novo e ~28 telas (topbar e home entre elas)
 * com o antigo.
 *
 * Todos os paths são desenhados na mesma `viewBox` (`AURA_FLAME_VIEW_BOX`),
 * com a base assentada embaixo: as animações do `globals.css` usam
 * `transform-origin: bottom center`, porque fogo cresce PARA CIMA a partir de
 * uma base fixa.
 */

/** Caixa comum a todas as camadas. Quem desenha a chama usa esta, sempre. */
export const AURA_FLAME_VIEW_BOX = "0 0 24 24"

/**
 * Língua externa — a silhueta completa do símbolo. É este o path que o ícone
 * chapado (`AuraIcon`) usa sozinho, e é a camada de baixo do fogo animado.
 */
export const AURA_FLAME_OUTER_PATH =
  "M12 2c.5 2.6-.4 4.3-1.9 5.9C8.4 9.7 6 11.4 6 14.6A6 6 0 0 0 18 15c0-2.6-1-4.3-2.3-5.8-.5-.6-1-1.2-1.3-1.9-.6 1-1.4 1.6-2.2 1.9.7-2.5.6-5-.2-7.2Z"

/**
 * Corpo interno — a mesma chama, menor e recuada. Entra em contratempo com a
 * externa e é o que dá profundidade ao fogo.
 */
export const AURA_FLAME_INNER_PATH =
  "M12.4 8.6c.6 1 1.3 1.7 2 2.6 1 1.2 1.6 2.4 1.6 3.9a4 4 0 0 1-8 .1c0-1.9 1.2-3.2 2.3-4.4.9-1 1.7-1.9 2.1-3.2Z"

/**
 * Núcleo — a brasa, quase parada. Só a opacidade respira; é por NÃO se mexer
 * que ele ancora a chama.
 */
export const AURA_FLAME_CORE_PATH =
  "M12 13c.7.8 1.4 1.5 1.4 2.6a2 2 0 1 1-4 0c0-1 .6-1.6 1.2-2.3.5-.5.9-1 1.1-1.6.1.5.2.9.3 1.3Z"
