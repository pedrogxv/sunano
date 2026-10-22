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
 * Língua externa — a silhueta completa do símbolo, com TRÊS línguas (a
 * central, alta e levemente inclinada, e duas laterais mais baixas). Foram as
 * línguas que fizeram a chama deixar de ler como gota: a versão anterior era
 * um bulbo com uma ponta só e, em 16px, qualquer um via uma lágrima laranja.
 * É a camada de baixo do fogo animado.
 */
export const AURA_FLAME_OUTER_PATH =
  "M12 22.5C8.1 22.5 5 19.6 5 15.7C5 12.8 5.6 10.6 6.6 8.4C7.1 10 7.8 11.1 8.9 11.8C8.7 7.6 10.4 4.2 12.6 1.5C13.3 4.3 13.6 6.9 14.5 9.3C15.3 8.5 16.3 7.6 17 6.3C18.4 9 19 12.2 19 15.7C19 19.6 15.9 22.5 12 22.5Z"

/**
 * Corpo interno — uma chama menor de duas línguas, assentada na mesma base.
 * Entra em contratempo com a externa e é o que dá profundidade ao fogo. No
 * ícone chapado ela vira o VAZADO do meio (ver `AURA_FLAME_ICON_PATH`).
 */
export const AURA_FLAME_INNER_PATH =
  "M12 21C9.6 21 7.8 19.2 7.8 16.8C7.8 14.7 9 13.1 10.3 11.6C10.5 12.8 11.1 13.6 12 14C11.8 11.6 12.6 9.4 13.7 7.8C14.3 10.3 16.2 12.4 16.2 15.9C16.2 18.9 14.3 21 12 21Z"

/**
 * Núcleo — a brasa, quase parada. Só a opacidade respira; é por NÃO se mexer
 * que ele ancora a chama.
 */
export const AURA_FLAME_CORE_PATH =
  "M12 20.6C10.6 20.6 9.6 19.6 9.6 18.2C9.6 16.9 10.4 16 11.2 14.9C11.5 15.6 11.9 16 12.5 16.2C12.5 15.3 12.8 14.5 13.3 13.8C14 15 14.4 16.5 14.4 18.2C14.4 19.6 13.4 20.6 12 20.6Z"

/**
 * O ícone chapado (uma cor só): a silhueta com o corpo interno VAZADO, com
 * `fill-rule="evenodd"`. Uma cor sozinha não tem como mostrar camadas; o
 * buraco em forma de língua é o que diz "fogo" em 10px, onde o contorno das
 * línguas laterais já quase não se lê.
 */
export const AURA_FLAME_ICON_PATH = `${AURA_FLAME_OUTER_PATH} ${AURA_FLAME_INNER_PATH}`
