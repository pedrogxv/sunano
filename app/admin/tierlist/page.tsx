"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { Edit, Plus, AlertCircle, AlertTriangle, X } from "lucide-react"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import {
  DndContext,
  DragOverEvent,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { cn } from "@/lib/utils"

import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Combobox } from "@/components/ui/combobox"
import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import {
  CARD_TAG_STYLES,
  CARD_TIER_STYLES,
  TIER_THEMES,
  CARD_PRICE_BAND_STYLES,
  PRICE_BAND_THEMES,
} from "@/lib/tierlist-theme"
import { PRICE_BANDS, GOLPE_KEY, PRICE_BAND_LABEL, PRICE_GROUP_SPEC_KEY, resolvePriceGroupKey, type PriceGroupKey } from "@/lib/price-band"
import { tierLabel, tiersForCategory } from "@/lib/tier-utils"
import { TierItemTooltipContent, type Ratings, type RatingKey } from "@/components/tierlist/TierItemTooltipContent"
import { FilterBar } from "@/components/tierlist/FilterBar"
import { TierlistMetaCard } from "@/components/admin/TierlistMetaCard"
import { CARD_SURFACE, CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"

type RatingMode = "oled" | "performance" | "value" | "recommended" | "soundTyping" | "mechanical" | "magnetic" | "pcb" | "ips_va" | "competitive"

type Category = "all" | "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp" | "psu"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado" | "raro" | "fibra_carbono" | "control" | "speed" | "silicone" | "ia" | "white_label" | "ips" | "va" | "tn" | "oled" | "miniled" | "fhd" | "qhd" | "4k" | "headphone"
type MouseShape = "symmetrical" | "ergonomic"
type KeyboardLayout = "60%" | "75%" | "tkl" | "full-size"

interface Peripheral {
  id: string
  name: string
  brand: string
  category: Category
  tier: TierValue
  price: number
  image_url: string | null
  tags: Tag[]
  specs: Record<string, string | number | boolean | string[] | undefined>
  created_at: string
  // Colunas migradas de `specs` — têm prioridade sobre o valor equivalente
  // dentro de `specs` durante a transição (dual-write).
  mouse_shape?: string | null
  keyboard_layout?: string | null
}

interface PeripheralApiRow extends Omit<Peripheral, "brand"> {
  brand_id: string
  brands: { name: string } | { name: string }[] | null
}

function normalizePeripheral(row: PeripheralApiRow): Peripheral {
  const brandRow = Array.isArray(row.brands) ? row.brands[0] : row.brands
  const { brand_id: _brandId, brands: _brands, ...rest } = row
  return { ...rest, brand: brandRow?.name ?? "" }
}

const CATEGORY_META = [
  { key: "keyboard" as Category, en: "Keyboard", pt: "Teclado" },
  { key: "mouse" as Category, en: "Mouse", pt: "Mouse" },
  { key: "mousepad" as Category, en: "Mousepad", pt: "Mousepad" },
  { key: "glasspad" as Category, en: "Glasspad", pt: "Glasspad" },
  { key: "iem" as Category, en: "IEM", pt: "Fone IEM" },
  { key: "headset" as Category, en: "Headset", pt: "Headset" },
  { key: "feet" as Category, en: "Mouse Feet", pt: "Feet" },
  { key: "chairs" as Category, en: "Chairs", pt: "Cadeiras" },
  { key: "monitors" as Category, en: "Monitors", pt: "Monitores" },
  { key: "switches" as Category, en: "Switches", pt: "Switches" },
  { key: "pcb" as Category, en: "PCB", pt: "PCB" },
  { key: "dac_amp" as Category, en: "DAC/AMP", pt: "DAC/AMP" },
  { key: "psu" as Category, en: "PSUs", pt: "Fontes" },
]

const ALL_TIER_ROWS: { key: Tier; label: string; accent: string; textColor: string }[] = [
  { key: "GOAT", label: "GOAT", accent: TIER_THEMES.GOAT.accent, textColor: TIER_THEMES.GOAT.textColor },
  { key: "SS", label: "SS", accent: TIER_THEMES.SS.accent, textColor: TIER_THEMES.SS.textColor },
  { key: "S", label: "S", accent: TIER_THEMES.S.accent, textColor: TIER_THEMES.S.textColor },
  { key: "A", label: "A", accent: TIER_THEMES.A.accent, textColor: TIER_THEMES.A.textColor },
  { key: "B", label: "B", accent: TIER_THEMES.B.accent, textColor: TIER_THEMES.B.textColor },
  { key: "C", label: "C", accent: TIER_THEMES.C.accent, textColor: TIER_THEMES.C.textColor },
  { key: "L", label: "L", accent: TIER_THEMES.L.accent, textColor: TIER_THEMES.L.textColor },
]

/** Fontes não usam SS e chamam o último tier de BOMBA — ver lib/tier-utils.ts. */
function getTierRows(category: Category) {
  const allowed = tiersForCategory(category)
  return ALL_TIER_ROWS
    .filter((row) => allowed.includes(row.key))
    .map((row) => ({ ...row, label: tierLabel(row.key, category) }))
}

const RATING_MODES: { key: RatingMode; en: string; pt: string }[] = [
  { key: "oled", en: "OLED", pt: "OLED" },
  { key: "performance", en: "General", pt: "Geral" },
  { key: "value", en: "Value", pt: "Custo Benefício" },
  { key: "recommended", en: "Recommended", pt: "Recomendado" },
  { key: "soundTyping", en: "Sound & Typing", pt: "Som e Digitação" },
  { key: "mechanical", en: "Mechanical", pt: "Mecânico" },
  { key: "magnetic", en: "Magnetic", pt: "Magnético" },
  { key: "pcb", en: "PCB", pt: "PCB" },
  { key: "ips_va", en: "IPS / VA", pt: "IPS / VA" },
  { key: "competitive", en: "Competitive", pt: "Competitivo" },
]

// Categorias que ainda oferecem a aba "recommended" (com rótulo próprio) — nas demais
// categorias essa opção foi removida do formulário e não deve aparecer como aba no board.
const RECOMMENDED_TAB_CATEGORIES = ["mousepad", "glasspad", "iem", "headset", "psu"]

// Ordem e cor das abas por categoria — espelha exatamente `ratingModes` da Tierlist pública
// (components/tierlist/TierlistGrid.tsx) para que admin e público mostrem as mesmas abas na
// mesma ordem, com o mesmo indicador de cor.
const MODES_BY_CATEGORY: Partial<Record<Category, { key: RatingMode; color: string }[]>> = {
  keyboard: [
    { key: "magnetic", color: "bg-blue-400" },
    { key: "value", color: "bg-emerald-400" },
    { key: "mechanical", color: "bg-purple-400" },
  ],
  monitors: [
    { key: "oled", color: "bg-amber-400" },
    { key: "ips_va", color: "bg-sky-400" },
    { key: "competitive", color: "bg-purple-400" },
    { key: "value", color: "bg-emerald-400" },
  ],
  mouse: [
    { key: "performance", color: "bg-red-400" },
    { key: "magnetic", color: "bg-blue-400" },
    { key: "value", color: "bg-emerald-400" },
  ],
  psu: [
    { key: "performance", color: "bg-red-400" },
    { key: "recommended", color: "bg-purple-400" },
    { key: "value", color: "bg-emerald-400" },
  ],
}

const RATING_MODE_COLORS: Record<RatingMode, string> = {
  oled: "bg-amber-400",
  performance: "bg-red-400",
  value: "bg-emerald-400",
  recommended: "bg-purple-400",
  soundTyping: "bg-cyan-500",
  mechanical: "bg-purple-400",
  magnetic: "bg-blue-400",
  pcb: "bg-slate-400",
  ips_va: "bg-sky-400",
  competitive: "bg-purple-400",
}

function getModesForCategory(category: Category): { key: RatingMode; color: string }[] {
  const override = MODES_BY_CATEGORY[category]
  if (override) return override

  if (category === "all") {
    return RATING_MODES.filter((m) => m.key !== "pcb").map((m) => ({
      key: m.key,
      color: RATING_MODE_COLORS[m.key],
    }))
  }

  const modes: { key: RatingMode; color: string }[] = [
    { key: "performance", color: "bg-red-400" },
    { key: "value", color: "bg-emerald-400" },
  ]
  if (RECOMMENDED_TAB_CATEGORIES.includes(category)) modes.push({ key: "recommended", color: "bg-purple-400" })
  if (category === "switches") modes.push({ key: "soundTyping", color: "bg-cyan-500" })
  return modes
}

// Labels específicos por categoria para MOUSEPAD, GLASSPAD, IEM e HEADSET
function getRatingModeLabel(mode: RatingMode, category: string, locale: string): string {
  if (category === "mousepad" || category === "glasspad") {
    if (mode === "performance") return "Geral"
    if (mode === "value") return "Nacional"
    if (mode === "recommended") return "Custo Benefício"
  }

  if (category === "psu" && mode === "recommended") return "Nacional"

  if (category === "iem" && mode === "recommended") return "Gamer"
  if (category === "headset" && mode === "recommended") return "Nacionais"

  if (category !== "switches" && mode === "soundTyping") {
    return ""
  }

  const mode_obj = RATING_MODES.find(m => m.key === mode)
  return locale === "en-US" ? (mode_obj?.en || "") : (mode_obj?.pt || "")
}

type PriceBand = "all" | "budget" | "mid" | "premium" | "golpe"
const LEGACY_TIER_ORDER_SPEC_KEY = "adminTierOrder"
// Ordem manual dentro de cada faixa de preço (aba Custo Benefício). Independente de
// `adminTierOrder_value` (que existia mas nunca foi usado, já que essa aba nunca renderizou
// o fluxo de tier normal) — usa uma chave própria pra não colidir caso o modo "value" volte
// a ter um fluxo de tier tradicional no futuro.
const PRICE_BAND_ORDER_KEY = "adminPriceBandOrder"
const ORDER_KEY_BY_MODE: Record<RatingMode, string> = {
  performance: "adminTierOrder_performance",
  value: "adminTierOrder_value",
  recommended: "adminTierOrder_recommended",
  oled: "adminTierOrder_oled",
  soundTyping: "adminTierOrder_soundTyping",
  mechanical: "adminTierOrder_mechanical",
  magnetic: "adminTierOrder_magnetic",
  pcb: "adminTierOrder_pcb",
  ips_va: "adminTierOrder_ips_va",
  competitive: "adminTierOrder_competitive",
}

// Modes not listed here share the `tier` column directly (the "default" mode for their
// category group: performance/Geral for most categories). Every other mode keeps its own
// tier assignment in `specs` so moving an item between tiers in one mode never affects
// the others.
const TIER_KEY_BY_MODE: Partial<Record<RatingMode, string>> = {
  value: "adminTier_value",
  recommended: "adminTier_recommended",
  oled: "adminTier_oled",
  soundTyping: "adminTier_soundTyping",
  mechanical: "adminTier_mechanical",
  magnetic: "adminTier_magnetic",
  pcb: "adminTier_pcb",
  ips_va: "adminTier_ips_va",
  competitive: "adminTier_competitive",
}

const TIER_VALUES: Tier[] = ["GOAT", "SS", "S", "A", "B", "C", "L"]

// "magnetic" used to share the `tier` column with "performance" before getting its own
// `adminTier_magnetic` key — items classified before that migration fall back to `tier`
// until explicitly moved in the Magnético tab, at which point they get their own
// `adminTier_magnetic` value (including the explicit "unassigned" sentinel below).
const MAGNETIC_TIER_KEY = "adminTier_magnetic"
const MAGNETIC_UNASSIGNED_SENTINEL = "__unassigned__"

// Faixa efetiva do item na aba Custo Benefício — manual (specs.adminPriceGroup) quando
// definida, senão cai pro cálculo a partir do `price` (ver resolvePriceGroupKey).
function getItemPriceGroup(item: Peripheral): PriceGroupKey | null {
  return resolvePriceGroupKey(item.price, item.specs?.golpe as boolean | undefined, item.specs?.[PRICE_GROUP_SPEC_KEY])
}

function getModeTier(item: Peripheral, tierKey: string | null): TierValue {
  if (tierKey === null) return item.tier
  const value = item.specs?.[tierKey]
  if (typeof value === "string" && (TIER_VALUES as string[]).includes(value)) return value as Tier
  if (tierKey === MAGNETIC_TIER_KEY && value === undefined) return item.tier
  return null
}

// Sem `tierlistCategories` definido (itens legados), o item continua visível em todos os
// modos, preservando o comportamento anterior à existência deste campo. O modo "geral" tem
// nomes diferentes entre o board admin (`performance`) e a Tierlist pública (`overall`) —
// normaliza para o mesmo valor gravado pelo formulário de criação/edição.
function participatesInMode(item: Peripheral, mode: RatingMode): boolean {
  const categories = item.specs?.tierlistCategories
  if (!Array.isArray(categories)) return true
  const normalizedMode = mode === "performance" ? "overall" : mode
  return categories.includes(normalizedMode)
}

function withModeTier(item: Peripheral, tier: TierValue, tierKey: string | null): Peripheral {
  if (tierKey === null) return { ...item, tier }
  if (tier === null) {
    if (tierKey === MAGNETIC_TIER_KEY) {
      return { ...item, specs: { ...item.specs, [tierKey]: MAGNETIC_UNASSIGNED_SENTINEL } }
    }
    const specs = { ...item.specs }
    delete specs[tierKey]
    return { ...item, specs }
  }
  return { ...item, specs: { ...item.specs, [tierKey]: tier } }
}

type ModeConfig = {
  // Optional filter — only OLED mode narrows the item set.
  filterItem?: (item: Peripheral) => boolean
  fallbackSort: (items: Peripheral[]) => Peripheral[]
}

const RATING_KEYS: RatingKey[] = ["overall", "performance", "build", "value", "software", "battery", "qc"]

function extractRatings(item: Peripheral): Ratings {
  const details = (item.specs as Record<string, unknown> | undefined)?.details as
    | { ratings?: Record<string, unknown> }
    | undefined
  const raw = details?.ratings ?? {}
  const ratings: Ratings = {}
  for (const key of RATING_KEYS) {
    if (typeof raw[key] === "number") ratings[key] = raw[key] as number
  }
  return ratings
}

function getPriceBand(price: number): Exclude<PriceBand, "all"> | null {
  if (price <= 300) return "budget"
  if (price <= 500) return "mid"
  if (price >= 1000) return "premium"
  return null
}

function getTierScore(tier: TierValue) {
  if (tier === "GOAT") return 7
  if (tier === "SS") return 6
  if (tier === "S") return 5
  if (tier === "A") return 4
  if (tier === "B") return 3
  if (tier === "C") return 2
  if (tier === "L") return 1
  return 0
}

function getTierOrder(item: Peripheral, orderKey: string, allowLegacyFallback: boolean): number | null {
  const value = item.specs?.[orderKey]
  if (typeof value === "number" && Number.isFinite(value)) return value

  if (allowLegacyFallback) {
    const legacyValue = item.specs?.[LEGACY_TIER_ORDER_SPEC_KEY]
    return typeof legacyValue === "number" && Number.isFinite(legacyValue) ? legacyValue : null
  }

  return null
}

function withTierOrder(item: Peripheral, order: number, orderKey: string): Peripheral {
  return {
    ...item,
    specs: {
      ...item.specs,
      [orderKey]: order,
    },
  }
}

function clearTierOrder(item: Peripheral, orderKey: string): Peripheral {
  const specs = { ...item.specs }
  delete specs[orderKey]
  return {
    ...item,
    specs,
  }
}

function sortByTierOrderThenName(items: Peripheral[], orderKey: string, allowLegacyFallback: boolean): Peripheral[] {
  return [...items].sort((left, right) => {
    const leftOrder = getTierOrder(left, orderKey, allowLegacyFallback)
    const rightOrder = getTierOrder(right, orderKey, allowLegacyFallback)

    if (leftOrder !== null && rightOrder !== null) {
      return leftOrder - rightOrder || left.name.localeCompare(right.name)
    }
    if (leftOrder !== null) return -1
    if (rightOrder !== null) return 1
    return left.name.localeCompare(right.name)
  })
}

function normalizeTierOrder(items: Peripheral[], tier: TierValue, orderKey: string, tierKey: string | null): Peripheral[] {
  if (tier === null) return items.map((item) => clearTierOrder(withModeTier(item, null, tierKey), orderKey))
  return items.map((item, index) => withTierOrder(withModeTier(item, tier, tierKey), index + 1, orderKey))
}

function getRecommendedScore(item: Peripheral) {
  const tagScore = item.tags.reduce((accumulator, tag) => {
    if (tag === "competitive") return accumulator + 0.8
    if (tag === "versatile") return accumulator + 0.6
    if (tag === "value") return accumulator + 0.7
    return accumulator
  }, 0)

  return getTierScore(item.tier) + tagScore - Math.min(item.price / 300, 1)
}

function sortByTierThenName(items: Peripheral[], orderKey: string, allowLegacyFallback: boolean) {
  return [...items].sort((left, right) => {
    const tierDiff = getTierScore(right.tier) - getTierScore(left.tier)
    if (tierDiff !== 0) return tierDiff

    const leftOrder = getTierOrder(left, orderKey, allowLegacyFallback)
    const rightOrder = getTierOrder(right, orderKey, allowLegacyFallback)
    if (leftOrder !== null && rightOrder !== null) return leftOrder - rightOrder || left.name.localeCompare(right.name)
    if (leftOrder !== null) return -1
    if (rightOrder !== null) return 1

    return left.name.localeCompare(right.name)
  })
}

const MODE_CONFIGS: Record<RatingMode, ModeConfig> = {
  performance: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  value: {
    fallbackSort: (items) => [...items].sort((left, right) => left.price - right.price || left.name.localeCompare(right.name)),
  },
  recommended: {
    fallbackSort: (items) =>
      [...items].sort((left, right) => getRecommendedScore(right) - getRecommendedScore(left) || left.name.localeCompare(right.name)),
  },
  oled: {
    filterItem: (item) => {
      const spec = item.specs?.panelType
      return typeof spec === "string" && spec.toLowerCase().includes("oled")
    },
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  soundTyping: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  mechanical: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  magnetic: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  pcb: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  ips_va: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  competitive: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
}

function sortWithTierOrder(
  items: Peripheral[],
  orderKey: string,
  allowLegacyFallback: boolean,
  fallbackSort: (items: Peripheral[]) => Peripheral[],
): Peripheral[] {
  const withOrder = sortByTierOrderThenName(items, orderKey, allowLegacyFallback)
  const hasAnyOrder = withOrder.some((item) => getTierOrder(item, orderKey, allowLegacyFallback) !== null)
  return hasAnyOrder ? withOrder : fallbackSort(items)
}

// Draggable Item Component
function DraggablePeripheralCard({
  item,
  onRemoveFromCategory,
  disableTooltip,
}: {
  item: Peripheral
  onRemoveFromCategory?: (id: string) => void
  disableTooltip?: boolean
}) {
  const { attributes, listeners, setNodeRef: setDragNodeRef, isDragging } = useDraggable({ id: item.id })
  const t = useT()
  const tierStyle = item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L

  const tierTheme = item.tier ? TIER_THEMES[item.tier] : TIER_THEMES.L
  const primaryTag = item.tags[0]
  const tagStyle = primaryTag ? CARD_TAG_STYLES[primaryTag] : null
  const isGoat = item.tier === "GOAT"

  const card = (
    <div
      ref={setDragNodeRef}
      style={{ opacity: isDragging ? 0.2 : 1 }}
      className={cn(
        "group relative cursor-grab overflow-hidden rounded-lg border transition-all duration-200 active:cursor-grabbing",
        CARD_SURFACE_INTERACTIVE,
        "hover:shadow-md hover:shadow-black/40",
        isGoat && "shadow-[0_0_14px_rgba(240,97,97,0.18)]",
      )}
      {...attributes}
      {...listeners}
    >
      {/* Tier accent bar */}
      <div className={cn("absolute bottom-0 left-0 top-0 w-[3px] bg-gradient-to-b", tierTheme.accent)} />

      {/* Edit overlay */}
      <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <Link href={`/admin/tierlist/${item.id}`} onPointerDown={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="size-6 bg-black/70 text-foreground/80 hover:text-foreground">
            <Edit className="size-3" />
          </Button>
        </Link>
        {onRemoveFromCategory && (
          <Button
            size="icon"
            variant="ghost"
            title={t.admin.tierlistPage.removeFromCategoryAction}
            className="size-6 bg-black/70 text-amber-400 hover:text-amber-300"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => onRemoveFromCategory(item.id)}
          >
            <X className="size-3" />
          </Button>
        )}
      </div>

      {/* Image area */}
      <div
        className="relative ml-[3px] h-12 overflow-hidden"
        style={{ background: "var(--card-image-bg)" }}
      >
        {isGoat && (
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-red-500/10 to-transparent" />
        )}
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name} width={120} height={48} className="h-full w-full object-contain p-0.5" />
        ) : (
          <div className={cn("flex h-full items-center justify-center text-[10px] font-black", tierStyle.bg, tierStyle.text)}>
            {item.brand.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="ml-[3px] px-1.5 pb-1.5 pt-1">
        <p className="line-clamp-2 text-[10px] font-bold leading-tight text-foreground">{item.name}</p>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <p className="truncate text-[8px] text-muted-foreground">{item.brand}</p>
        </div>
      </div>
    </div>
  )

  if (disableTooltip || isDragging) return card

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent
        className="rounded-xl border border-border bg-card p-4 shadow-2xl backdrop-blur-md"
        sideOffset={12}
        side="bottom"
        align="center"
      >
        <TierItemTooltipContent
          name={item.name}
          brand={item.brand}
          categoryLabel={item.category}
          image_url={item.image_url}
          tier={item.tier}
          ratings={extractRatings(item)}
          tags={item.tags}
        />
      </TooltipContent>
    </Tooltip>
  )
}

// Card pra faixa de preço (aba Custo Benefício) — a faixa (grupo) é derivada de `price`,
// então o item não pode ser arrastado pra OUTRA faixa (não persistiria nada), mas a ORDEM
// dentro da própria faixa é arrastável igual às outras abas. Preço e GOLPE/motivo continuam
// editados no form (botão de editar abaixo), não pelo drag.
function PriceBandPeripheralCard({
  item,
  priceGroup,
  disableTooltip,
}: {
  item: Peripheral
  priceGroup: PriceGroupKey
  disableTooltip?: boolean
}) {
  const { attributes, listeners, setNodeRef: setDragNodeRef, isDragging } = useDraggable({ id: item.id })
  const bandStyle = CARD_PRICE_BAND_STYLES[priceGroup]
  const isGolpe = priceGroup === GOLPE_KEY
  const golpeMotivo = typeof item.specs?.golpeMotivo === "string" ? item.specs.golpeMotivo : undefined

  const card = (
    <div
      ref={setDragNodeRef}
      style={{ opacity: isDragging ? 0.2 : 1 }}
      className={cn(
        "group relative cursor-grab overflow-hidden rounded-lg border transition-all duration-200 active:cursor-grabbing",
        CARD_SURFACE_INTERACTIVE,
        "hover:shadow-md hover:shadow-black/40",
      )}
      {...attributes}
      {...listeners}
    >
      <div className={cn("absolute bottom-0 left-0 top-0 w-[3px]", bandStyle.accent)} />

      {isGolpe && (
        <div
          className="absolute left-2 top-1 z-10 grid size-4 place-items-center rounded-full bg-red-600 text-white shadow"
          title={golpeMotivo || "GOLPE — não recomendado"}
        >
          <AlertTriangle className="size-2.5" />
        </div>
      )}

      <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <Link href={`/admin/tierlist/${item.id}`} onPointerDown={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="size-6 bg-black/70 text-foreground/80 hover:text-foreground">
            <Edit className="size-3" />
          </Button>
        </Link>
      </div>

      <div className="relative ml-[3px] h-12 overflow-hidden" style={{ background: "var(--card-image-bg)" }}>
        {item.image_url ? (
          <Image src={item.image_url} alt={item.name} width={120} height={48} className="h-full w-full object-contain p-0.5" />
        ) : (
          <div className={cn("flex h-full items-center justify-center text-[10px] font-black", bandStyle.bg, bandStyle.text)}>
            {item.brand.slice(0, 2).toUpperCase()}
          </div>
        )}
      </div>

      <div className="ml-[3px] px-1.5 pb-1.5 pt-1">
        <p className="line-clamp-2 text-[10px] font-bold leading-tight text-foreground">{item.name}</p>
        <p className="mt-0.5 truncate text-[8px] text-muted-foreground">{item.brand}</p>
      </div>
    </div>
  )

  if (disableTooltip || isDragging) return card

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent
        className="rounded-xl border border-border bg-card p-4 shadow-2xl backdrop-blur-md"
        sideOffset={12}
        side="bottom"
        align="center"
      >
        <TierItemTooltipContent
          name={item.name}
          brand={item.brand}
          categoryLabel={item.category}
          image_url={item.image_url}
          tier={null}
          ratings={extractRatings(item)}
          tags={item.tags}
          priceBand={PRICE_BAND_LABEL[priceGroup]}
          golpeMotivo={golpeMotivo}
        />
      </TooltipContent>
    </Tooltip>
  )
}

function DroppableCardSlot({
  itemId,
  isDropTarget,
  children,
}: {
  itemId: string
  isDropTarget?: boolean
  children: React.ReactNode
}) {
  const { setNodeRef } = useDroppable({ id: `item-${itemId}` })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative rounded-lg transition-all duration-150",
        isDropTarget && "ring-1 ring-cyan-400/60"
      )}
    >
      {children}
    </div>
  )
}

// Floating card that follows the cursor during drag
function DragOverlayCard({ item }: { item: Peripheral }) {
  const tierStyle = item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L
  const tierTheme = item.tier ? TIER_THEMES[item.tier] : TIER_THEMES.L

  return (
    <div className="w-[150px] rotate-2 scale-105 cursor-grabbing drop-shadow-2xl">
      <div className="relative overflow-hidden rounded-lg border border-cyan-400/50 bg-secondary/50 ring-2 ring-cyan-400/20">
        <div className={cn("absolute bottom-0 left-0 top-0 w-[3px] bg-gradient-to-b", tierTheme.accent)} />
        <div
          className="relative ml-[3px] h-12 overflow-hidden"
          style={{ background: "var(--card-image-bg)" }}
        >
          {item.image_url ? (
            <Image src={item.image_url} alt={item.name} width={150} height={48} className="h-full w-full object-contain p-0.5" />
          ) : (
            <div className={cn("flex h-full items-center justify-center text-[10px] font-black", tierStyle.bg, tierStyle.text)}>
              {item.brand.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="ml-[3px] px-1.5 pb-1.5 pt-1">
          <p className="line-clamp-2 text-[10px] font-bold leading-tight text-foreground">{item.name}</p>
          <p className="mt-0.5 truncate text-[8px] text-muted-foreground">{item.brand}</p>
        </div>
      </div>
    </div>
  )
}

// Droppable Tier row — single merged cell per tier
function DroppableTier({
  tier,
  items,
  isDragging,
  hoveredItemId,
}: {
  tier: Tier
  items: Peripheral[]
  isDragging: boolean
  hoveredItemId: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative h-full transition-all duration-150",
        isOver && "bg-cyan-500/[0.06]"
      )}
    >
      {isOver && (
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-cyan-400/50" />
      )}

      <div className="p-2">
        {items.length > 0 ? (
          <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
            {items.map((item) => (
              <DroppableCardSlot key={item.id} itemId={item.id} isDropTarget={hoveredItemId === item.id}>
                <DraggablePeripheralCard item={item} disableTooltip={isDragging} />
              </DroppableCardSlot>
            ))}
            {isOver && (
              <div className="col-span-full flex h-7 items-center justify-center rounded border border-dashed border-cyan-400/50 bg-cyan-500/5">
                <p className="text-[9px] font-medium text-cyan-400">Soltar aqui</p>
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-[72px] items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200",
              isOver
                ? "border-cyan-400 bg-cyan-500/10"
                : isDragging
                  ? "border-border bg-muted/30"
                  : "border-border"
            )}
          >
            <p
              className={cn(
                "text-[10px] font-medium transition-colors",
                isOver ? "text-cyan-300" : isDragging ? "text-muted-foreground" : "text-transparent"
              )}
            >
              {isOver ? "Soltar aqui" : "+"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Droppable Price Band row — igual DroppableTier, mas o id é a faixa de preço (ex: "1000",
// "golpe"). Soltar aqui move o item pra ESTA faixa (ver `applyPriceBandReorder`), não só
// reordena — precisa existir um alvo pra soltar mesmo quando a faixa não tem itens ainda.
function DroppablePriceBandRow({
  priceGroup,
  items,
  isDragging,
  hoveredItemId,
}: {
  priceGroup: PriceGroupKey
  items: Peripheral[]
  isDragging: boolean
  hoveredItemId: string | null
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `price-band-${priceGroup}` })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative h-full transition-all duration-150",
        isOver && "bg-cyan-500/[0.06]"
      )}
    >
      {isOver && (
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-cyan-400/50" />
      )}

      <div className="p-2">
        {items.length > 0 ? (
          <div className="grid auto-rows-max grid-cols-[repeat(auto-fill,minmax(130px,1fr))] gap-2">
            {items.map((item) => (
              <DroppableCardSlot key={item.id} itemId={item.id} isDropTarget={hoveredItemId === item.id}>
                <PriceBandPeripheralCard
                  item={item}
                  priceGroup={priceGroup}
                  disableTooltip={isDragging}
                />
              </DroppableCardSlot>
            ))}
            {isOver && (
              <div className="col-span-full flex h-7 items-center justify-center rounded border border-dashed border-cyan-400/50 bg-cyan-500/5">
                <p className="text-[9px] font-medium text-cyan-400">Soltar aqui</p>
              </div>
            )}
          </div>
        ) : (
          <div
            className={cn(
              "flex min-h-[72px] items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200",
              isOver
                ? "border-cyan-400 bg-cyan-500/10"
                : isDragging
                  ? "border-border bg-muted/30"
                  : "border-border"
            )}
          >
            <p
              className={cn(
                "text-[10px] font-medium transition-colors",
                isOver ? "text-cyan-300" : isDragging ? "text-muted-foreground" : "text-transparent"
              )}
            >
              {isOver ? "Soltar aqui" : "+"}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

// Vincula um periférico já existente da mesma categoria (que ainda não participa deste modo)
// ao modo/aba atual, sem passar pelo form de criação — só grava specs.tierlistCategories.
function LinkPeripheralPopover({
  items,
  onLink,
}: {
  items: Peripheral[]
  onLink: (id: string) => Promise<void>
}) {
  const t = useT()
  const [selectedId, setSelectedId] = useState("")
  const [linking, setLinking] = useState(false)

  const options = useMemo(
    () => items.map((item) => ({ value: item.id, label: `${item.name} — ${item.brand}` })),
    [items],
  )

  async function handleValueChange(id: string) {
    setSelectedId(id)
    setLinking(true)
    try {
      await onLink(id)
      setSelectedId("")
    } finally {
      setLinking(false)
    }
  }

  return (
    <Combobox
      options={options}
      value={selectedId}
      onValueChange={handleValueChange}
      placeholder={t.admin.tierlistPage.addToCategory}
      searchPlaceholder={t.admin.tierlistPage.searchPeripheralPlaceholder}
      emptyText={t.admin.tierlistPage.noLinkablePeripherals}
      disabled={linking}
      className="h-9 w-auto min-w-[220px]"
    />
  )
}

function DroppableUnassignedPool({
  items,
  onRemoveFromCategory,
  isDragging,
}: {
  items: Peripheral[]
  onRemoveFromCategory: (id: string) => void
  isDragging: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "unassigned-pool" })
  const t = useT()

  return (
    <div
      ref={setNodeRef}
      className={cn("transition-colors duration-150", isOver && "bg-amber-500/5")}
    >
      {items.length > 0 ? (
        <div className="grid gap-2 p-3 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
          {items.map((item) => (
            <DroppableCardSlot key={item.id} itemId={item.id}>
              <DraggablePeripheralCard
                item={item}
                onRemoveFromCategory={onRemoveFromCategory}
                disableTooltip={isDragging}
              />
            </DroppableCardSlot>
          ))}
        </div>
      ) : (
        <div
          className={cn(
            "m-3 flex min-h-[72px] items-center justify-center rounded-lg border-2 border-dashed transition-all duration-200",
            isOver
              ? "border-amber-400 bg-amber-500/10"
              : isDragging
                ? "border-amber-500/40 bg-amber-500/5"
                : "border-border"
          )}
        >
          <p
            className={cn(
              "text-xs font-medium transition-colors duration-150",
              isOver ? "text-amber-300" : isDragging ? "text-amber-400/70" : "text-muted-foreground"
            )}
          >
            {isOver
              ? t.admin.tierlistPage.releaseToRemove
              : isDragging
                ? t.admin.tierlistPage.dropHereRemove
                : t.admin.tierlistPage.noUnassigned}
          </p>
        </div>
      )}
    </div>
  )
}


export default function AdminPeripheralsPage() {
  const { locale } = useLocale()
  const t = useT()
  const [peripherals, setPeripherals] = useState<Peripheral[]>([])
  const [selectedCategory, setSelectedCategory] = useState<Category>("keyboard")
  const [query, setQuery] = useState("")
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [selectedPriceBand, setSelectedPriceBand] = useState<PriceBand>("all")
  const [selectedMouseShape, setSelectedMouseShape] = useState<MouseShape | "all">("all")
  const [selectedKeyboardLayout, setSelectedKeyboardLayout] = useState<KeyboardLayout | "all">("all")
  const [ratingMode, setRatingMode] = useState<RatingMode>("performance")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null)
  const hoverRafRef = useRef<number | null>(null)
  const pendingHoverIdRef = useRef<string | null>(null)
  const hoveredInsertAfterRef = useRef(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const orderKey = ORDER_KEY_BY_MODE[ratingMode]
  const allowLegacyFallback = ratingMode === "performance"
  const tierKey = TIER_KEY_BY_MODE[ratingMode] ?? null

  // Mesma regra da tierlist pública (components/tierlist/TierlistGrid.tsx): "value" vira
  // faixa de preço em toda categoria, exceto mousepad/glasspad (lá é "Nacional").
  const isPriceBandMode = ratingMode === "value" && selectedCategory !== "mousepad" && selectedCategory !== "glasspad"

  const scheduleHoverUpdate = useCallback((nextId: string | null) => {
    if (pendingHoverIdRef.current === nextId) return

    pendingHoverIdRef.current = nextId
    if (hoverRafRef.current !== null) return

    hoverRafRef.current = window.requestAnimationFrame(() => {
      setHoveredItemId(pendingHoverIdRef.current)
      hoverRafRef.current = null
    })
  }, [])

  const applyTierReorder = useCallback((
    allItems: Peripheral[],
    draggedId: string,
    destinationTier: TierValue,
    orderKey: string,
    allowLegacyFallback: boolean,
    tierKey: string | null,
    insertAfter: boolean,
    targetItemId?: string,
  ) => {
    const draggedItem = allItems.find((item) => item.id === draggedId)
    if (!draggedItem) return allItems

    const sourceTier = getModeTier(draggedItem, tierKey)
    const updates = new Map<string, Peripheral>()

    const destinationBase = sortByTierOrderThenName(
      allItems.filter(
        (item) =>
          getModeTier(item, tierKey) === destinationTier &&
          item.category === draggedItem.category &&
          item.id !== draggedId,
      ),
      orderKey,
      allowLegacyFallback,
    )

    const targetIndex =
      targetItemId !== undefined
        ? destinationBase.findIndex((item) => item.id === targetItemId)
        : destinationBase.length

    const destinationInsertIndex =
      targetItemId !== undefined
        ? Math.max(0, targetIndex + (insertAfter ? 1 : 0))
        : destinationBase.length

    const destinationItems = [...destinationBase]
    destinationItems.splice(
      destinationInsertIndex < 0 ? destinationItems.length : destinationInsertIndex,
      0,
      withModeTier(draggedItem, destinationTier, tierKey),
    )

    for (const item of normalizeTierOrder(destinationItems, destinationTier, orderKey, tierKey)) {
      updates.set(item.id, item)
    }

    if (sourceTier !== destinationTier) {
      const sourceItems = sortByTierOrderThenName(
        allItems.filter(
          (item) =>
            getModeTier(item, tierKey) === sourceTier &&
            item.category === draggedItem.category &&
            item.id !== draggedId,
        ),
        orderKey,
        allowLegacyFallback,
      )
      for (const item of normalizeTierOrder(sourceItems, sourceTier, orderKey, tierKey)) {
        updates.set(item.id, item)
      }
    }

    return allItems.map((item) => updates.get(item.id) ?? item)
  }, [])

  const getInsertAfter = useCallback((event: DragOverEvent) => {
    const activeRect = event.active.rect.current.translated ?? event.active.rect.current.initial
    const overRect = event.over?.rect
    if (!activeRect || !overRect) return false

    const activeCenter = {
      x: activeRect.left + activeRect.width / 2,
      y: activeRect.top + activeRect.height / 2,
    }
    const overCenter = {
      x: overRect.left + overRect.width / 2,
      y: overRect.top + overRect.height / 2,
    }

    if (activeCenter.y === overCenter.y) return activeCenter.x > overCenter.x
    return activeCenter.y > overCenter.y
  }, [])

  const persistReorderedItems = useCallback(async (
    previousItems: Peripheral[],
    nextItems: Peripheral[],
    orderKey: string,
    allowLegacyFallback: boolean,
    tierKey: string | null,
  ) => {
    const previousById = new Map(previousItems.map((item) => [item.id, item]))
    const changedItems = nextItems.filter((nextItem) => {
      const previousItem = previousById.get(nextItem.id)
      if (!previousItem) return false

      return (
        getModeTier(previousItem, tierKey) !== getModeTier(nextItem, tierKey) ||
        getTierOrder(previousItem, orderKey, allowLegacyFallback) !== getTierOrder(nextItem, orderKey, allowLegacyFallback)
      )
    })

    if (changedItems.length === 0) return

    await Promise.all(
      changedItems.map(async (item) => {
        const previousItem = previousById.get(item.id)
        const payload: Record<string, unknown> = {}

        const tierChanged = getModeTier(previousItem as Peripheral, tierKey) !== getModeTier(item, tierKey)
        const orderChanged =
          getTierOrder(previousItem as Peripheral, orderKey, allowLegacyFallback) !==
          getTierOrder(item, orderKey, allowLegacyFallback)

        // Only the "default" mode (tierKey === null) writes the shared `tier` column —
        // every other mode keeps its tier assignment scoped to its own `specs` key.
        if (tierKey === null && tierChanged) payload.tier = item.tier
        if (orderChanged || tierChanged) payload.specs = item.specs

        if (Object.keys(payload).length === 0) return

        const res = await fetch(`/api/admin/peripherals/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(data?.error ?? t.admin.tierlistPage.failedToUpdateOrder)
        }
      }),
    )
  }, [t])

  // Move o item pra `destinationGroup`. A posição é sempre manual (specs.adminPriceGroup) —
  // isso NUNCA toca em `price`: a ordem que o admin define arrastando prevalece, independente
  // do preço real do item. GOLPE seta a flag e limpa a posição manual; faixa normal grava a
  // posição e limpa GOLPE.
  const withPriceGroup = useCallback((item: Peripheral, destinationGroup: PriceGroupKey): Peripheral => {
    if (destinationGroup === GOLPE_KEY) {
      const specs: Peripheral["specs"] = { ...item.specs, golpe: true }
      delete specs[PRICE_GROUP_SPEC_KEY]
      return { ...item, specs }
    }
    const band = PRICE_BANDS.find((b) => b.key === destinationGroup)
    if (!band) return item
    const specs: Peripheral["specs"] = { ...item.specs, [PRICE_GROUP_SPEC_KEY]: destinationGroup }
    delete specs.golpe
    return { ...item, specs }
  }, [])

  // Reordena/move entre faixas de preço. A faixa É a faixa solta (destinationGroup) — se for
  // diferente da faixa atual do item, `withPriceGroup` grava a nova posição manual
  // (specs.adminPriceGroup) sem nunca tocar em `price`.
  const applyPriceBandReorder = useCallback((
    allItems: Peripheral[],
    draggedId: string,
    destinationGroup: PriceGroupKey,
    insertAfter: boolean,
    targetItemId?: string,
  ) => {
    const draggedItemRaw = allItems.find((item) => item.id === draggedId)
    if (!draggedItemRaw) return allItems

    const sourceGroup = getItemPriceGroup(draggedItemRaw)
    const draggedItem = withPriceGroup(draggedItemRaw, destinationGroup)

    const destinationBase = sortByTierOrderThenName(
      allItems.filter((item) => {
        if (item.id === draggedId) return false
        if (item.category !== draggedItem.category) return false
        return getItemPriceGroup(item) === destinationGroup
      }),
      PRICE_BAND_ORDER_KEY,
      false,
    )

    const targetIndex =
      targetItemId !== undefined ? destinationBase.findIndex((item) => item.id === targetItemId) : destinationBase.length
    const insertIndex = targetIndex < 0 ? destinationBase.length : Math.max(0, targetIndex + (insertAfter ? 1 : 0))

    const destinationItems = [...destinationBase]
    destinationItems.splice(insertIndex, 0, draggedItem)

    const updates = new Map<string, Peripheral>()
    destinationItems.forEach((item, index) => {
      updates.set(item.id, withTierOrder(item, index + 1, PRICE_BAND_ORDER_KEY))
    })

    // Faixa de origem também precisa renormalizar os índices — igual applyTierReorder faz
    // pro sourceTier — senão sobra um buraco na sequência de adminPriceBandOrder.
    if (sourceGroup && sourceGroup !== destinationGroup) {
      const sourceItems = sortByTierOrderThenName(
        allItems.filter((item) => {
          if (item.id === draggedId) return false
          if (item.category !== draggedItem.category) return false
          return getItemPriceGroup(item) === sourceGroup
        }),
        PRICE_BAND_ORDER_KEY,
        false,
      )
      sourceItems.forEach((item, index) => {
        updates.set(item.id, withTierOrder(item, index + 1, PRICE_BAND_ORDER_KEY))
      })
    }

    return allItems.map((item) => updates.get(item.id) ?? item)
  }, [withPriceGroup])

  const persistPriceBandOrder = useCallback(async (
    previousItems: Peripheral[],
    nextItems: Peripheral[],
  ) => {
    const previousById = new Map(previousItems.map((item) => [item.id, item]))
    const changedItems = nextItems.filter((nextItem) => {
      const previousItem = previousById.get(nextItem.id)
      if (!previousItem) return false
      return (
        getTierOrder(previousItem, PRICE_BAND_ORDER_KEY, false) !== getTierOrder(nextItem, PRICE_BAND_ORDER_KEY, false) ||
        previousItem.specs?.[PRICE_GROUP_SPEC_KEY] !== nextItem.specs?.[PRICE_GROUP_SPEC_KEY] ||
        previousItem.specs?.golpe !== nextItem.specs?.golpe
      )
    })

    if (changedItems.length === 0) return

    await Promise.all(
      changedItems.map(async (item) => {
        // `price` nunca entra no payload aqui — mover de faixa é só posição visual (specs).
        const payload: Record<string, unknown> = { specs: item.specs }

        const res = await fetch(`/api/admin/peripherals/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(data?.error ?? t.admin.tierlistPage.failedToUpdateOrder)
        }
      }),
    )
  }, [t])

  const loadPeripherals = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/admin/peripherals", { cache: "no-store" })
      const data = (await res.json().catch(() => null)) as { peripherals?: PeripheralApiRow[]; error?: string } | null
      if (!res.ok || !data?.peripherals) {
        throw new Error(data?.error ?? t.admin.tierlistPage.failedToLoad)
      }
      setPeripherals(data.peripherals.map(normalizePeripheral))
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.tierlistPage.failedToLoad
      setError(message)
      toast.error(t.admin.tierlistPage.failedToLoadPeripherals, { description: message })
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    loadPeripherals()
  }, [loadPeripherals])

  useEffect(() => {
    return () => {
      if (hoverRafRef.current !== null) {
        window.cancelAnimationFrame(hoverRafRef.current)
        hoverRafRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    if (ratingMode === "oled" && selectedCategory !== "monitors") setRatingMode("performance")
    if ((ratingMode === "ips_va" || ratingMode === "competitive") && selectedCategory !== "monitors") setRatingMode("performance")
    if (ratingMode === "soundTyping" && selectedCategory !== "switches") setRatingMode("performance")
    if (ratingMode === "pcb") setRatingMode("performance")
    if (ratingMode === "mechanical" && selectedCategory !== "keyboard") setRatingMode("performance")
    if (ratingMode === "magnetic" && selectedCategory !== "keyboard" && selectedCategory !== "mouse") setRatingMode("performance")
    if (ratingMode === "recommended" && !RECOMMENDED_TAB_CATEGORIES.includes(selectedCategory)) setRatingMode("performance")
    if ((ratingMode === "performance" || ratingMode === "recommended") && selectedCategory === "keyboard") setRatingMode("magnetic")
    if ((ratingMode === "performance" || ratingMode === "recommended") && selectedCategory === "monitors") setRatingMode("oled")
  }, [ratingMode, selectedCategory])

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id.toString())
    pendingHoverIdRef.current = null
    hoveredInsertAfterRef.current = false
    if (hoverRafRef.current !== null) {
      window.cancelAnimationFrame(hoverRafRef.current)
      hoverRafRef.current = null
    }
    setHoveredItemId(null)
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event

    if (!over) {
      scheduleHoverUpdate(null)
      return
    }

    const draggedItem = peripherals.find((item) => item.id === active.id)
    if (!draggedItem) {
      scheduleHoverUpdate(null)
      return
    }

    const overId = over.id.toString()
    if (!overId.startsWith("item-")) {
      scheduleHoverUpdate(null)
      return
    }

    const targetItemId = overId.slice(5)
    if (targetItemId === draggedItem.id) {
      scheduleHoverUpdate(null)
      return
    }

    const targetItem = peripherals.find((item) => item.id === targetItemId)
    if (
      !targetItem ||
      getModeTier(targetItem, tierKey) !== getModeTier(draggedItem, tierKey) ||
      targetItem.category !== draggedItem.category
    ) {
      scheduleHoverUpdate(null)
      return
    }

    hoveredInsertAfterRef.current = getInsertAfter(event)
    scheduleHoverUpdate(targetItem.id)
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    pendingHoverIdRef.current = null
    hoveredInsertAfterRef.current = false
    if (hoverRafRef.current !== null) {
      window.cancelAnimationFrame(hoverRafRef.current)
      hoverRafRef.current = null
    }
    setHoveredItemId(null)
    const { active, over } = event

    if (!over) return

    const draggedItem = peripherals.find((p) => p.id === active.id)
    if (!draggedItem) return
    const previousPeripherals = peripherals

    const overId = over.id.toString()

    if (overId.startsWith("item-")) {
      const targetItemId = overId.slice(5)
      if (targetItemId === draggedItem.id) return

      const targetItem = peripherals.find((item) => item.id === targetItemId)
      if (!targetItem) return

      const insertAfter = getInsertAfter(event)
      const nextPeripherals = applyTierReorder(
        previousPeripherals,
        draggedItem.id,
        getModeTier(targetItem, tierKey),
        orderKey,
        allowLegacyFallback,
        tierKey,
        insertAfter,
        targetItem.id,
      )
      setPeripherals(nextPeripherals)

      try {
        await persistReorderedItems(previousPeripherals, nextPeripherals, orderKey, allowLegacyFallback, tierKey)
        toast.success(t.admin.tierlistPage.orderUpdated, {
          description: draggedItem.name,
        })
      } catch (err) {
        setPeripherals(previousPeripherals)
        const message = err instanceof Error ? err.message : t.admin.tierlistPage.failedToUpdate
        setError(message)
        toast.error(t.admin.tierlistPage.failedToUpdateOrderDesc, { description: message })
      }

      return
    }

    if (overId === "unassigned-pool") {
      if (getModeTier(draggedItem, tierKey) === null) return

      const nextPeripherals = applyTierReorder(
        previousPeripherals,
        draggedItem.id,
        null,
        orderKey,
        allowLegacyFallback,
        tierKey,
        false,
      )

      setPeripherals(nextPeripherals)

      try {
        await persistReorderedItems(previousPeripherals, nextPeripherals, orderKey, allowLegacyFallback, tierKey)
        toast.success(t.admin.tierlistPage.tierRemoved, {
          description: draggedItem.name,
        })
      } catch (err) {
        setPeripherals(previousPeripherals)
        const message = err instanceof Error ? err.message : t.admin.tierlistPage.failedToUpdate
        setError(message)
        toast.error(t.admin.tierlistPage.failedToUpdatePeripheral, { description: message })
      }

      return
    }

    const newTier = overId as Tier

    if (getModeTier(draggedItem, tierKey) === newTier) {
      return
    }

    const nextPeripherals = applyTierReorder(
      previousPeripherals,
      draggedItem.id,
      newTier,
      orderKey,
      allowLegacyFallback,
      tierKey,
      false,
    )

    setPeripherals(nextPeripherals)

    try {
      await persistReorderedItems(previousPeripherals, nextPeripherals, orderKey, allowLegacyFallback, tierKey)
      toast.success(t.admin.tierlistPage.movedToTier(newTier), {
        description: draggedItem.name,
      })
    } catch (err) {
      setPeripherals(previousPeripherals)
      const message = err instanceof Error ? err.message : t.admin.tierlistPage.failedToUpdate
      setError(message)
      toast.error(t.admin.tierlistPage.failedToUpdatePeripheral, { description: message })
    }
  }

  // Drag handler dedicado da aba Custo Benefício — igual handleDragOver/handleDragEnd, mas o
  // "tier" aqui é a faixa de preço. Soltar em cima de um card (`item-`) usa a faixa DAQUELE
  // card como destino; soltar na linha vazia (`price-band-`) usa a faixa da própria linha.
  // Mudar de faixa ajusta `price`/`golpe` (ver `applyPriceBandReorder`/`withPriceGroup`).
  function handlePriceBandDragOver(event: DragOverEvent) {
    const { active, over } = event

    if (!over) {
      scheduleHoverUpdate(null)
      return
    }

    const draggedItem = peripherals.find((item) => item.id === active.id)
    if (!draggedItem) {
      scheduleHoverUpdate(null)
      return
    }

    const overId = over.id.toString()

    if (overId.startsWith("item-")) {
      const targetItemId = overId.slice(5)
      if (targetItemId === draggedItem.id) {
        scheduleHoverUpdate(null)
        return
      }

      const targetItem = peripherals.find((item) => item.id === targetItemId)
      if (!targetItem || targetItem.category !== draggedItem.category) {
        scheduleHoverUpdate(null)
        return
      }

      hoveredInsertAfterRef.current = getInsertAfter(event)
      scheduleHoverUpdate(targetItem.id)
      return
    }

    // Soltar na linha vazia/área da faixa (fora de qualquer card) só faz sentido pra
    // preview visual quando não há item específico embaixo do cursor.
    scheduleHoverUpdate(null)
  }

  async function handlePriceBandDragEnd(event: DragEndEvent) {
    setActiveId(null)
    pendingHoverIdRef.current = null
    hoveredInsertAfterRef.current = false
    if (hoverRafRef.current !== null) {
      window.cancelAnimationFrame(hoverRafRef.current)
      hoverRafRef.current = null
    }
    setHoveredItemId(null)
    const { active, over } = event

    if (!over) return

    const draggedItem = peripherals.find((p) => p.id === active.id)
    if (!draggedItem) return

    const previousPeripherals = peripherals
    const overId = over.id.toString()

    let destinationGroup: PriceGroupKey | null = null
    let targetItemId: string | undefined
    let insertAfter = false

    if (overId.startsWith("item-")) {
      const id = overId.slice(5)
      if (id === draggedItem.id) return

      const targetItem = peripherals.find((item) => item.id === id)
      if (!targetItem || targetItem.category !== draggedItem.category) return

      destinationGroup = getItemPriceGroup(targetItem)
      targetItemId = targetItem.id
      insertAfter = getInsertAfter(event)
    } else if (overId.startsWith("price-band-")) {
      destinationGroup = overId.slice("price-band-".length) as PriceGroupKey
    }

    if (!destinationGroup) return

    const nextPeripherals = applyPriceBandReorder(previousPeripherals, draggedItem.id, destinationGroup, insertAfter, targetItemId)
    if (nextPeripherals === previousPeripherals) return

    setPeripherals(nextPeripherals)

    const currentGroup = getItemPriceGroup(draggedItem)
    const movedToNewGroup = currentGroup !== destinationGroup

    try {
      await persistPriceBandOrder(previousPeripherals, nextPeripherals)
      toast.success(
        movedToNewGroup ? t.admin.tierlistPage.movedToPriceBand(PRICE_BAND_LABEL[destinationGroup]) : t.admin.tierlistPage.orderUpdated,
        { description: draggedItem.name },
      )
    } catch (err) {
      setPeripherals(previousPeripherals)
      const message = err instanceof Error ? err.message : t.admin.tierlistPage.failedToUpdate
      setError(message)
      toast.error(t.admin.tierlistPage.failedToUpdateOrderDesc, { description: message })
    }
  }

  // Remove o item apenas do modo/aba atual (specs.tierlistCategories), sem apagar o
  // periférico — ele continua existindo e participando dos outros modos da categoria. Sem
  // `tierlistCategories` definido o item participa de tudo (ver `participatesInMode`), então
  // remover de UM modo exige materializar a lista completa da categoria menos o modo atual.
  async function handleRemoveFromMode(id: string) {
    const item = peripherals.find((p) => p.id === id)
    if (!item) return

    const normalizedMode = ratingMode === "performance" ? "overall" : ratingMode
    const existing = item.specs?.tierlistCategories
    const currentModes = Array.isArray(existing)
      ? existing
      : getModesForCategory(item.category).map((m) => (m.key === "performance" ? "overall" : m.key))
    const nextModes = currentModes.filter((mode) => mode !== normalizedMode)

    const nextSpecs = { ...item.specs, tierlistCategories: nextModes }

    try {
      const res = await fetch(`/api/admin/peripherals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specs: nextSpecs }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? t.admin.tierlistPage.failedToUpdateOrder)

      setPeripherals((prev) => prev.map((p) => (p.id === id ? { ...p, specs: nextSpecs } : p)))
      toast.success(t.admin.tierlistPage.removedFromCategory, { description: item.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.tierlistPage.failedToUpdateOrder
      toast.error(t.admin.tierlistPage.removeFromCategoryFailed, { description: message })
    }
  }

  // Vincula um periférico já existente (mesma categoria, ainda sem participar deste modo) ao
  // modo/aba atual — inverso de `handleRemoveFromMode`. Precisa materializar a lista completa
  // da categoria + este modo pela mesma razão: sem `tierlistCategories` o item participa de
  // tudo implicitamente, então só dá pra "adicionar" gravando a lista explícita.
  async function handleAddToMode(id: string) {
    const item = peripherals.find((p) => p.id === id)
    if (!item) return

    const normalizedMode = ratingMode === "performance" ? "overall" : ratingMode
    const existing = item.specs?.tierlistCategories
    const currentModes = Array.isArray(existing)
      ? existing
      : getModesForCategory(item.category).map((m) => (m.key === "performance" ? "overall" : m.key))
    const nextModes = currentModes.includes(normalizedMode) ? currentModes : [...currentModes, normalizedMode]

    const nextSpecs = { ...item.specs, tierlistCategories: nextModes }

    try {
      const res = await fetch(`/api/admin/peripherals/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specs: nextSpecs }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? t.admin.tierlistPage.failedToUpdateOrder)

      setPeripherals((prev) => prev.map((p) => (p.id === id ? { ...p, specs: nextSpecs } : p)))
      toast.success(t.admin.tierlistPage.addedToCategory, { description: item.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.tierlistPage.failedToUpdateOrder
      toast.error(t.admin.tierlistPage.addToCategoryFailed, { description: message })
    }
  }

  const selectedCategoryMeta = CATEGORY_META.find((c) => c.key === selectedCategory)
  const categoryLabel = selectedCategory === "all"
    ? t.common.all
    : selectedCategoryMeta
      ? (locale === "en-US" ? selectedCategoryMeta.en : selectedCategoryMeta.pt)
      : "Tierlist"

  usePageHeader(
    `Admin Tierlist - ${categoryLabel}`,
    t.admin.tierlistPage.dragAndDropHint
  )

  const availableBrands = useMemo(() => {
    const inCategory =
      selectedCategory === "all"
        ? peripherals
        : peripherals.filter((item) => item.category === selectedCategory)
    return ["all", ...Array.from(new Set(inCategory.map((item) => item.brand)))]
  }, [peripherals, selectedCategory])

  const visualPeripherals = useMemo(() => {
    if (!activeId || !hoveredItemId) return peripherals

    const draggedItem = peripherals.find((item) => item.id === activeId)
    const targetItem = peripherals.find((item) => item.id === hoveredItemId)
    if (!draggedItem || !targetItem) return peripherals
    if (draggedItem.id === targetItem.id) return peripherals
    if (draggedItem.category !== targetItem.category) return peripherals

    if (isPriceBandMode) {
      const targetGroup = getItemPriceGroup(targetItem)
      if (!targetGroup) return peripherals
      return applyPriceBandReorder(peripherals, draggedItem.id, targetGroup, hoveredInsertAfterRef.current, targetItem.id)
    }

    if (getModeTier(draggedItem, tierKey) !== getModeTier(targetItem, tierKey)) return peripherals

    return applyTierReorder(
      peripherals,
      draggedItem.id,
      getModeTier(targetItem, tierKey),
      orderKey,
      allowLegacyFallback,
      tierKey,
      hoveredInsertAfterRef.current,
      targetItem.id,
    )
  }, [activeId, hoveredItemId, peripherals, applyTierReorder, applyPriceBandReorder, orderKey, allowLegacyFallback, tierKey, isPriceBandMode])

  const filtered = useMemo(() => {
    return visualPeripherals.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false

      const specs = item.specs ?? {}
      const searchable = `${item.name} ${item.brand} ${typeof specs.driver === "string" ? specs.driver : ""} ${typeof specs.profile === "string" ? specs.profile : ""}`
        .toLowerCase()
      const matchesQuery = query.trim() === "" || searchable.includes(query.trim().toLowerCase())
      const matchesBrand = selectedBrand === "all" || item.brand === selectedBrand
      const matchesPrice =
        selectedPriceBand === "all" ||
        (selectedPriceBand === "golpe" ? specs.golpe === true : getPriceBand(item.price) === selectedPriceBand)

      const matchesMouseShape =
        selectedCategory !== "mouse" ||
        selectedMouseShape === "all" ||
        (item.mouse_shape ?? specs.mouseShape) === selectedMouseShape

      const matchesKeyboardLayout =
        selectedCategory !== "keyboard" ||
        selectedKeyboardLayout === "all" ||
        (item.keyboard_layout ?? specs.keyboardLayout) === selectedKeyboardLayout

      const matchesTierlistMode = participatesInMode(item, ratingMode)

      return matchesQuery && matchesBrand && matchesPrice && matchesMouseShape && matchesKeyboardLayout && matchesTierlistMode
    })
  }, [
    visualPeripherals,
    selectedCategory,
    query,
    selectedBrand,
    selectedPriceBand,
    selectedMouseShape,
    ratingMode,
    selectedKeyboardLayout,
  ])

  const activeFiltersCount = useMemo(() => {
    return [selectedBrand, selectedPriceBand, selectedMouseShape, selectedKeyboardLayout].filter(
      (value) => value !== "all",
    ).length + (query.trim() ? 1 : 0)
  }, [query, selectedBrand, selectedPriceBand, selectedMouseShape, selectedKeyboardLayout])
  const unassignedItems = filtered
    .filter((item) => getModeTier(item, tierKey) === null)
    .map((item) => ({ ...item, tier: null }))
  // Candidatos para "vincular a este modo": mesma categoria selecionada, mas que ainda NÃO
  // participam do modo atual (specs.tierlistCategories não inclui `ratingMode`) — ignora os
  // filtros de busca/marca/preço de propósito, pra listar qualquer periférico da categoria
  // que possa ser adicionado, não só os que já passariam no filtro atual.
  const linkableItems = useMemo(() => {
    return peripherals.filter(
      (item) => item.category === selectedCategory && !participatesInMode(item, ratingMode),
    )
  }, [peripherals, selectedCategory, ratingMode])
  const activeItem = activeId
    ? (() => {
        const raw = peripherals.find((p) => p.id === activeId)
        return raw ? { ...raw, tier: getModeTier(raw, tierKey) } : null
      })()
    : null
  const modeConfig = MODE_CONFIGS[ratingMode]
  const modeDescription = t.admin.tierlistPage.modeDescriptions[ratingMode]

  const tierRows = useMemo(() => getTierRows(selectedCategory), [selectedCategory])

  const itemsByTier = useMemo(
    () =>
      tierRows.map((tier) => {
        let tierItems = filtered.filter((item) => getModeTier(item, tierKey) === tier.key)
        if (modeConfig.filterItem) tierItems = tierItems.filter(modeConfig.filterItem)
        return {
          ...tier,
          items: sortWithTierOrder(tierItems, orderKey, allowLegacyFallback, modeConfig.fallbackSort).map(
            (item) => ({ ...item, tier: tier.key }),
          ),
        }
      }),
    [filtered, modeConfig, orderKey, allowLegacyFallback, tierKey, tierRows]
  )

  // Faixa (o grupo em si) é manual (specs.adminPriceGroup) — soltar um item noutra faixa só
  // grava a nova posição (ver `applyPriceBandReorder`/`persistPriceBandOrder`), nunca mexe em
  // `price`. Itens nunca movidos caem no fallback calculado a partir do `price` real (ver
  // `getItemPriceGroup`/`resolvePriceGroupKey`). Faixas vazias somem quando não há drag em
  // andamento; durante o drag, todas aparecem (mesmo vazias) pra servir de alvo de drop —
  // mesma ideia do TIER_ROWS sempre completo nas outras abas. A ORDEM dos itens dentro de
  // cada faixa usa `adminPriceBandOrder` quando definida, com fallback pro tier score + nome.
  const priceGroupRows = useMemo(() => {
    const groups = new Map<PriceGroupKey, Peripheral[]>()
    for (const item of filtered) {
      const group = getItemPriceGroup(item)
      if (!group) continue
      const bucket = groups.get(group) ?? []
      bucket.push(item)
      groups.set(group, bucket)
    }

    const order: PriceGroupKey[] = [...PRICE_BANDS.map((band) => band.key), GOLPE_KEY]
    return order
      .filter((key) => activeId !== null || (groups.get(key)?.length ?? 0) > 0)
      .map((key) => ({
        key,
        label: PRICE_BAND_LABEL[key],
        accent: PRICE_BAND_THEMES[key].accent,
        textColor: PRICE_BAND_THEMES[key].textColor,
        items: sortWithTierOrder(groups.get(key) ?? [], PRICE_BAND_ORDER_KEY, false, (items) =>
          [...items].sort(
            (left, right) => getTierScore(right.tier) - getTierScore(left.tier) || left.name.localeCompare(right.name),
          ),
        ),
      }))
  }, [filtered, activeId])

  const handleCategoryChange = (category: Category) => {
    setSelectedCategory(category)
    setSelectedBrand("all")
    setSelectedMouseShape("all")
    setSelectedKeyboardLayout("all")
  }

  const resetFilters = () => {
    setQuery("")
    setSelectedBrand("all")
    setSelectedPriceBand("all")
    setSelectedMouseShape("all")
    setSelectedKeyboardLayout("all")
  }

  return (
    <div className="space-y-4">
      <TierlistMetaCard />

      <div className="flex justify-end">
        <Link href="/admin/tierlist/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            {t.admin.tierlistPage.newPeripheral}
          </Button>
        </Link>
      </div>

      <div>
        <FilterBar
          selectedCategory={selectedCategory}
          onCategoryChange={handleCategoryChange}
          query={query}
          onQueryChange={setQuery}
          selectedBrand={selectedBrand}
          onBrandChange={setSelectedBrand}
          selectedPriceBand={selectedPriceBand}
          onPriceBandChange={setSelectedPriceBand}
          selectedMouseShape={selectedMouseShape}
          onMouseShapeChange={setSelectedMouseShape}
          selectedKeyboardLayout={selectedKeyboardLayout}
          onKeyboardLayoutChange={setSelectedKeyboardLayout}
          availableBrands={availableBrands}
          activeFiltersCount={activeFiltersCount}
          filteredCount={filtered.length}
          onReset={resetFilters}
          showMouseShapeFilter={selectedCategory === "mouse"}
          showKeyboardLayoutFilter={selectedCategory === "keyboard"}
        />
      </div>


      <div className={cn("flex flex-col gap-4 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between", CARD_SURFACE)}>
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t.tierlist.viewingBy}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{modeDescription}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-1 rounded-lg border border-border bg-muted/30 p-1 sm:justify-start">
          {getModesForCategory(selectedCategory).map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setRatingMode(mode.key)}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition-all sm:px-4",
                ratingMode === mode.key
                  ? "bg-cyan-500/20 text-cyan-300"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  mode.color,
                  ratingMode === mode.key ? "opacity-100" : "opacity-40",
                )}
              />
              {getRatingModeLabel(mode.key, selectedCategory, locale)}
            </button>
          ))}
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2 [&>svg]:left-3 [&>svg~*]:pl-7">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs leading-5 text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {/* Tierlist Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-14">
          <BoxLoader />
        </div>
      ) : isPriceBandMode ? (
        // Faixa (o grupo) é derivada de `price`, mas pode mudar via drag: soltar um item
        // noutra faixa atualiza o preço dele pro mínimo daquela faixa (ver
        // `applyPriceBandReorder`). Preço exato e GOLPE/motivo continuam editáveis no form
        // (ícone de lápis), o drag só define a faixa/posição.
        <DndContext
          sensors={sensors}
          onDragStart={handleDragStart}
          onDragOver={handlePriceBandDragOver}
          onDragEnd={handlePriceBandDragEnd}
        >
          <section className={cn("overflow-hidden rounded-xl border shadow-lg", CARD_SURFACE)}>
            {priceGroupRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                {t.tierlist.noItems}
              </div>
            ) : (
              priceGroupRows.map((row) => (
                <div
                  key={row.key}
                  className="grid grid-cols-[56px_1fr] border-b border-border last:border-b-0 sm:grid-cols-[70px_1fr]"
                >
                  <div className={`flex flex-col items-center justify-center bg-gradient-to-b p-1 text-center ${row.accent} text-base font-black leading-tight ${row.textColor} sm:text-xl`}>
                    {row.label}
                  </div>

                  <div data-drop-zone={row.key}>
                    <DroppablePriceBandRow
                      priceGroup={row.key}
                      items={row.items}
                      isDragging={activeId !== null}
                      hoveredItemId={hoveredItemId}
                    />
                  </div>
                </div>
              ))
            )}
          </section>

          <DragOverlay dropAnimation={null}>
            {activeItem ? <DragOverlayCard item={activeItem} /> : null}
          </DragOverlay>
        </DndContext>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <section className={cn("overflow-hidden rounded-xl border shadow-lg", CARD_SURFACE)}>
            {itemsByTier.map((tierRow) => (
              <div
                key={tierRow.key}
                className="grid grid-cols-[56px_1fr] border-b border-border last:border-b-0 sm:grid-cols-[70px_1fr]"
              >
                <div className={`flex flex-col items-center justify-center bg-gradient-to-b p-1 text-center ${tierRow.accent} text-lg font-black leading-tight ${tierRow.textColor} sm:text-2xl`}>
                  {tierRow.label}
                  {t.tierlist.tierSubtitles[tierRow.key] && (
                    <span className="text-[9px] font-medium leading-tight opacity-80 sm:text-[10px]">
                      {t.tierlist.tierSubtitles[tierRow.key]}
                    </span>
                  )}
                </div>

                <div data-drop-zone={tierRow.key}>
                  <DroppableTier
                    tier={tierRow.key}
                    items={tierRow.items}
                    isDragging={activeId !== null}
                    hoveredItemId={hoveredItemId}
                  />
                </div>
              </div>
            ))}
          </section>

          <div
            className={cn(
              "mt-6 overflow-hidden rounded-xl border bg-secondary/50 shadow-lg transition-colors duration-200",
              unassignedItems.length > 0 ? "border-amber-500/20" : activeId ? "border-amber-500/20" : "border-border"
            )}
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                {unassignedItems.length > 0 && <AlertCircle className="size-4 text-amber-400" />}
                <div>
                  <p className={cn("text-sm font-semibold", unassignedItems.length > 0 ? "text-amber-300" : "text-muted-foreground")}>
                    {t.admin.tierlistPage.underReviewPeripherals}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {unassignedItems.length > 0
                      ? t.admin.tierlistPage.dragToTierDesc
                      : t.admin.tierlistPage.dropToRemoveDesc}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {unassignedItems.length > 0 && (
                  <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-400">
                    {t.admin.tierlistPage.itemsCount(unassignedItems.length)}
                  </span>
                )}
                <LinkPeripheralPopover items={linkableItems} onLink={handleAddToMode} />
              </div>
            </div>
            <DroppableUnassignedPool
              items={unassignedItems}
              onRemoveFromCategory={(id) => handleRemoveFromMode(id)}
              isDragging={activeId !== null}
            />
          </div>

          <DragOverlay dropAnimation={null}>
            {activeItem ? <DragOverlayCard item={activeItem} /> : null}
          </DragOverlay>
        </DndContext>
      )}

    </div>
  )
}
