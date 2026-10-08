import "server-only"

import { unstable_cache } from "next/cache"

import { listAllPeripherals, type PeripheralRecord } from "@/lib/server/repositories/peripherals-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  catalogConfigFor,
  categoryPagesIncluding,
  EMPTY_ATTRIBUTES,
  matchesCatalogSelection,
  priceInBand,
  type CatalogGroupConfig,
  type CatalogSelection,
  type StoreCatalogFacetCounts,
  type StoreProductAttributes,
} from "@/lib/store-catalog"
import { classifyStoreNavGroup } from "@/lib/store-category-icons"

/**
 * Atributos normalizados de cada produto ativo da Loja, para os filtros do
 * catálogo (`lib/store-catalog.ts`). Três fontes, nesta ordem:
 *
 * 1. a ficha técnica do ANÚNCIO (`store_product_specs`): é o que a página do
 *    produto mostra, e pode ser mais específica que o periférico (uma edição
 *    em magnésio de um mouse cadastrado em plástico);
 * 2. o periférico vinculado no Database (FK legado `peripheral_id` primeiro,
 *    depois o primeiro da lista M:N, mesma precedência da página do produto):
 *    peso, formato, tamanho, conexão, acabamento, tags e tierlists;
 * 3. o nome do anúncio, só para o que ele diz sem ambiguidade ("Magnesium").
 *
 * O catálogo é pequeno (dezenas de produtos) e muda pouco: o índice inteiro
 * fica em cache por 60 s, o mesmo `revalidate` das páginas da Loja, e o
 * filtro vira um recorte de ids na consulta de produtos.
 */

type IndexedProduct = { category: string | null; attributes: StoreProductAttributes }

export type StoreCatalogIndex = Record<string, IndexedProduct>

function normalizeLabel(label: string): string {
  return label
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : ""
}

/** "8000Hz", "8 KHz", "8K", "4000" → Hz. */
function parsePollingHz(value: string): number | null {
  const match = value.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(k)?/)
  if (!match) return null
  const hz = Number(match[1]) * (match[2] ? 1000 : 1)
  return Number.isFinite(hz) && hz >= 125 && hz <= 16000 ? hz : null
}

/** "48g", "60/66g", "1.8kg", "57" → gramas. */
function parseGrams(value: string): number | null {
  const match = value.toLowerCase().replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g)?/)
  if (!match) return null
  const grams = Number(match[1]) * (match[2] === "kg" ? 1000 : 1)
  return Number.isFinite(grams) && grams > 0 ? grams : null
}

function parseConnection(value: string): StoreProductAttributes["connection"] {
  const v = normalizeLabel(value)
  if (!v) return null
  // "Com fio e sem fio" é sem fio: o que a pessoa procura é poder tirar o cabo.
  if (/wireless|sem fio|2\.4|bluetooth|tri.?mode/.test(v)) return "wireless"
  if (/wired|com fio|cabo|usb/.test(v)) return "wired"
  return null
}

function parseShape(value: string): StoreProductAttributes["shape"] {
  const v = normalizeLabel(value)
  if (/ergo/.test(v)) return "ergonomic"
  if (/sim|symm|ambid/.test(v)) return "symmetrical"
  return null
}

function parseSize(value: string): StoreProductAttributes["size"] {
  const v = normalizeLabel(value)
  if (v === "fingertip") return "fingertip"
  if (v === "small" || v === "pequeno") return "small"
  if (v === "medium" || v === "medio") return "medium"
  if (v === "large" || v === "grande") return "large"
  return null
}

function parseMaterial(value: string): StoreProductAttributes["material"] {
  const v = normalizeLabel(value)
  if (!v) return null
  if (/magn/.test(v)) return "magnesium"
  if (/carbon|carbono/.test(v)) return "carbon"
  if (/vidro|glass/.test(v)) return "fiberglass"
  if (/borrach|rubber/.test(v)) return "rubberized"
  if (/metal/.test(v)) return "metallic"
  if (/plastic/.test(v)) return "plastic"
  return null
}

function parseCaseMaterial(value: string): StoreProductAttributes["caseMaterial"] {
  const v = normalizeLabel(value)
  if (/alum/.test(v)) return "aluminum"
  if (/magn/.test(v)) return "magnesium"
  if (/plastic/.test(v)) return "plastic"
  return null
}

function parseLayout(value: string): StoreProductAttributes["layout"] {
  const v = normalizeLabel(value)
  if (/\b60\b/.test(v)) return "60"
  if (/\b65\b|\b68\b/.test(v)) return "65"
  if (/\b75\b/.test(v)) return "75"
  if (/tkl|\b80\b|\b87\b/.test(v)) return "tkl"
  if (/\b100\b|\b104\b|full/.test(v)) return "full"
  return null
}

function parseKeyboardType(value: string): StoreProductAttributes["keyboardType"] {
  const v = normalizeLabel(value)
  if (/magnet|hall|\bhe\b/.test(v)) return "magnetic"
  if (/mechan|mecan/.test(v)) return "mechanical"
  return null
}

function parsePadBase(value: string): StoreProductAttributes["padBase"] {
  const v = normalizeLabel(value)
  if (/poron/.test(v)) return "poron"
  if (/borrach|rubber/.test(v)) return "rubber"
  if (/silicon/.test(v)) return "silicone"
  return null
}

/** Ficha técnica do anúncio, por rótulo normalizado ("peso", "conectividade"...). */
type OwnSpecs = Map<string, string>

function ownSpec(specs: OwnSpecs | undefined, ...labels: string[]): string {
  if (!specs) return ""
  for (const label of labels) {
    const value = specs.get(label)
    if (value) return value
  }
  return ""
}

/** Faixa de peso que faz sentido para mouse: o "2g" de um anúncio de feet não vira mouse de 2 gramas. */
const MOUSE_WEIGHT_RANGE: [number, number] = [15, 250]

function buildAttributes(
  product: { name: string; category: string | null },
  specs: OwnSpecs | undefined,
  peripheral: PeripheralRecord | undefined
): StoreProductAttributes {
  const top = (peripheral?.specs ?? {}) as Record<string, unknown>
  const details = (top.details ?? {}) as Record<string, unknown>
  const tags = peripheral?.tags ?? []
  const tierlists = Array.isArray(top.tierlistCategories)
    ? (top.tierlistCategories as unknown[]).filter((item): item is string => typeof item === "string")
    : []
  const group = product.category ? classifyStoreNavGroup(product.category) : null

  // Colunas reais do periférico antes do `specs` legado (dual-write), mesma
  // regra da página do periférico: `coluna ?? specs.campo`.
  const ownWeight = ownSpec(specs, "peso", "weight")
  let weightGrams = ownWeight
    ? parseGrams(ownWeight)
    : peripheral?.weightG ?? (text(details.weight) ? parseGrams(text(details.weight)) : null)
  if (group === "mouse" && weightGrams != null && (weightGrams < MOUSE_WEIGHT_RANGE[0] || weightGrams > MOUSE_WEIGHT_RANGE[1])) {
    weightGrams = null
  }

  const connection =
    parseConnection(ownSpec(specs, "conectividade", "conexao", "connectivity")) ??
    parseConnection(text(peripheral?.connectivity) || text(top.connectivity)) ??
    (top.trimode === "yes" ? "wireless" : null) ??
    (tags.includes("wireless") ? "wireless" : tags.includes("wired") ? "wired" : null)

  const material =
    parseMaterial(ownSpec(specs, "coating", "material", "acabamento", "carcaca")) ??
    parseMaterial(text(details.coating)) ??
    (tags.includes("fibra_carbono") ? "carbon" : null) ??
    (/magnesium|magnesio/.test(normalizeLabel(product.name)) ? "magnesium" : null)

  // Medidas de Rapid Trigger no anúncio (RT mínimo, deadzone) só existem em
  // teclado magnético: o anúncio às vezes não diz o tipo, mas mostra isso.
  const hasRapidTriggerSpecs = Boolean(ownSpec(specs, "rt minimo", "deadzone"))
  const keyboardType =
    parseKeyboardType(ownSpec(specs, "tipo", "tipo de switch")) ??
    parseKeyboardType(text(top.keyboardType)) ??
    (tierlists.includes("magnetic") || hasRapidTriggerSpecs ? "magnetic" : null)

  const padSurface =
    tags.includes("hibrido") || (tags.includes("speed") && tags.includes("control"))
      ? "hybrid"
      : tags.includes("speed")
        ? "speed"
        : tags.includes("control")
          ? "control"
          : null

  const rawPolling = ownSpec(specs, "polling rate", "polling") || text(details.pollingRate)

  return {
    ...EMPTY_ATTRIBUTES,
    weightGrams,
    shape: parseShape(ownSpec(specs, "shape", "formato")) ?? parseShape(text(peripheral?.mouseShape) || text(top.mouseShape)),
    size: parseSize(text(top.size)),
    connection,
    material,
    keyboardType,
    layout:
      parseLayout(ownSpec(specs, "layout")) ?? parseLayout(text(peripheral?.keyboardLayout) || text(top.keyboardLayout)),
    caseMaterial: parseCaseMaterial(ownSpec(specs, "case")) ?? parseCaseMaterial(text(top.keyboardCase)),
    padSurface,
    padBase:
      parsePadBase(ownSpec(specs, "base")) ??
      parsePadBase(text(top.padType)) ??
      (tags.includes("poron") ? "poron" : tags.includes("borracha") ? "rubber" : tags.includes("silicone") ? "silicone" : null),
    driver: ownSpec(specs, "sensor", "drivers", "driver") || text(top.driver) || null,
    pollingHz: rawPolling ? parsePollingHz(rawPolling) : null,
    tags,
    tierlists,
  }
}

/** Índice de atributos de todo produto ativo da Loja. Ver o comentário do módulo. */
export const getStoreCatalogIndex = unstable_cache(
  async (): Promise<StoreCatalogIndex> => {
    const db = createSupabaseAdminClient()
    const { data: products, error } = await db
      .from("store_products")
      .select("id, name, category, peripheral_id")
      .eq("type", "store")
      .eq("is_active", true)

    if (error) {
      console.error("[store-catalog-repository] getStoreCatalogIndex:", error)
      return {}
    }
    const rows = products ?? []
    if (rows.length === 0) return {}
    const ids = rows.map((row) => row.id)

    const [{ data: links }, { data: specRows }, peripherals] = await Promise.all([
      db
        .from("store_product_peripherals")
        .select("product_id, peripheral_id, position")
        .in("product_id", ids)
        .order("position", { ascending: true }),
      db.from("store_product_specs").select("product_id, label, value").in("product_id", ids),
      listAllPeripherals(),
    ])

    const peripheralById = new Map(peripherals.map((peripheral) => [peripheral.id, peripheral]))
    const firstLink = new Map<string, string>()
    for (const link of links ?? []) {
      if (!firstLink.has(link.product_id)) firstLink.set(link.product_id, link.peripheral_id)
    }

    const specsByProduct = new Map<string, OwnSpecs>()
    for (const spec of specRows ?? []) {
      let specs = specsByProduct.get(spec.product_id)
      if (!specs) specsByProduct.set(spec.product_id, (specs = new Map()))
      const label = normalizeLabel(spec.label)
      // Rótulo repetido (o admin às vezes cadastra "Peso" duas vezes): vale o primeiro.
      if (!specs.has(label) && spec.value?.trim()) specs.set(label, spec.value.trim())
    }

    const index: StoreCatalogIndex = {}
    for (const row of rows) {
      const peripheralId = row.peripheral_id ?? firstLink.get(row.id)
      index[row.id] = {
        category: row.category,
        attributes: buildAttributes(row, specsByProduct.get(row.id), peripheralId ? peripheralById.get(peripheralId) : undefined),
      }
    }
    return index
  },
  ["store-catalog-repository:getStoreCatalogIndex"],
  { revalidate: 60 }
)

/** Ids dos produtos ativos que batem com os tipos/facetas marcados. */
export async function matchCatalogProductIds(selection: CatalogSelection): Promise<string[]> {
  const index = await getStoreCatalogIndex()
  return Object.entries(index)
    .filter(([, product]) => matchesCatalogSelection(product.category, product.attributes, selection))
    .map(([id]) => id)
}

/**
 * Contagem de cada tipo, opção de faceta e faixa de preço, por categoria.
 * `prices` = preço efetivo de cada produto (o mesmo que o filtro de faixa
 * compara no banco), vindo da consulta de `getStoreFilterOptions`.
 */
export async function getCatalogFacetCounts(
  products: { id: string; category: string | null; effectiveCents: number }[]
): Promise<Record<string, StoreCatalogFacetCounts>> {
  const index = await getStoreCatalogIndex()
  const counts: Record<string, StoreCatalogFacetCounts> = {}

  // A contagem é por PÁGINA de categoria: o glasspad conta também na de
  // Mousepad, que o lista (`categoryPageScope`). Senão o chip "Speed 1" da
  // página levaria a uma grade com dois.
  for (const product of products) {
    if (!product.category) continue
    const attributes = index[product.id]?.attributes ?? EMPTY_ATTRIBUTES
    for (const page of categoryPagesIncluding(product.category)) {
      const config = catalogConfigFor(page)
      if (!config) continue
      countCatalogFacets((counts[page] ??= { collections: {}, facets: {}, priceBands: {} }), config, attributes, product.effectiveCents)
    }
  }
  return counts
}

function countCatalogFacets(
  entry: StoreCatalogFacetCounts,
  config: CatalogGroupConfig,
  attributes: StoreProductAttributes,
  effectiveCents: number
) {
  for (const collection of config.collections) {
    if (collection.match(attributes)) entry.collections[collection.key] = (entry.collections[collection.key] ?? 0) + 1
  }
  for (const facet of config.facets) {
    const value = facet.valueOf(attributes)
    if (value == null) continue
    const facetCounts = (entry.facets[facet.key] ??= {})
    facetCounts[value] = (facetCounts[value] ?? 0) + 1
  }
  const bands = [...config.priceBands, ...config.quickFilters.flatMap((quick) => (quick.kind === "price" ? [quick.band] : []))]
  for (const priceBand of bands) {
    if (priceInBand(effectiveCents, priceBand)) {
      entry.priceBands[priceBand.key] = (entry.priceBands[priceBand.key] ?? 0) + 1
    }
  }
}
