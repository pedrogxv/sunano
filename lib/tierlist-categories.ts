/**
 * Categorias da Tierlist como rotas reais (`/tierlist/[categoria]`).
 *
 * Antes cada categoria vivia só em `?categoria=` client-side: "tierlist de
 * mouse", "tierlist de teclado" — buscas de volume real — não tinham URL
 * própria, título, H1 nem canonical. Aqui ficam o slug de cada uma (em pt-BR,
 * que é o termo buscado), o mapeamento slug↔categoria e os rótulos usados no
 * `<h1>`, no `<title>` e na descrição.
 */

import type { Category } from "@/lib/tag-options"

/** slug de URL (pt-BR) → categoria interna. */
export const TIERLIST_CATEGORY_BY_SLUG: Record<string, Category> = {
  teclados: "keyboard",
  mouses: "mouse",
  mousepads: "mousepad",
  glasspads: "glasspad",
  iems: "iem",
  headsets: "headset",
  feet: "feet",
  cadeiras: "chairs",
  monitores: "monitors",
  switches: "switches",
  pcbs: "pcb",
  "dac-amp": "dac_amp",
  fontes: "psu",
}

export const TIERLIST_SLUG_BY_CATEGORY: Record<Category, string> = Object.fromEntries(
  Object.entries(TIERLIST_CATEGORY_BY_SLUG).map(([slug, category]) => [category, slug])
) as Record<Category, string>

export const TIERLIST_CATEGORY_SLUGS = Object.keys(TIERLIST_CATEGORY_BY_SLUG)

export function tierlistCategoryPath(category: Category): string {
  const slug = TIERLIST_SLUG_BY_CATEGORY[category]
  return slug ? `/tierlist/${slug}` : "/tierlist"
}

/** Rótulo no plural, para `<h1>` e `<title>` ("Tierlist de Teclados"). */
export const TIERLIST_CATEGORY_LABELS: Record<Category, string> = {
  keyboard: "Teclados",
  mouse: "Mouses",
  mousepad: "Mousepads",
  glasspad: "Glasspads",
  iem: "IEMs",
  headset: "Headsets",
  feet: "Feet",
  chairs: "Cadeiras",
  monitors: "Monitores",
  switches: "Switches",
  pcb: "PCBs",
  dac_amp: "DAC/AMP",
  psu: "Fontes",
}

/** Frase curta de apoio por categoria, para a descrição de SEO e o subtítulo. */
export const TIERLIST_CATEGORY_BLURBS: Record<Category, string> = {
  keyboard: "teclados mecânicos, magnéticos e custo-benefício",
  mouse: "mouses gamers com e sem fio, do competitivo ao versátil",
  mousepad: "mousepads de tecido, híbridos e nacionais",
  glasspad: "glasspads e superfícies de vidro",
  iem: "fones intra-auriculares (IEMs) para jogo e música",
  headset: "headsets gamers e nacionais",
  feet: "skates (feet) de mouse",
  chairs: "cadeiras gamer e de escritório",
  monitors: "monitores OLED, IPS/VA e competitivos",
  switches: "switches mecânicos por som e digitação",
  pcb: "PCBs para teclado custom",
  dac_amp: "DACs e amplificadores de fone",
  psu: "fontes de alimentação, das melhores às BOMBA",
}
