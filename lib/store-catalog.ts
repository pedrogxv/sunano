import { classifyStoreNavGroup, type StoreNavGroup } from "@/lib/store-category-icons"

/**
 * Catálogo da Loja: tipos ("Ultraleves", "FPS competitivo"), faixas de preço,
 * filtros rápidos e filtros completos por grupo do menu. Módulo puro: o mega
 * menu, a página de categoria, a rota de produtos e o repositório leem DAQUI,
 * para "Ultraleves" significar a mesma coisa no menu, no chip do topo, na
 * barra lateral e na consulta.
 *
 * Os atributos de cada produto (`StoreProductAttributes`) são montados no
 * servidor a partir do Database (periférico vinculado), da ficha técnica do
 * anúncio e do nome (store-catalog-repository). Produto sem o dado não entra
 * no filtro: um mouse sem peso cadastrado não é "Ultraleve" por omissão.
 */

// ────────────────────────────────────────────
// Atributos normalizados
// ────────────────────────────────────────────

export type StoreProductAttributes = {
  weightGrams: number | null
  shape: "symmetrical" | "ergonomic" | null
  size: "fingertip" | "small" | "medium" | "large" | null
  connection: "wireless" | "wired" | null
  /** Carcaça/acabamento do mouse. */
  material: "magnesium" | "carbon" | "fiberglass" | "plastic" | "rubberized" | "metallic" | null
  keyboardType: "magnetic" | "mechanical" | null
  layout: "60" | "65" | "75" | "tkl" | "full" | null
  caseMaterial: "aluminum" | "plastic" | "magnesium" | null
  padSurface: "speed" | "control" | "hybrid" | null
  padBase: "poron" | "rubber" | "silicone" | null
  /**
   * Campo `driver` do Database, ou "Sensor"/"Drivers" da ficha do anúncio: é
   * o sensor no mouse ("PAW3950") e a configuração de drivers na IEM
   * ("1DD + 4BA"). Texto cru; quem exibe interpreta pelo grupo.
   */
  driver: string | null
  /** Taxa de polling em Hz (8000 = 8K). */
  pollingHz: number | null
  /** Tags do periférico no Database (competitive, light, value…). */
  tags: string[]
  /** Tierlists em que o periférico aparece (overall, value, magnetic…). */
  tierlists: string[]
}

export const EMPTY_ATTRIBUTES: StoreProductAttributes = {
  weightGrams: null,
  shape: null,
  size: null,
  connection: null,
  material: null,
  keyboardType: null,
  layout: null,
  caseMaterial: null,
  padSurface: null,
  padBase: null,
  driver: null,
  pollingHz: null,
  tags: [],
  tierlists: [],
}

const isValue = (attrs: StoreProductAttributes) => attrs.tierlists.includes("value") || attrs.tags.includes("value")
const isCompetitive = (attrs: StoreProductAttributes) => attrs.tags.includes("competitive")

// ────────────────────────────────────────────
// Tipos ("Por tipo" no menu, chips do topo)
// ────────────────────────────────────────────

export type CatalogCollection = {
  /** Valor de `?tipo=` na URL. */
  key: string
  label: string
  match: (attrs: StoreProductAttributes) => boolean
}

/** Peso que já conta como ultraleve. Sem peso cadastrado, vale a tag "Leve" do Database. */
export const ULTRALIGHT_MAX_GRAMS = 55

const MOUSE_COLLECTIONS: CatalogCollection[] = [
  {
    key: "ultraleves",
    label: "Ultraleves",
    match: (a) => (a.weightGrams != null ? a.weightGrams <= ULTRALIGHT_MAX_GRAMS : a.tags.includes("light")),
  },
  { key: "ergonomicos", label: "Ergonômicos", match: (a) => a.shape === "ergonomic" },
  { key: "simetricos", label: "Simétricos", match: (a) => a.shape === "symmetrical" },
  { key: "fps", label: "FPS competitivo", match: isCompetitive },
  { key: "custo-beneficio", label: "Custo-benefício", match: isValue },
  { key: "magnesio", label: "Magnésio", match: (a) => a.material === "magnesium" },
  { key: "fibra-de-carbono", label: "Fibra de carbono", match: (a) => a.material === "carbon" },
  { key: "sem-fio", label: "Sem fio", match: (a) => a.connection === "wireless" },
  { key: "maos-pequenas", label: "Mãos pequenas", match: (a) => a.size === "small" || a.size === "fingertip" },
]

const KEYBOARD_COLLECTIONS: CatalogCollection[] = [
  {
    key: "magneticos",
    label: "Magnéticos (Rapid Trigger)",
    match: (a) => a.keyboardType === "magnetic" || a.tierlists.includes("magnetic"),
  },
  { key: "mecanicos", label: "Mecânicos", match: (a) => a.keyboardType === "mechanical" },
  { key: "fps", label: "FPS competitivo", match: isCompetitive },
  { key: "custo-beneficio", label: "Custo-benefício", match: isValue },
  { key: "compactos", label: "Compactos (60–65%)", match: (a) => a.layout === "60" || a.layout === "65" },
  { key: "aluminio", label: "Case de alumínio", match: (a) => a.caseMaterial === "aluminum" },
  { key: "sem-fio", label: "Sem fio", match: (a) => a.connection === "wireless" },
]

const MOUSEPAD_COLLECTIONS: CatalogCollection[] = [
  { key: "speed", label: "Speed", match: (a) => a.padSurface === "speed" },
  { key: "controle", label: "Controle", match: (a) => a.padSurface === "control" },
  { key: "hibridos", label: "Híbridos", match: (a) => a.padSurface === "hybrid" },
  { key: "fps", label: "FPS competitivo", match: isCompetitive },
  { key: "base-poron", label: "Base de Poron", match: (a) => a.padBase === "poron" },
]

// ────────────────────────────────────────────
// Faixas de preço
// ────────────────────────────────────────────

export type CatalogPriceBand = {
  /** Valor de `?preco=` na URL. */
  key: string
  label: string
  /** Preço efetivo (promo quando existe), em centavos. `null` = sem limite daquele lado. */
  minCents: number | null
  maxCents: number | null
}

/**
 * Faixa sem sobreposição: "R$300–500" começa em R$300,01. Senão um produto de
 * R$500 contaria em duas faixas, e o número do menu não bateria com a grade.
 */
function band(key: string, label: string, minReais: number | null, maxReais: number | null): CatalogPriceBand {
  return {
    key,
    label,
    minCents: minReais == null ? null : minReais * 100 + 1,
    maxCents: maxReais == null ? null : maxReais * 100,
  }
}

const MOUSE_PRICE_BANDS = [
  band("ate-300", "Até R$300", null, 300),
  band("300-500", "R$300–500", 300, 500),
  band("500-800", "R$500–800", 500, 800),
  band("high-end", "High End", 800, null),
]

const KEYBOARD_PRICE_BANDS = [
  band("ate-400", "Até R$400", null, 400),
  band("400-700", "R$400–700", 400, 700),
  band("700-1000", "R$700–1.000", 700, 1000),
  band("high-end", "High End", 1000, null),
]

const MOUSEPAD_PRICE_BANDS = [
  band("ate-150", "Até R$150", null, 150),
  band("150-300", "R$150–300", 150, 300),
  band("300-500", "R$300–500", 300, 500),
  band("high-end", "High End", 500, null),
]

// ────────────────────────────────────────────
// Filtros completos (barra lateral)
// ────────────────────────────────────────────

export type CatalogFacet = {
  /** Nome do parâmetro na URL (`?peso=ate-45`). */
  key: string
  label: string
  options: { value: string; label: string }[]
  /** Valor do produto nesta faceta; `null` = sem o dado, não entra em nenhuma opção. */
  valueOf: (attrs: StoreProductAttributes) => string | null
}

/** Valor da URL para um atributo do banco; `null` sem o dado. */
function lookup(map: Record<string, string>, key: string | null): string | null {
  return key == null ? null : map[key] ?? null
}

function weightBucket(grams: number | null): string | null {
  if (grams == null) return null
  if (grams <= 45) return "ate-45"
  if (grams <= 55) return "45-55"
  if (grams <= 65) return "55-65"
  if (grams <= 80) return "65-80"
  return "80-mais"
}

const CONNECTION_FACET: CatalogFacet = {
  key: "conexao",
  label: "Conexão",
  options: [
    { value: "sem-fio", label: "Sem fio" },
    { value: "com-fio", label: "Com fio" },
  ],
  valueOf: (a) => (a.connection === "wireless" ? "sem-fio" : a.connection === "wired" ? "com-fio" : null),
}

const MOUSE_FACETS: CatalogFacet[] = [
  {
    key: "peso",
    label: "Peso",
    options: [
      { value: "ate-45", label: "Até 45g" },
      { value: "45-55", label: "45–55g" },
      { value: "55-65", label: "55–65g" },
      { value: "65-80", label: "65–80g" },
      { value: "80-mais", label: "Acima de 80g" },
    ],
    valueOf: (a) => weightBucket(a.weightGrams),
  },
  {
    key: "formato",
    label: "Formato",
    options: [
      { value: "simetrico", label: "Simétrico" },
      { value: "ergonomico", label: "Ergonômico" },
    ],
    valueOf: (a) => (a.shape === "symmetrical" ? "simetrico" : a.shape === "ergonomic" ? "ergonomico" : null),
  },
  {
    key: "tamanho",
    label: "Tamanho",
    options: [
      { value: "fingertip", label: "Fingertip" },
      { value: "pequeno", label: "Pequeno" },
      { value: "medio", label: "Médio" },
      { value: "grande", label: "Grande" },
    ],
    valueOf: (a) =>
      a.size === "fingertip"
        ? "fingertip"
        : a.size === "small"
          ? "pequeno"
          : a.size === "medium"
            ? "medio"
            : a.size === "large"
              ? "grande"
              : null,
  },
  CONNECTION_FACET,
  {
    key: "material",
    label: "Material e acabamento",
    options: [
      { value: "magnesio", label: "Magnésio" },
      { value: "fibra-de-carbono", label: "Fibra de carbono" },
      { value: "fibra-de-vidro", label: "Fibra de vidro" },
      { value: "plastico", label: "Plástico" },
      { value: "emborrachado", label: "Emborrachado" },
      { value: "metalizado", label: "Metalizado" },
    ],
    valueOf: (a) =>
      lookup(
        {
          magnesium: "magnesio",
          carbon: "fibra-de-carbono",
          fiberglass: "fibra-de-vidro",
          plastic: "plastico",
          rubberized: "emborrachado",
          metallic: "metalizado",
        },
        a.material
      ),
  },
]

const KEYBOARD_FACETS: CatalogFacet[] = [
  {
    key: "switch",
    label: "Tipo de switch",
    options: [
      { value: "magnetico", label: "Magnético" },
      { value: "mecanico", label: "Mecânico" },
    ],
    valueOf: (a) =>
      a.keyboardType === "magnetic" ? "magnetico" : a.keyboardType === "mechanical" ? "mecanico" : null,
  },
  {
    key: "layout",
    label: "Layout",
    options: [
      { value: "60", label: "60%" },
      { value: "65", label: "65%" },
      { value: "75", label: "75%" },
      { value: "tkl", label: "TKL" },
      { value: "full", label: "Full size" },
    ],
    valueOf: (a) => a.layout,
  },
  CONNECTION_FACET,
  {
    key: "case",
    label: "Case",
    options: [
      { value: "aluminio", label: "Alumínio" },
      { value: "magnesio", label: "Magnésio" },
      { value: "plastico", label: "Plástico" },
    ],
    valueOf: (a) => lookup({ aluminum: "aluminio", magnesium: "magnesio", plastic: "plastico" }, a.caseMaterial),
  },
]

const MOUSEPAD_FACETS: CatalogFacet[] = [
  {
    key: "superficie",
    label: "Superfície",
    options: [
      { value: "speed", label: "Speed" },
      { value: "controle", label: "Controle" },
      { value: "hibrido", label: "Híbrido" },
    ],
    valueOf: (a) =>
      a.padSurface === "speed" ? "speed" : a.padSurface === "control" ? "controle" : a.padSurface === "hybrid" ? "hibrido" : null,
  },
  {
    key: "base",
    label: "Base",
    options: [
      { value: "poron", label: "Poron" },
      { value: "borracha", label: "Borracha" },
      { value: "silicone", label: "Silicone" },
    ],
    valueOf: (a) => lookup({ poron: "poron", rubber: "borracha", silicone: "silicone" }, a.padBase),
  },
]

// ────────────────────────────────────────────
// Configuração por grupo do menu
// ────────────────────────────────────────────

export type CatalogQuickFilter =
  | { kind: "collection"; key: string }
  | { kind: "price"; band: CatalogPriceBand }

export type CatalogGroupConfig = {
  collections: CatalogCollection[]
  priceBands: CatalogPriceBand[]
  facets: CatalogFacet[]
  /** Chips do topo da página de categoria, na ordem em que aparecem. */
  quickFilters: CatalogQuickFilter[]
}

const MOUSE_CONFIG: CatalogGroupConfig = {
  collections: MOUSE_COLLECTIONS,
  priceBands: MOUSE_PRICE_BANDS,
  facets: MOUSE_FACETS,
  quickFilters: [
    { kind: "collection", key: "fps" },
    { kind: "collection", key: "ultraleves" },
    { kind: "collection", key: "ergonomicos" },
    { kind: "price", band: band("ate-500", "Até R$500", null, 500) },
    { kind: "collection", key: "magnesio" },
    { kind: "collection", key: "sem-fio" },
    { kind: "collection", key: "custo-beneficio" },
  ],
}

const KEYBOARD_CONFIG: CatalogGroupConfig = {
  collections: KEYBOARD_COLLECTIONS,
  priceBands: KEYBOARD_PRICE_BANDS,
  facets: KEYBOARD_FACETS,
  quickFilters: [
    { kind: "collection", key: "fps" },
    { kind: "collection", key: "magneticos" },
    { kind: "collection", key: "compactos" },
    { kind: "price", band: band("ate-700", "Até R$700", null, 700) },
    { kind: "collection", key: "aluminio" },
    { kind: "collection", key: "custo-beneficio" },
  ],
}

const MOUSEPAD_CONFIG: CatalogGroupConfig = {
  collections: MOUSEPAD_COLLECTIONS,
  priceBands: MOUSEPAD_PRICE_BANDS,
  facets: MOUSEPAD_FACETS,
  quickFilters: [
    { kind: "collection", key: "speed" },
    { kind: "collection", key: "controle" },
    { kind: "collection", key: "hibridos" },
    { kind: "price", band: band("ate-300", "Até R$300", null, 300) },
  ],
}

/** Áudio e Outros juntam categorias diferentes: o "tipo" ali é a própria categoria. */
const CATALOG_CONFIG: Partial<Record<StoreNavGroup, CatalogGroupConfig>> = {
  mouse: MOUSE_CONFIG,
  teclado: KEYBOARD_CONFIG,
  mousepad: MOUSEPAD_CONFIG,
}

export function catalogConfigFor(category: string | null | undefined): CatalogGroupConfig | null {
  if (!category) return null
  return CATALOG_CONFIG[classifyStoreNavGroup(category)] ?? null
}

export function catalogConfigForGroup(group: StoreNavGroup): CatalogGroupConfig | null {
  return CATALOG_CONFIG[group] ?? null
}

/** Faixa pela chave: as do menu e as dos chips rápidos ("Até R$500"). */
export function findPriceBand(config: CatalogGroupConfig, key: string): CatalogPriceBand | null {
  return (
    config.priceBands.find((item) => item.key === key) ??
    config.quickFilters.flatMap((quick) => (quick.kind === "price" ? [quick.band] : [])).find((item) => item.key === key) ??
    null
  )
}

export function priceInBand(priceCents: number, priceBand: Pick<CatalogPriceBand, "minCents" | "maxCents">): boolean {
  if (priceBand.minCents != null && priceCents < priceBand.minCents) return false
  if (priceBand.maxCents != null && priceCents > priceBand.maxCents) return false
  return true
}

// ────────────────────────────────────────────
// Seleção (o que a pessoa marcou) e casamento
// ────────────────────────────────────────────

export type CatalogSelection = {
  /** Tipos marcados: precisam valer TODOS ("Ultraleves" + "Magnésio" = ultraleve de magnésio). */
  collections: string[]
  /** Opções por faceta: dentro de uma faceta vale QUALQUER uma (Simétrico ou Ergonômico). */
  facets: Record<string, string[]>
}

export const EMPTY_CATALOG_SELECTION: CatalogSelection = { collections: [], facets: {} }

export function hasCatalogSelection(selection: CatalogSelection | null | undefined): boolean {
  if (!selection) return false
  return selection.collections.length > 0 || Object.values(selection.facets).some((values) => values.length > 0)
}

/**
 * O produto bate com tudo que foi marcado? Cada produto é avaliado pela
 * configuração do SEU grupo: "fps" existe em mouse e em teclado, cada um com
 * a sua regra; um tipo que o grupo não tem simplesmente não casa.
 */
export function matchesCatalogSelection(
  category: string | null,
  attrs: StoreProductAttributes,
  selection: CatalogSelection
): boolean {
  if (!hasCatalogSelection(selection)) return true
  const config = catalogConfigFor(category)
  if (!config) return false

  for (const key of selection.collections) {
    const collection = config.collections.find((item) => item.key === key)
    if (!collection || !collection.match(attrs)) return false
  }
  for (const [facetKey, values] of Object.entries(selection.facets)) {
    if (values.length === 0) continue
    const facet = config.facets.find((item) => item.key === facetKey)
    if (!facet) return false
    const value = facet.valueOf(attrs)
    if (value == null || !values.includes(value)) return false
  }
  return true
}

/** Contagens de uma categoria: alimentam o número ao lado de cada opção e escondem a que daria zero. */
export type StoreCatalogFacetCounts = {
  collections: Record<string, number>
  facets: Record<string, Record<string, number>>
  priceBands: Record<string, number>
}

// ────────────────────────────────────────────
// Ordenação
// ────────────────────────────────────────────

export const STORE_SORT_KEYS = [
  "relevance",
  "recent",
  "price-asc",
  "price-desc",
  "best-selling",
  "top-rated",
  "discount",
  "name-asc",
  "name-desc",
] as const

export type StoreSortKey = (typeof STORE_SORT_KEYS)[number]

/** O que a vitrine oferece. `relevance` só com busca ativa; nome A-Z segue aceito pela API, mas saiu da tela. */
export const STORE_SORT_OPTIONS: { key: StoreSortKey; label: string; slug: string }[] = [
  { key: "relevance", label: "Mais relevantes", slug: "relevancia" },
  { key: "recent", label: "Mais recentes", slug: "recentes" },
  { key: "price-asc", label: "Menor preço", slug: "menor-preco" },
  { key: "price-desc", label: "Maior preço", slug: "maior-preco" },
  { key: "best-selling", label: "Mais vendidos", slug: "mais-vendidos" },
  { key: "top-rated", label: "Melhor avaliados", slug: "melhor-avaliados" },
  { key: "discount", label: "Maior desconto", slug: "maior-desconto" },
]

export function isStoreSortKey(value: unknown): value is StoreSortKey {
  return typeof value === "string" && (STORE_SORT_KEYS as readonly string[]).includes(value)
}

// ────────────────────────────────────────────
// URL (links do menu, compartilhar, voltar do produto)
// ────────────────────────────────────────────

/** Parâmetros que a página de categoria entende. `q` e `ofertas` são da busca/Hero e moram em outro lugar. */
export type CatalogUrlState = {
  collections: string[]
  brands: string[]
  priceBand: string | null
  facets: Record<string, string[]>
  sort: StoreSortKey | null
}

const RESERVED_PARAMS = new Set(["tipo", "marca", "preco", "ordem", "q", "ofertas", "categoria"])

function csv(value: string | null): string[] {
  return value ? value.split(",").map((item) => item.trim()).filter(Boolean) : []
}

/**
 * Lê os filtros da URL. Facetas desconhecidas para a categoria são ignoradas
 * (link velho ou digitado à mão não quebra a página, só não filtra).
 */
export function parseCatalogParams(params: URLSearchParams, category: string | null): CatalogUrlState {
  const config = catalogConfigFor(category)
  const facets: Record<string, string[]> = {}
  for (const facet of config?.facets ?? []) {
    if (RESERVED_PARAMS.has(facet.key)) continue
    const allowed = new Set(facet.options.map((option) => option.value))
    const values = csv(params.get(facet.key)).filter((value) => allowed.has(value))
    if (values.length > 0) facets[facet.key] = values
  }

  const collectionKeys = new Set(config?.collections.map((item) => item.key) ?? [])
  const priceBandKey = params.get("preco")
  const sortSlug = params.get("ordem")

  return {
    collections: csv(params.get("tipo")).filter((key) => collectionKeys.has(key)),
    brands: csv(params.get("marca")),
    priceBand: config && priceBandKey && findPriceBand(config, priceBandKey) ? priceBandKey : null,
    facets,
    sort: STORE_SORT_OPTIONS.find((option) => option.slug === sortSlug)?.key ?? null,
  }
}

/**
 * Escreve os filtros da página de categoria na URL, preservando o que não é
 * dela (busca, campanha). Mesma forma que o menu monta, então o link do menu
 * e o link copiado depois de filtrar são intercambiáveis.
 */
export function writeCatalogParams(base: URLSearchParams, state: CatalogUrlState, category: string | null): URLSearchParams {
  const next = new URLSearchParams(base.toString())
  for (const key of ["tipo", "marca", "preco", "ordem"]) next.delete(key)
  for (const facet of catalogConfigFor(category)?.facets ?? []) next.delete(facet.key)

  if (state.collections.length > 0) next.set("tipo", state.collections.join(","))
  if (state.brands.length > 0) next.set("marca", state.brands.join(","))
  if (state.priceBand) next.set("preco", state.priceBand)
  for (const [key, values] of Object.entries(state.facets)) {
    if (values.length > 0) next.set(key, values.join(","))
  }
  const sortSlug = state.sort ? STORE_SORT_OPTIONS.find((option) => option.key === state.sort)?.slug : null
  if (sortSlug && state.sort !== "recent" && state.sort !== "relevance") next.set("ordem", sortSlug)
  return next
}

/** Link de categoria já filtrada: usado pelo mega menu. */
export function catalogHref(category: string, params: Record<string, string> = {}): string {
  const search = new URLSearchParams(params).toString()
  return `/loja/categoria/${encodeURIComponent(category)}${search ? `?${search}` : ""}`
}
