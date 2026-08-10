/**
 * Fonte única das tags disponíveis por categoria de periférico.
 *
 * Usada pelo formulário de admin (app/admin/tierlist/form.tsx), pelos
 * componentes que exibem tags (PeripheralCard, TierItemTooltipContent,
 * PeripheralDetailView) e pelo script de limpeza de tags órfãs
 * (scripts/cleanup-orphaned-tags.ts). Antes cada um desses arquivos tinha sua
 * própria cópia do union type `Tag` e das listas por categoria — bastava
 * remover uma tag daqui, num desses arquivos, pra ela ficar "presa" (órfã)
 * em itens que já tinham sido salvos com ela, já que `peripherals.tags` é um
 * array de texto sem FK/enum no banco. Ver `getTagOptionsForCategory`: o
 * formulário de admin usa ela pra autolimpar (self-heal) tags órfãs sempre
 * que um item é aberto ou salvo.
 */

export type Category = "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"

export const ALL_CATEGORIES: Category[] = ["keyboard", "pcb", "mouse", "mousepad", "glasspad", "iem", "headset", "feet", "chairs", "monitors", "switches", "dac_amp"]

export type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado" | "raro" | "fibra_carbono" | "control" | "speed" | "silicone" | "ia" | "white_label" | "ips" | "va" | "tn" | "oled" | "miniled" | "fhd" | "qhd" | "4k" | "headphone" | "wired" | "wireless"

export type TagOption = { key: Tag; en: string; pt: string; color: string }

// Tags sem categoria própria definida ainda (ex.: switches) — ficam de fora de
// keyboard/mouse pra não vazar pro formulário desses dois, mas continuam disponíveis nas demais
// categorias que ainda não têm uma lista dedicada em CATEGORY_TAGS_OVERRIDE (ver abaixo).
const NON_KEYBOARD_MOUSE_CATEGORIES = ALL_CATEGORIES.filter(
  (key) => key !== "keyboard" && key !== "mouse"
)

// Lista genérica de tags — usada por qualquer categoria que não tenha uma lista própria em
// CATEGORY_TAGS_OVERRIDE. Cada tag pode restringir em quais categorias aparece via `categories`;
// sem esse campo, a tag fica disponível em todas as categorias que caem no caminho genérico.
export const GENERIC_TAGS_OPTIONS: (TagOption & { categories?: Category[] })[] = [
  { key: "competitive", en: "Competitive", pt: "Competitivo", color: "border-violet-400/50 bg-violet-500/10 text-violet-300 data-[active=true]:bg-violet-500/30 data-[active=true]:border-violet-400", categories: ["keyboard", "pcb", "mouse"] },
  { key: "versatile", en: "Bomba", pt: "Bomba", color: "border-red-400/50 bg-red-500/10 text-red-300 data-[active=true]:bg-red-500/30 data-[active=true]:border-red-400", categories: ["keyboard", "pcb", "mouse"] },
  { key: "value", en: "Value", pt: "Custo-Benefício", color: "border-emerald-400/50 bg-emerald-500/10 text-emerald-300 data-[active=true]:bg-emerald-500/30 data-[active=true]:border-emerald-400", categories: ["keyboard", "pcb", "mouse"] },
  { key: "cheap", en: "Cheap", pt: "Barato", color: "border-green-400/50 bg-green-500/10 text-green-300 data-[active=true]:bg-green-500/30 data-[active=true]:border-green-400", categories: ["keyboard", "pcb", "mouse"] },
  { key: "expensive", en: "Expensive", pt: "Caro", color: "border-rose-400/50 bg-rose-500/10 text-rose-300 data-[active=true]:bg-rose-500/30 data-[active=true]:border-rose-400", categories: ["keyboard", "pcb", "mouse"] },
  { key: "light", en: "Light", pt: "Leve", color: "border-sky-400/50 bg-sky-500/10 text-sky-300 data-[active=true]:bg-sky-500/30 data-[active=true]:border-sky-400", categories: ["mouse"] },
  { key: "heavy", en: "Heavy", pt: "Pesado", color: "border-slate-400/50 bg-slate-500/10 text-slate-300 data-[active=true]:bg-slate-500/30 data-[active=true]:border-slate-400", categories: ["mouse"] },
  { key: "unbalanced", en: "Unbalanced weight", pt: "Peso Desbalanceado", color: "border-pink-400/50 bg-pink-500/10 text-pink-300 data-[active=true]:bg-pink-500/30 data-[active=true]:border-pink-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "dpi_deviation", en: "DPI Deviation", pt: "DPI Deviation", color: "border-yellow-400/50 bg-yellow-500/10 text-yellow-300 data-[active=true]:bg-yellow-500/30 data-[active=true]:border-yellow-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "wobble_high", en: "High wobble", pt: "Wooble Alto", color: "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-300 data-[active=true]:bg-fuchsia-500/30 data-[active=true]:border-fuchsia-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "wobble_low", en: "Low wobble", pt: "Wooble Baixo", color: "border-violet-400/50 bg-violet-500/10 text-violet-300 data-[active=true]:bg-violet-500/30 data-[active=true]:border-violet-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "scroll_hard", en: "Hard scroll", pt: "Scroll Duro", color: "border-stone-400/50 bg-stone-500/10 text-stone-300 data-[active=true]:bg-stone-500/30 data-[active=true]:border-stone-400", categories: ["mouse"] },
  { key: "scroll_soft", en: "Soft scroll", pt: "Scroll Mole", color: "border-lime-400/50 bg-lime-500/10 text-lime-300 data-[active=true]:bg-lime-500/30 data-[active=true]:border-lime-400", categories: ["mouse"] },
  { key: "trimode", en: "Trimode", pt: "Trimode", color: "border-indigo-400/50 bg-indigo-500/10 text-indigo-300 data-[active=true]:bg-indigo-500/30 data-[active=true]:border-indigo-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "stable", en: "Stable", pt: "Estável", color: "border-teal-400/50 bg-teal-500/10 text-teal-300 data-[active=true]:bg-teal-500/30 data-[active=true]:border-teal-400", categories: ["keyboard", "pcb"] },
  { key: "unstable", en: "Unstable", pt: "Instável", color: "border-orange-400/50 bg-orange-500/10 text-orange-300 data-[active=true]:bg-orange-500/30 data-[active=true]:border-orange-400", categories: ["keyboard", "pcb"] },
  { key: "8_80", en: "8 80", pt: "8 80", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "poron", en: "Poron", pt: "Poron", color: "border-purple-400/50 bg-purple-500/10 text-purple-300 data-[active=true]:bg-purple-500/30 data-[active=true]:border-purple-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "borracha", en: "Rubber", pt: "Borracha", color: "border-zinc-400/50 bg-zinc-500/10 text-zinc-300 data-[active=true]:bg-zinc-500/30 data-[active=true]:border-zinc-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "grosso", en: "Thick", pt: "Grosso", color: "border-amber-400/50 bg-amber-500/10 text-amber-300 data-[active=true]:bg-amber-500/30 data-[active=true]:border-amber-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "fino", en: "Thin", pt: "Fino", color: "border-cyan-400/50 bg-cyan-500/10 text-cyan-300 data-[active=true]:bg-cyan-500/30 data-[active=true]:border-cyan-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "rapido", en: "Fast", pt: "Rápido", color: "border-green-400/50 bg-green-500/10 text-green-300 data-[active=true]:bg-green-500/30 data-[active=true]:border-green-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "devagar", en: "Slow", pt: "Devagar", color: "border-sky-400/50 bg-sky-500/10 text-sky-300 data-[active=true]:bg-sky-500/30 data-[active=true]:border-sky-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "hibrido", en: "Hybrid", pt: "Híbrido", color: "border-teal-400/50 bg-teal-500/10 text-teal-300 data-[active=true]:bg-teal-500/30 data-[active=true]:border-teal-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "aspero", en: "Rough", pt: "Áspero", color: "border-stone-400/50 bg-stone-500/10 text-stone-300 data-[active=true]:bg-stone-500/30 data-[active=true]:border-stone-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "liso", en: "Smooth", pt: "Liso", color: "border-sky-400/50 bg-sky-500/10 text-sky-300 data-[active=true]:bg-sky-500/30 data-[active=true]:border-sky-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "mug", en: "Mug", pt: "Mug", color: "border-amber-400/50 bg-amber-500/10 text-amber-300 data-[active=true]:bg-amber-500/30 data-[active=true]:border-amber-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "macio", en: "Soft", pt: "Macio", color: "border-pink-400/50 bg-pink-500/10 text-pink-300 data-[active=true]:bg-pink-500/30 data-[active=true]:border-pink-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "afetado_umidade", en: "Moisture affected", pt: "Afetado por umidade", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400", categories: NON_KEYBOARD_MOUSE_CATEGORIES },
  { key: "ultrapassado", en: "Outdated", pt: "Ultrapassado", color: "border-gray-400/50 bg-gray-500/10 text-gray-300 data-[active=true]:bg-gray-500/30 data-[active=true]:border-gray-400", categories: ["keyboard", "pcb"] },
  { key: "headphone", en: "Headphone", pt: "Headphone", color: "border-indigo-400/50 bg-indigo-500/10 text-indigo-300 data-[active=true]:bg-indigo-500/30 data-[active=true]:border-indigo-400", categories: ["iem"] },
]

// Lista de tags exclusiva da categoria Mousepad — substitui completamente a lista genérica
// acima quando a categoria selecionada no formulário for "mousepad".
export const MOUSEPAD_TAGS_OPTIONS: TagOption[] = [
  { key: "raro", en: "Rare", pt: "Raro", color: "border-amber-400/50 bg-amber-500/10 text-amber-300 data-[active=true]:bg-amber-500/30 data-[active=true]:border-amber-400" },
  { key: "competitive", en: "Competitive", pt: "Competitivo", color: "border-violet-400/50 bg-violet-500/10 text-violet-300 data-[active=true]:bg-violet-500/30 data-[active=true]:border-violet-400" },
  { key: "versatile", en: "Bomba", pt: "Bomba", color: "border-red-400/50 bg-red-500/10 text-red-300 data-[active=true]:bg-red-500/30 data-[active=true]:border-red-400" },
  { key: "expensive", en: "Expensive", pt: "Caro", color: "border-rose-400/50 bg-rose-500/10 text-rose-300 data-[active=true]:bg-rose-500/30 data-[active=true]:border-rose-400" },
  { key: "cheap", en: "Cheap", pt: "Barato", color: "border-green-400/50 bg-green-500/10 text-green-300 data-[active=true]:bg-green-500/30 data-[active=true]:border-green-400" },
  { key: "poron", en: "Poron", pt: "Poron", color: "border-purple-400/50 bg-purple-500/10 text-purple-300 data-[active=true]:bg-purple-500/30 data-[active=true]:border-purple-400" },
  { key: "borracha", en: "Rubber", pt: "Borracha", color: "border-zinc-400/50 bg-zinc-500/10 text-zinc-300 data-[active=true]:bg-zinc-500/30 data-[active=true]:border-zinc-400" },
  { key: "fibra_carbono", en: "Carbon fiber", pt: "Fibra de Carbono", color: "border-neutral-400/50 bg-neutral-500/10 text-neutral-300 data-[active=true]:bg-neutral-500/30 data-[active=true]:border-neutral-400" },
  { key: "control", en: "Control", pt: "Control", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400" },
  { key: "speed", en: "Speed", pt: "Speed", color: "border-yellow-400/50 bg-yellow-500/10 text-yellow-300 data-[active=true]:bg-yellow-500/30 data-[active=true]:border-yellow-400" },
  { key: "hibrido", en: "Hybrid", pt: "Híbrido", color: "border-teal-400/50 bg-teal-500/10 text-teal-300 data-[active=true]:bg-teal-500/30 data-[active=true]:border-teal-400" },
  { key: "aspero", en: "Rough", pt: "Áspero", color: "border-stone-400/50 bg-stone-500/10 text-stone-300 data-[active=true]:bg-stone-500/30 data-[active=true]:border-stone-400" },
  { key: "liso", en: "Smooth", pt: "Liso", color: "border-sky-400/50 bg-sky-500/10 text-sky-300 data-[active=true]:bg-sky-500/30 data-[active=true]:border-sky-400" },
  { key: "mug", en: "Mug", pt: "Mug", color: "border-amber-400/50 bg-amber-500/10 text-amber-300 data-[active=true]:bg-amber-500/30 data-[active=true]:border-amber-400" },
  { key: "macio", en: "Soft", pt: "Macio", color: "border-pink-400/50 bg-pink-500/10 text-pink-300 data-[active=true]:bg-pink-500/30 data-[active=true]:border-pink-400" },
  { key: "afetado_umidade", en: "Moisture affected", pt: "Afetado por umidade", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400" },
]

// Lista de tags exclusiva da categoria Glasspad — substitui completamente a lista genérica
// acima quando a categoria selecionada no formulário for "glasspad".
export const GLASSPAD_TAGS_OPTIONS: TagOption[] = [
  { key: "raro", en: "Rare", pt: "Raro", color: "border-amber-400/50 bg-amber-500/10 text-amber-300 data-[active=true]:bg-amber-500/30 data-[active=true]:border-amber-400" },
  { key: "competitive", en: "Competitive", pt: "Competitivo", color: "border-violet-400/50 bg-violet-500/10 text-violet-300 data-[active=true]:bg-violet-500/30 data-[active=true]:border-violet-400" },
  { key: "versatile", en: "Bomba", pt: "Bomba", color: "border-red-400/50 bg-red-500/10 text-red-300 data-[active=true]:bg-red-500/30 data-[active=true]:border-red-400" },
  { key: "expensive", en: "Expensive", pt: "Caro", color: "border-rose-400/50 bg-rose-500/10 text-rose-300 data-[active=true]:bg-rose-500/30 data-[active=true]:border-rose-400" },
  { key: "cheap", en: "Cheap", pt: "Barato", color: "border-green-400/50 bg-green-500/10 text-green-300 data-[active=true]:bg-green-500/30 data-[active=true]:border-green-400" },
  { key: "silicone", en: "Silicone", pt: "Silicone", color: "border-cyan-400/50 bg-cyan-500/10 text-cyan-300 data-[active=true]:bg-cyan-500/30 data-[active=true]:border-cyan-400" },
  { key: "borracha", en: "Rubber", pt: "Borracha", color: "border-zinc-400/50 bg-zinc-500/10 text-zinc-300 data-[active=true]:bg-zinc-500/30 data-[active=true]:border-zinc-400" },
  { key: "fibra_carbono", en: "Carbon fiber", pt: "Fibra de Carbono", color: "border-neutral-400/50 bg-neutral-500/10 text-neutral-300 data-[active=true]:bg-neutral-500/30 data-[active=true]:border-neutral-400" },
  { key: "control", en: "Control", pt: "Control", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400" },
  { key: "speed", en: "Speed", pt: "Speed", color: "border-yellow-400/50 bg-yellow-500/10 text-yellow-300 data-[active=true]:bg-yellow-500/30 data-[active=true]:border-yellow-400" },
  { key: "hibrido", en: "Hybrid", pt: "Híbrido", color: "border-teal-400/50 bg-teal-500/10 text-teal-300 data-[active=true]:bg-teal-500/30 data-[active=true]:border-teal-400" },
  { key: "aspero", en: "Rough", pt: "Áspero", color: "border-stone-400/50 bg-stone-500/10 text-stone-300 data-[active=true]:bg-stone-500/30 data-[active=true]:border-stone-400" },
  { key: "liso", en: "Smooth", pt: "Liso", color: "border-sky-400/50 bg-sky-500/10 text-sky-300 data-[active=true]:bg-sky-500/30 data-[active=true]:border-sky-400" },
  { key: "mug", en: "Mug", pt: "Mug", color: "border-amber-400/50 bg-amber-500/10 text-amber-300 data-[active=true]:bg-amber-500/30 data-[active=true]:border-amber-400" },
  { key: "macio", en: "Soft", pt: "Macio", color: "border-pink-400/50 bg-pink-500/10 text-pink-300 data-[active=true]:bg-pink-500/30 data-[active=true]:border-pink-400" },
  { key: "ia", en: "AI", pt: "IA", color: "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-300 data-[active=true]:bg-fuchsia-500/30 data-[active=true]:border-fuchsia-400" },
]

// Lista de tags exclusiva da categoria Monitores — substitui completamente a lista genérica
// acima quando a categoria selecionada no formulário for "monitors".
export const MONITORS_TAGS_OPTIONS: TagOption[] = [
  { key: "competitive", en: "Competitive", pt: "Competitivo", color: "border-violet-400/50 bg-violet-500/10 text-violet-300 data-[active=true]:bg-violet-500/30 data-[active=true]:border-violet-400" },
  { key: "versatile", en: "Bomba", pt: "Bomba", color: "border-red-400/50 bg-red-500/10 text-red-300 data-[active=true]:bg-red-500/30 data-[active=true]:border-red-400" },
  { key: "expensive", en: "Expensive", pt: "Caro", color: "border-rose-400/50 bg-rose-500/10 text-rose-300 data-[active=true]:bg-rose-500/30 data-[active=true]:border-rose-400" },
  { key: "cheap", en: "Cheap", pt: "Barato", color: "border-green-400/50 bg-green-500/10 text-green-300 data-[active=true]:bg-green-500/30 data-[active=true]:border-green-400" },
  { key: "value", en: "Value", pt: "Custo Benefício", color: "border-emerald-400/50 bg-emerald-500/10 text-emerald-300 data-[active=true]:bg-emerald-500/30 data-[active=true]:border-emerald-400" },
  { key: "white_label", en: "White Label", pt: "White Label", color: "border-gray-400/50 bg-gray-500/10 text-gray-300 data-[active=true]:bg-gray-500/30 data-[active=true]:border-gray-400" },
  { key: "ips", en: "IPS", pt: "IPS", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400" },
  { key: "va", en: "VA", pt: "VA", color: "border-indigo-400/50 bg-indigo-500/10 text-indigo-300 data-[active=true]:bg-indigo-500/30 data-[active=true]:border-indigo-400" },
  { key: "tn", en: "TN", pt: "TN", color: "border-orange-400/50 bg-orange-500/10 text-orange-300 data-[active=true]:bg-orange-500/30 data-[active=true]:border-orange-400" },
  { key: "oled", en: "OLED", pt: "OLED", color: "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-300 data-[active=true]:bg-fuchsia-500/30 data-[active=true]:border-fuchsia-400" },
  { key: "miniled", en: "MiniLED", pt: "MINILED", color: "border-yellow-400/50 bg-yellow-500/10 text-yellow-300 data-[active=true]:bg-yellow-500/30 data-[active=true]:border-yellow-400" },
  { key: "fhd", en: "FHD", pt: "FHD", color: "border-slate-400/50 bg-slate-500/10 text-slate-300 data-[active=true]:bg-slate-500/30 data-[active=true]:border-slate-400" },
  { key: "qhd", en: "QHD", pt: "QHD", color: "border-cyan-400/50 bg-cyan-500/10 text-cyan-300 data-[active=true]:bg-cyan-500/30 data-[active=true]:border-cyan-400" },
  { key: "4k", en: "4K", pt: "4K", color: "border-purple-400/50 bg-purple-500/10 text-purple-300 data-[active=true]:bg-purple-500/30 data-[active=true]:border-purple-400" },
]

// Lista de tags exclusiva da categoria Headset — substitui completamente a lista genérica
// acima quando a categoria selecionada no formulário for "headset". Antes o Headset não tinha
// lista própria e herdava a genérica inteira (18 tags de mousepad/glasspad que não se aplicam
// a headphones); agora fica só com conectividade, que é o que faz sentido pra essa categoria.
export const HEADSET_TAGS_OPTIONS: TagOption[] = [
  { key: "wired", en: "Wired", pt: "Com fio", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400" },
  { key: "wireless", en: "Wireless", pt: "Sem fio", color: "border-emerald-400/50 bg-emerald-500/10 text-emerald-300 data-[active=true]:bg-emerald-500/30 data-[active=true]:border-emerald-400" },
]

// Ponto único de extensão: para dar a uma categoria sua própria lista de tags (em vez de herdar
// a lista genérica acima), basta declarar um novo array de TagOption (como MOUSEPAD_TAGS_OPTIONS)
// e adicionar a entrada correspondente aqui — nenhum outro trecho do formulário precisa mudar.
export const CATEGORY_TAGS_OVERRIDE: Partial<Record<Category, TagOption[]>> = {
  mousepad: MOUSEPAD_TAGS_OPTIONS,
  glasspad: GLASSPAD_TAGS_OPTIONS,
  monitors: MONITORS_TAGS_OPTIONS,
  headset: HEADSET_TAGS_OPTIONS,
}

export function getTagOptionsForCategory(category: Category): TagOption[] {
  const override = CATEGORY_TAGS_OVERRIDE[category]
  if (override) return override
  return GENERIC_TAGS_OPTIONS.filter((tag) => !tag.categories || tag.categories.includes(category))
}

export function getValidTagKeysForCategory(category: Category): Tag[] {
  return getTagOptionsForCategory(category).map((option) => option.key)
}

/**
 * Self-heal de tags órfãs: remove da lista qualquer tag que não exista mais na config
 * atual da categoria (ver comentário no topo do arquivo). O campo de tags é obrigatório
 * — nunca pode ficar vazio numa troca por órfã —, então se TODAS as tags salvas eram
 * órfãs, cai pra primeira tag válida da categoria atual em vez de zerar a lista. Um item
 * que já estava sem nenhuma tag (`tags: []`) continua sem tag: essa função só substitui
 * valor "preso", não força uma tag em item que nunca teve uma.
 *
 * Usada pelo formulário de admin (app/admin/tierlist/form.tsx), pelas rotas de admin
 * (app/api/admin/peripherals) e pelo script retroativo (scripts/cleanup-orphaned-tags.ts)
 * — mesma lógica nos três lugares pra não voltar a divergir.
 */
export function sanitizeTagsForCategory(category: Category, tags: readonly string[] | null | undefined): Tag[] {
  const validKeys = getValidTagKeysForCategory(category)
  const input = tags ?? []
  const kept = input.filter((tag): tag is Tag => validKeys.includes(tag as Tag))
  if (kept.length > 0 || input.length === 0) return kept
  const fallback = validKeys[0]
  return fallback ? [fallback] : kept
}
