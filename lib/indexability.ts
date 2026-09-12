/**
 * Critério único de "esta página merece entrar no índice do Google".
 *
 * ## O problema que isto resolve
 *
 * O sitemap anunciava TODA linha do banco: 576 periféricos + 238 perfis +
 * fórum, ~1000 URLs de uma vez. O Search Console respondeu com 732 páginas em
 * **"Detectada, mas não indexada no momento"** — detectada, não rastreada. O
 * Google nem chegou a buscar o HTML: num domínio novo ele raciona crawl
 * budget, e uma fila de mil URLs desconhecidas faz ele adiar quase tudo.
 *
 * Medido na época: 100% dos perfis amostrados tinham ~565 chars de texto
 * (543–636), dos quais 191 eram o menu de navegação — idêntico em todo o site.
 * O conteúdo próprio era o mesmo template repetido ("0 Aura · 0 Posts ·
 * Mouse Não informado · Vazio Vazio Vazio"), com o nome trocado. 70% dos
 * periféricos vinham com notas 0/6, specs "-" e "Sem reviews ainda".
 *
 * Então o gargalo não é técnico (canonical, robots e SSR estavam corretos) e
 * também não se resolve com `noindex` em massa: uma página só mostra a tag
 * DEPOIS de ser rastreada, e rastreio é justamente o recurso que falta. Gastar
 * budget para o Google descobrir que não deve indexar é o pior dos dois
 * mundos.
 *
 * ## A regra
 *
 * O sitemap passa a anunciar só o que tem conteúdo que justifique um slot no
 * índice. O resto continua público, navegável e com `follow` — apenas não
 * entra na fila de rastreio. Conforme a página ganha conteúdo real ela
 * atravessa o limiar e volta ao sitemap sozinha, sem deploy: o sitemap se
 * regenera a cada 6h (`revalidate` em app/sitemap.ts) e o critério é avaliado
 * no banco a cada vez.
 *
 * Este módulo é a fonte única da regra. O sitemap decide o que anunciar e as
 * páginas decidem o `robots` meta a partir DAQUI — se os dois lados
 * divergissem, o sitemap anunciaria URL com `noindex` (sinal contraditório, o
 * pior caso para crawl budget).
 */

/** Colunas de spec reais e indexáveis de `peripherals`. */
const PERIPHERAL_SPEC_FIELDS = [
  "weight_g",
  "connectivity",
  "mouse_shape",
  "keyboard_layout",
  "surface",
  "profile",
  "panel_type",
  "refresh_rate",
] as const

/**
 * Quantas specs preenchidas uma ficha sem review precisa ter.
 *
 * Dois é o ponto de equilíbrio medido no acervo: `>=1` deixava passar 212
 * fichas (muitas com um único campo, ainda quase vazias), `>=3` cortava para
 * 157 e derrubava fichas legítimas de categoria enxuta — mousepad só tem
 * `surface`/`profile` para preencher. Com `>=2` ficam 173 periféricos.
 *
 * Atenção: NÃO usar a coluna `specs` (jsonb) para isso. Ela retorna 576/576
 * porque é gravada com as chaves presentes e valor vazio — mede dual-write,
 * não conteúdo.
 */
const MIN_SPECS_FOR_INDEX = 2

type PeripheralSignals = {
  [K in (typeof PERIPHERAL_SPEC_FIELDS)[number]]?: unknown
} & {
  /** Reviews visíveis (não ocultas pela moderação). */
  reviewCount?: number
}

function countFilledSpecs(p: PeripheralSignals): number {
  return PERIPHERAL_SPEC_FIELDS.reduce((n, field) => {
    const value = p[field]
    if (value === null || value === undefined) return n
    if (typeof value === "string" && value.trim() === "") return n
    return n + 1
  }, 0)
}

/**
 * Uma ficha de periférico entra no índice se tiver review da comunidade OU
 * specs suficientes.
 *
 * Uma review basta sozinha: é texto original escrito por uma pessoa, que é
 * exatamente o conteúdo que diferencia a ficha de um catálogo de fabricante.
 */
export function isPeripheralIndexable(p: PeripheralSignals): boolean {
  if ((p.reviewCount ?? 0) > 0) return true
  return countFilledSpecs(p) >= MIN_SPECS_FOR_INDEX
}

/**
 * Mesma regra, para quem já passou por `mapBrandFields` — a página de detalhe
 * recebe as specs em camelCase (`weightG`, `mouseShape`), o sitemap lê
 * snake_case cru do PostgREST. Duas portas para UM critério; se este arquivo
 * mudar, os dois lados mudam juntos.
 */
export function isPeripheralRecordIndexable(p: {
  weightG?: unknown
  connectivity?: unknown
  mouseShape?: unknown
  keyboardLayout?: unknown
  surface?: unknown
  profile?: unknown
  panelType?: unknown
  refreshRate?: unknown
  reviewCount?: number
}): boolean {
  return isPeripheralIndexable({
    weight_g: p.weightG,
    connectivity: p.connectivity,
    mouse_shape: p.mouseShape,
    keyboard_layout: p.keyboardLayout,
    surface: p.surface,
    profile: p.profile,
    panel_type: p.panelType,
    refresh_rate: p.refreshRate,
    reviewCount: p.reviewCount,
  })
}

type ProfileSignals = {
  bio?: string | null
  /** Posts visíveis no fórum. */
  forumPosts?: number
  /** Comentários visíveis no fórum. */
  forumComments?: number
  /** Reviews de periférico escritas pela pessoa. */
  reviewsTotal?: number
  /** Periféricos favoritos cadastrados. */
  favoritesTotal?: number
  /** Itens na tierlist pessoal. */
  tierlistItemCount?: number
}

/**
 * Um perfil entra no índice se a pessoa produziu ou curou algo.
 *
 * Favoritos e tierlist contam porque preenchem a página com nomes de produto
 * reais — deixam de ser "Vazio Vazio Vazio" e passam a ser uma página sobre um
 * setup específico. Bio conta por ser o único texto livre do perfil.
 *
 * Deliberadamente fora: `avatar_url` (215 dos 238 perfis têm avatar — não
 * discrimina nada) e contadores de Aura/seguidores, que sobem sem nenhum
 * conteúdo novo aparecer na página.
 */
export function isProfileIndexable(p: ProfileSignals): boolean {
  if (p.bio && p.bio.trim().length > 0) return true
  if ((p.forumPosts ?? 0) > 0) return true
  if ((p.forumComments ?? 0) > 0) return true
  if ((p.reviewsTotal ?? 0) > 0) return true
  if ((p.favoritesTotal ?? 0) > 0) return true
  if ((p.tierlistItemCount ?? 0) > 0) return true
  return false
}

/** Fragmento de `select` com as colunas que `isPeripheralIndexable` lê. */
export const PERIPHERAL_INDEX_SIGNAL_COLUMNS = PERIPHERAL_SPEC_FIELDS.join(", ")
