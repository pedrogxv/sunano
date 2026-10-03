import { BadgeCheck, Gem, Megaphone, Rocket, Sparkles, ThumbsUp, Timer, TrendingUp, type LucideIcon } from "lucide-react"

import type { StoreProductAttributes } from "@/lib/store-catalog"
import { classifyStoreNavGroup } from "@/lib/store-category-icons"
import { getTagLabel } from "@/lib/tag-options"

/**
 * Card da vitrine: o selo principal e as características técnicas. Módulo
 * puro; o servidor resolve (store-repository) e o card só desenha, então a
 * vitrine, os favoritos e o Hero mostram o mesmo selo para o mesmo produto.
 */

// ────────────────────────────────────────────
// Selo principal
// ────────────────────────────────────────────

export type StoreCardBadge =
  | "pre_order"
  | "launch"
  | "sunano_choice"
  | "limited_edition"
  | "low_stock"
  | "best_seller"
  | "best_value"
  | "new"

/**
 * O que o admin pode escolher (`store_products.card_badge`). Nulo = automático.
 * `none` é a ESCOLHA de não ter selo, não ausência de escolha.
 *
 * Pré-venda, Estoque baixo e Mais vendido ficam de fora: são FATOS sobre o
 * produto, não curadoria. Escolhidos à mão, o card diria "Estoque baixo" com
 * 40 unidades na prateleira, ou "Mais vendido" com uma venda.
 */
export const STORE_CARD_BADGE_CHOICES = ["sunano_choice", "limited_edition", "best_value", "new", "none"] as const

export type StoreCardBadgeChoice = (typeof STORE_CARD_BADGE_CHOICES)[number]

export function isStoreCardBadgeChoice(value: unknown): value is StoreCardBadgeChoice {
  return typeof value === "string" && (STORE_CARD_BADGE_CHOICES as readonly string[]).includes(value)
}

/**
 * Fundo sólido em todos: a foto do produto às vezes é um quadrado branco, às
 * vezes um recorte no escuro, e o selo precisa ler nos dois. Cada selo tem a
 * sua cor; nenhum usa laranja + chama, que é a Aura.
 */
export const STORE_CARD_BADGE: Record<StoreCardBadge, { label: string; icon: LucideIcon; className: string }> = {
  pre_order: { label: "Pré-venda", icon: Rocket, className: "bg-amber-400 text-[#1a1200]" },
  launch: { label: "Lançamento", icon: Megaphone, className: "bg-violet-400 text-violet-950" },
  sunano_choice: {
    label: "Escolha Sunano",
    icon: BadgeCheck,
    className: "bg-gradient-to-r from-[#7F77DD] to-[#D4537E] text-white",
  },
  limited_edition: { label: "Edição limitada", icon: Gem, className: "bg-yellow-200 text-yellow-950" },
  low_stock: { label: "Estoque baixo", icon: Timer, className: "bg-red-500 text-white" },
  best_seller: { label: "Mais vendido", icon: TrendingUp, className: "bg-sky-400 text-[#04121c]" },
  best_value: { label: "Melhor custo-benefício", icon: ThumbsUp, className: "bg-emerald-400 text-emerald-950" },
  new: { label: "Novo", icon: Sparkles, className: "bg-lime-300 text-lime-950" },
}

export const STORE_CARD_BADGE_CHOICE_LABEL: Record<StoreCardBadgeChoice, string> = {
  sunano_choice: STORE_CARD_BADGE.sunano_choice.label,
  limited_edition: STORE_CARD_BADGE.limited_edition.label,
  best_value: STORE_CARD_BADGE.best_value.label,
  new: STORE_CARD_BADGE.new.label,
  none: "Sem selo",
}

/** "Últimas N unidades": o mesmo corte que a página do produto e o checkout usam. */
export const LOW_STOCK_MAX_UNITS = 3
/** Produto cadastrado há até N dias conta como novo. */
export const NEW_PRODUCT_DAYS = 30
/** "Mais vendido" automático: só o pódio de vendas, e com volume de verdade. */
export const BEST_SELLER_TOP = 3
export const BEST_SELLER_MIN_UNITS = 5
/** Mesma janela da seção "Mais vendidos" da Home (`listBestSellingProducts`). */
export const BEST_SELLER_WINDOW_DAYS = 90

export type CardBadgeFacts = {
  soldOut: boolean
  saleType: "pre_order" | "ready_stock" | "normal"
  /** Escolha do admin; `null` = automático. */
  choice: StoreCardBadgeChoice | null
  /** Estoque da variante que o card anuncia; `null` = sem controle. */
  stock: number | null
  /** No pódio de vendas (`BEST_SELLER_TOP`, com `BEST_SELLER_MIN_UNITS`). */
  isBestSeller: boolean
  /** Tag "Custo-Benefício" do periférico no Database. */
  isBestValue: boolean
  /** Cadastrado há até `NEW_PRODUCT_DAYS` dias, e novo (não usado). */
  isNew: boolean
  /** Marcado como Lançamento no admin e ainda no prazo (`isLaunchActive`). */
  isLaunch: boolean
}

/**
 * No máximo UM selo. Precedência:
 *
 * 1. Esgotado não tem selo: a foto já sai com "Esgotado" por cima, e um
 *    "Mais vendido" ali só disputa atenção com a única coisa que importa.
 * 2. Pré-venda vence tudo, inclusive a escolha do admin: muda QUANDO o
 *    produto chega, e esconder isso atrás de "Edição limitada" faria a pessoa
 *    descobrir a espera só no checkout.
 * 3. Lançamento: também é marcado à mão, mas é a razão de o produto estar
 *    na seção "Lançamentos e Pré-venda", e o card precisa dizer o mesmo lá.
 * 4. A escolha do admin (ou "Sem selo").
 * 5. Automático: estoque baixo > mais vendido > custo-benefício > novo. A
 *    urgência vem primeiro porque é a que expira.
 */
export function resolveCardBadge(facts: CardBadgeFacts): StoreCardBadge | null {
  if (facts.soldOut) return null
  if (facts.saleType === "pre_order") return "pre_order"
  if (facts.isLaunch) return "launch"
  if (facts.choice === "none") return null
  if (facts.choice) return facts.choice
  if (facts.stock !== null && facts.stock > 0 && facts.stock <= LOW_STOCK_MAX_UNITS) return "low_stock"
  if (facts.isBestSeller) return "best_seller"
  if (facts.isBestValue) return "best_value"
  if (facts.isNew) return "new"
  return null
}

// ────────────────────────────────────────────
// Características técnicas
// ────────────────────────────────────────────

export const CARD_HIGHLIGHTS_MAX = 3
export const CARD_HIGHLIGHT_MAX_CHARS = 18

/** Um termo do vocabulário de características (seletor do admin). */
export type CardHighlightOption = {
  label: string
  /** Produtos que escolheram este termo à mão. */
  manualUses: number
  /** Produtos cujo card mostra este termo pelo automático (Database). */
  autoUses: number
}

export type CardHighlightVocabulary = {
  options: CardHighlightOption[]
  /** O que o automático mostraria NESTE produto (vazio para produto novo ou inativo). */
  suggested: string[]
}

/** Limpa a lista manual do admin: sem vazio, sem repetido, no máximo 3. */
export function sanitizeCardHighlights(values: readonly unknown[] | null | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values ?? []) {
    if (typeof value !== "string") continue
    const clean = value.replace(/\s+/g, " ").trim()
    if (!clean || clean.length > CARD_HIGHLIGHT_MAX_CHARS || seen.has(clean.toLowerCase())) continue
    seen.add(clean.toLowerCase())
    result.push(clean)
    if (result.length === CARD_HIGHLIGHTS_MAX) break
  }
  return result
}

/** 8000 → "8K". Abaixo de 2000 Hz não é diferencial, não ocupa espaço no card. */
function pollingLabel(hz: number | null): string | null {
  if (hz == null || hz < 2000) return null
  return `${Number.isInteger(hz / 1000) ? hz / 1000 : (hz / 1000).toFixed(1)}K`
}

/** "Paw 3950", "PixArt PAW3950" → "PAW3950". Sem código reconhecível, o texto como veio. */
function sensorLabel(raw: string | null): string | null {
  if (!raw) return null
  const code = raw.match(/\b([a-z]{2,5})[\s-]?(\d{3,5}[a-z]{0,2})\b/i)
  if (code) return `${code[1]}${code[2]}`.toUpperCase()
  const clean = raw.trim()
  return clean.length <= CARD_HIGHLIGHT_MAX_CHARS ? clean : null
}

const MOUSE_MATERIAL_LABEL: Partial<Record<NonNullable<StoreProductAttributes["material"]>, string>> = {
  magnesium: "Magnésio",
  carbon: "Fibra de carbono",
  fiberglass: "Fibra de vidro",
}

const CASE_LABEL: Partial<Record<NonNullable<StoreProductAttributes["caseMaterial"]>, string>> = {
  aluminum: "Alumínio",
  magnesium: "Magnésio",
}

const LAYOUT_LABEL: Record<NonNullable<StoreProductAttributes["layout"]>, string> = {
  "60": "60%",
  "65": "65%",
  "75": "75%",
  tkl: "TKL",
  full: "Full size",
}

const PAD_SURFACE_LABEL: Record<NonNullable<StoreProductAttributes["padSurface"]>, string> = {
  speed: "Speed",
  control: "Control",
  hybrid: "Híbrido",
}

const PAD_BASE_LABEL: Record<NonNullable<StoreProductAttributes["padBase"]>, string> = {
  poron: "Base Poron",
  rubber: "Base de borracha",
  silicone: "Base de silicone",
}

/** Tags de assinatura sonora da IEM, na ordem em que valem como destaque. */
const IEM_SIGNATURE_TAGS = [
  "harman",
  "v_shaped",
  "u_shaped",
  "neutro",
  "neutro_quente",
  "quente",
  "escuro",
  "basshead",
  "vocal_forward",
  "ief_neutral",
  "jm_1",
]
const IEM_DRIVER_TAG_LABEL: Record<string, string> = { planar: "Driver planar" }
const IEM_MATERIAL_TAGS = ["metal", "resina", "plastico"]

function firstTagLabel(tags: string[], candidates: string[]): string | null {
  const tag = candidates.find((candidate) => tags.includes(candidate))
  return tag ? getTagLabel(tag, "pt-BR", "iem") ?? null : null
}

/**
 * 2 ou 3 características que fazem alguém escolher ESTE produto no meio da
 * grade, a partir do Database e da ficha técnica. Ordem por grupo:
 * mouse = peso, sensor, polling; teclado = tipo de switch, polling, case;
 * IEM = assinatura, drivers, material. Produto sem o dado fica com menos
 * itens (ou nenhum): característica inventada é pior que ausente.
 */
export function deriveCardHighlights(category: string | null, attrs: StoreProductAttributes): string[] {
  if (!category) return []
  const group = classifyStoreNavGroup(category)
  const candidates: (string | null)[] = []

  if (group === "mouse") {
    candidates.push(
      attrs.weightGrams != null ? `${Math.round(attrs.weightGrams)}g` : null,
      sensorLabel(attrs.driver),
      pollingLabel(attrs.pollingHz),
      attrs.material ? MOUSE_MATERIAL_LABEL[attrs.material] ?? null : null,
      attrs.connection === "wireless" ? "Sem fio" : null
    )
  } else if (group === "teclado") {
    candidates.push(
      attrs.keyboardType === "magnetic" ? "Hall Effect" : attrs.keyboardType === "mechanical" ? "Mecânico" : null,
      pollingLabel(attrs.pollingHz),
      attrs.caseMaterial ? CASE_LABEL[attrs.caseMaterial] ?? null : null,
      attrs.layout ? LAYOUT_LABEL[attrs.layout] : null,
      attrs.connection === "wireless" ? "Sem fio" : null
    )
  } else if (group === "mousepad") {
    candidates.push(
      attrs.padSurface ? PAD_SURFACE_LABEL[attrs.padSurface] : null,
      attrs.padBase ? PAD_BASE_LABEL[attrs.padBase] : null
    )
  } else if (/\biem\b/i.test(category)) {
    const driverTag = Object.keys(IEM_DRIVER_TAG_LABEL).find((tag) => attrs.tags.includes(tag))
    const drivers = attrs.driver && attrs.driver.length <= CARD_HIGHLIGHT_MAX_CHARS ? attrs.driver : null
    candidates.push(
      firstTagLabel(attrs.tags, IEM_SIGNATURE_TAGS),
      drivers ?? (driverTag ? IEM_DRIVER_TAG_LABEL[driverTag] : null),
      firstTagLabel(attrs.tags, IEM_MATERIAL_TAGS)
    )
  } else if (group === "audio") {
    candidates.push(attrs.connection === "wireless" ? "Sem fio" : null)
  }

  return sanitizeCardHighlights(candidates)
}
