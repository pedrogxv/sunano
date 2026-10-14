/**
 * Agrupamento de categoria pra "Meus Reviews" (perfil) e pro filtro de
 * categoria do seletor de periférico na criação de review.
 *
 * Módulo puro (sem `server-only`) — usado tanto no client (filtro do
 * `PeripheralPicker`) quanto no server (agrupamento em
 * `peripheral-reviews-repository.ts`). Mesma convenção de categorias
 * agregadas já usada em `SLOT_META` (components/account/showcase-editors.tsx):
 * "fone" cobre headset+iem, "mousepad" cobre mousepad+glasspad.
 *
 * Categorias do catálogo fora desta lista (pcb, feet, chairs, switches,
 * dac_amp) não são avaliáveis nesta fase — não se encaixam no agrupamento
 * fixo do spec.
 */

export const REVIEW_CATEGORY_GROUPS = [
  { key: "mouse", label: "Mouse", categories: ["mouse"] },
  { key: "mousepad", label: "Mousepad", categories: ["mousepad", "glasspad"] },
  { key: "keyboard", label: "Teclado", categories: ["keyboard"] },
  { key: "monitor", label: "Monitor", categories: ["monitors"] },
  { key: "headset", label: "Fone/Headset", categories: ["headset", "iem"] },
] as const

export type ReviewCategoryKey = (typeof REVIEW_CATEGORY_GROUPS)[number]["key"]

/** Categoria (agrupada) de um periférico do catálogo, ou `null` se não for avaliável. */
export function reviewCategoryKeyFor(category: string): ReviewCategoryKey | null {
  const group = REVIEW_CATEGORY_GROUPS.find((g) => (g.categories as readonly string[]).includes(category))
  return group?.key ?? null
}

/** Todas as categorias do catálogo avaliáveis nesta fase — filtro do picker de criação. */
export const REVIEWABLE_CATALOG_CATEGORIES = REVIEW_CATEGORY_GROUPS.flatMap((g) => g.categories)

/**
 * Texto da review: obrigatório. Review só de estrelas não diz nada a quem lê a
 * ficha. Reviews antigas sem texto continuam no ar; a regra vale para criar e
 * para editar (quem edita uma antiga precisa escrever o comentário).
 * O mínimo barra "." / "bom" — a rota e o formulário leem daqui.
 */
export const REVIEW_BODY_MIN_LENGTH = 10
export const REVIEW_BODY_MAX_LENGTH = 400
