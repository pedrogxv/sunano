"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { Edit, Plus, Trash2, AlertCircle } from "lucide-react"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLocale } from "@/components/providers/locale-context"
import {
  CARD_TAG_STYLES,
  CARD_TIER_STYLES,
  TIER_THEMES,
} from "@/lib/tierlist-theme"
import { TierItemTooltipContent, type Ratings, type RatingKey } from "@/components/tierlist/TierItemTooltipContent"
import { FilterBar } from "@/components/tierlist/FilterBar"

type RatingMode = "oled" | "performance" | "value" | "recommended" | "soundTyping" | "mechanical" | "magnetic" | "pcb"

type Category = "all" | "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado"
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
  specs: Record<string, string | number | boolean | undefined>
  created_at: string
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
  { key: "dac_amp" as Category, en: "DAC/AMP", pt: "DAC/AMP" },
]

const TIER_ROWS: { key: Tier; label: string; accent: string; textColor: string }[] = [
  { key: "GOAT", label: "GOAT", accent: TIER_THEMES.GOAT.accent, textColor: TIER_THEMES.GOAT.textColor },
  { key: "SS", label: "SS", accent: TIER_THEMES.SS.accent, textColor: TIER_THEMES.SS.textColor },
  { key: "S", label: "S", accent: TIER_THEMES.S.accent, textColor: TIER_THEMES.S.textColor },
  { key: "A", label: "A", accent: TIER_THEMES.A.accent, textColor: TIER_THEMES.A.textColor },
  { key: "B", label: "B", accent: TIER_THEMES.B.accent, textColor: TIER_THEMES.B.textColor },
  { key: "C", label: "C", accent: TIER_THEMES.C.accent, textColor: TIER_THEMES.C.textColor },
  { key: "L", label: "L", accent: TIER_THEMES.L.accent, textColor: TIER_THEMES.L.textColor },
]

const RATING_MODES: { key: RatingMode; en: string; pt: string }[] = [
  { key: "oled", en: "OLED", pt: "OLED" },
  { key: "performance", en: "General", pt: "Geral" },
  { key: "value", en: "Value", pt: "Custo Benefício" },
  { key: "recommended", en: "Recommended", pt: "Recomendado" },
  { key: "soundTyping", en: "Sound & Typing", pt: "Som e Digitação" },
  { key: "mechanical", en: "Mechanical", pt: "Mecânico" },
  { key: "magnetic", en: "Magnetic", pt: "Magnético" },
  { key: "pcb", en: "PCB", pt: "PCB" },
]

// Labels específicos por categoria para MOUSEPAD e GLASSPAD
function getRatingModeLabel(mode: RatingMode, category: string, isEnglish: boolean): string {
  if (category === "mousepad" || category === "glasspad") {
    if (mode === "performance") return "Geral"
    if (mode === "value") return "Nacional"
    if (mode === "recommended") return "Recomendado"
  }

  if (category !== "switches" && mode === "soundTyping") {
    return ""
  }

  const mode_obj = RATING_MODES.find(m => m.key === mode)
  return isEnglish ? (mode_obj?.en || "") : (mode_obj?.pt || "")
}

type PriceBand = "all" | "budget" | "mid" | "premium"
const LEGACY_TIER_ORDER_SPEC_KEY = "adminTierOrder"
const ORDER_KEY_BY_MODE: Record<RatingMode, string> = {
  performance: "adminTierOrder_performance",
  value: "adminTierOrder_value",
  recommended: "adminTierOrder_recommended",
  oled: "adminTierOrder_oled",
  soundTyping: "adminTierOrder_soundTyping",
  mechanical: "adminTierOrder_mechanical",
  magnetic: "adminTierOrder_magnetic",
  pcb: "adminTierOrder_pcb",
}

type ModeConfig = {
  enDescription: string
  ptDescription: string
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

function getPriceBand(price: number): PriceBand {
  if (price <= 80) return "budget"
  if (price <= 160) return "mid"
  return "premium"
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

function normalizeTierOrder(items: Peripheral[], tier: TierValue, orderKey: string): Peripheral[] {
  if (tier === null) return items.map((item) => clearTierOrder(item, orderKey))
  return items.map((item, index) => withTierOrder({ ...item, tier }, index + 1, orderKey))
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

function getTierSubtitle(tier: Tier, isEnglish: boolean) {
  if (isEnglish) return ""
  const subtitles: Record<Tier, string> = {
    GOAT: "Simplesmente",
    SS: "Excepcional",
    S: "Muito bom",
    A: "Bom",
    B: "Decente",
    C: "Usável",
    L: "Veio Podi",
  }
  return subtitles[tier]
}

const MODE_CONFIGS: Record<RatingMode, ModeConfig> = {
  performance: {
    enDescription: "Sorted by pure performance",
    ptDescription: "Ordenado por desempenho puro",
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  value: {
    enDescription: "Sorted by price",
    ptDescription: "Ordenado por preço",
    fallbackSort: (items) => [...items].sort((left, right) => left.price - right.price || left.name.localeCompare(right.name)),
  },
  recommended: {
    enDescription: "Suggested picks by Sunano, prioritizing overall balance",
    ptDescription: "Escolhas sugeridas por Sunano, priorizando equilibrio geral",
    fallbackSort: (items) =>
      [...items].sort((left, right) => getRecommendedScore(right) - getRecommendedScore(left) || left.name.localeCompare(right.name)),
  },
  oled: {
    enDescription: "Show only OLED panels",
    ptDescription: "Apenas painéis OLED",
    filterItem: (item) => {
      const spec = item.specs?.panelType
      return typeof spec === "string" && spec.toLowerCase().includes("oled")
    },
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  soundTyping: {
    enDescription: "Sorted by sound and typing feel",
    ptDescription: "Ordenado por som e digitação",
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  mechanical: {
    enDescription: "Sorted by mechanical performance",
    ptDescription: "Ordenado por desempenho puro",
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  magnetic: {
    enDescription: "Sorted by magnetic performance",
    ptDescription: "Ordenado por desempenho magnético",
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  pcb: {
    enDescription: "Sorted by PCB performance",
    ptDescription: "Ordenado por desempenho PCB",
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
  onDelete,
  disableTooltip,
}: {
  item: Peripheral
  onDelete: (id: string) => void
  disableTooltip?: boolean
}) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const { attributes, listeners, setNodeRef: setDragNodeRef, isDragging } = useDraggable({ id: item.id })
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
        "group relative cursor-grab overflow-hidden rounded-lg border border-white/[0.10] bg-[#0a0e17]/90 transition-all duration-200 active:cursor-grabbing",
        "hover:border-white/[0.22] hover:shadow-md hover:shadow-black/40",
        isGoat && "shadow-[0_0_14px_rgba(240,97,97,0.18)]",
      )}
      {...attributes}
      {...listeners}
    >
      {/* Tier accent bar */}
      <div className={cn("absolute bottom-0 left-0 top-0 w-[3px] bg-gradient-to-b", tierTheme.accent)} />

      {/* Edit / Delete overlay */}
      <div className="absolute right-1 top-1 z-10 flex gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
        <Link href={`/admin/tierlist/${item.id}`} onPointerDown={(e) => e.stopPropagation()}>
          <Button size="icon" variant="ghost" className="size-6 bg-black/70 text-slate-300 hover:text-slate-100">
            <Edit className="size-3" />
          </Button>
        </Link>
        <Button
          size="icon"
          variant="ghost"
          className="size-6 bg-black/70 text-red-400 hover:text-red-300"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => onDelete(item.id)}
        >
          <Trash2 className="size-3" />
        </Button>
      </div>

      {/* Image area */}
      <div className="relative ml-[3px] h-12 overflow-hidden bg-black/60">
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
        <p className="line-clamp-2 text-[10px] font-bold leading-tight text-slate-100">{item.name}</p>
        <div className="mt-0.5 flex items-center justify-between gap-1">
          <p className="truncate text-[8px] text-slate-500">{item.brand}</p>
        </div>
      </div>
    </div>
  )

  if (disableTooltip || isDragging) return card

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent
        className="rounded-xl border border-white/[0.12] bg-[#0a0e17]/95 p-4 shadow-2xl backdrop-blur-md"
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
          isEnglish={isEnglish}
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
      <div className="relative overflow-hidden rounded-lg border border-cyan-400/50 bg-[#0a0e17] ring-2 ring-cyan-400/20">
        <div className={cn("absolute bottom-0 left-0 top-0 w-[3px] bg-gradient-to-b", tierTheme.accent)} />
        <div className="relative ml-[3px] h-12 overflow-hidden bg-black/60">
          {item.image_url ? (
            <Image src={item.image_url} alt={item.name} width={150} height={48} className="h-full w-full object-contain p-0.5" />
          ) : (
            <div className={cn("flex h-full items-center justify-center text-[10px] font-black", tierStyle.bg, tierStyle.text)}>
              {item.brand.slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
        <div className="ml-[3px] px-1.5 pb-1.5 pt-1">
          <p className="line-clamp-2 text-[10px] font-bold leading-tight text-slate-100">{item.name}</p>
          <p className="mt-0.5 truncate text-[8px] text-slate-500">{item.brand}</p>
        </div>
      </div>
    </div>
  )
}

// Droppable Tier row — single merged cell per tier
function DroppableTier({
  tier,
  items,
  onDelete,
  isDragging,
  hoveredItemId,
}: {
  tier: Tier
  items: Peripheral[]
  onDelete: (id: string) => void
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
                <DraggablePeripheralCard item={item} onDelete={onDelete} disableTooltip={isDragging} />
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
                  ? "border-white/[0.18] bg-white/[0.02]"
                  : "border-white/[0.05]"
            )}
          >
            <p
              className={cn(
                "text-[10px] font-medium transition-colors",
                isOver ? "text-cyan-300" : isDragging ? "text-slate-600" : "text-transparent"
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

function DroppableUnassignedPool({
  items,
  onDelete,
  isDragging,
}: {
  items: Peripheral[]
  onDelete: (id: string) => void
  isDragging: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "unassigned-pool" })
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"

  return (
    <div
      ref={setNodeRef}
      className={cn("transition-colors duration-150", isOver && "bg-amber-500/5")}
    >
      {items.length > 0 ? (
        <div className="grid gap-2 p-3 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
          {items.map((item) => (
            <DroppableCardSlot key={item.id} itemId={item.id}>
              <DraggablePeripheralCard item={item} onDelete={onDelete} disableTooltip={isDragging} />
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
                : "border-white/[0.06]"
          )}
        >
          <p
            className={cn(
              "text-xs font-medium transition-colors duration-150",
              isOver ? "text-amber-300" : isDragging ? "text-amber-400/70" : "text-slate-600"
            )}
          >
            {isOver
              ? (isEnglish ? "Release to remove tier" : "Solte para remover o tier")
              : isDragging
                ? (isEnglish ? "Drop here to remove tier" : "Solte aqui para remover o tier")
                : (isEnglish ? "No peripherals without tier" : "Nenhum periférico Sob Revisão")}
          </p>
        </div>
      )}
    </div>
  )
}


export default function AdminPeripheralsPage() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
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
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)
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
    insertAfter: boolean,
    targetItemId?: string,
  ) => {
    const draggedItem = allItems.find((item) => item.id === draggedId)
    if (!draggedItem) return allItems

    const sourceTier = draggedItem.tier
    const updates = new Map<string, Peripheral>()

    const destinationBase = sortByTierOrderThenName(
      allItems.filter((item) => item.tier === destinationTier && item.id !== draggedId),
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
      { ...draggedItem, tier: destinationTier },
    )

    for (const item of normalizeTierOrder(destinationItems, destinationTier, orderKey)) {
      updates.set(item.id, item)
    }

    if (sourceTier !== destinationTier) {
      const sourceItems = sortByTierOrderThenName(
        allItems.filter((item) => item.tier === sourceTier && item.id !== draggedId),
        orderKey,
        allowLegacyFallback,
      )
      for (const item of normalizeTierOrder(sourceItems, sourceTier, orderKey)) {
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
  ) => {
    const previousById = new Map(previousItems.map((item) => [item.id, item]))
    const changedItems = nextItems.filter((nextItem) => {
      const previousItem = previousById.get(nextItem.id)
      if (!previousItem) return false

      return (
        previousItem.tier !== nextItem.tier ||
        getTierOrder(previousItem, orderKey, allowLegacyFallback) !== getTierOrder(nextItem, orderKey, allowLegacyFallback)
      )
    })

    if (changedItems.length === 0) return

    await Promise.all(
      changedItems.map(async (item) => {
        const previousItem = previousById.get(item.id)
        const payload: Record<string, unknown> = {}

        if (previousItem?.tier !== item.tier) payload.tier = item.tier
        if (
          getTierOrder(previousItem as Peripheral, orderKey, allowLegacyFallback) !==
            getTierOrder(item, orderKey, allowLegacyFallback) ||
          previousItem?.tier !== item.tier
        ) {
          payload.specs = item.specs
        }

        if (Object.keys(payload).length === 0) return

        const res = await fetch(`/api/admin/peripherals/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(data?.error ?? (isEnglish ? "Failed to update order" : "Erro ao atualizar ordem"))
        }
      }),
    )
  }, [isEnglish])

  const loadPeripherals = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/admin/peripherals", { cache: "no-store" })
      const data = (await res.json().catch(() => null)) as { peripherals?: Peripheral[]; error?: string } | null
      if (!res.ok || !data?.peripherals) {
        throw new Error(data?.error ?? (isEnglish ? "Failed to load" : "Erro ao carregar"))
      }
      setPeripherals(data.peripherals)
    } catch (err) {
      const message = err instanceof Error ? err.message : (isEnglish ? "Failed to load" : "Erro ao carregar")
      setError(message)
      toast.error(isEnglish ? "Failed to load peripherals" : "Erro ao carregar periféricos", { description: message })
    } finally {
      setLoading(false)
    }
  }, [isEnglish])

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
    if (ratingMode === "soundTyping" && selectedCategory !== "switches") setRatingMode("performance")
    if ((ratingMode === "mechanical" || ratingMode === "magnetic" || ratingMode === "pcb") && selectedCategory !== "keyboard") setRatingMode("performance")
    if ((ratingMode === "performance" || ratingMode === "recommended") && selectedCategory === "keyboard") setRatingMode("magnetic")
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
    if (!targetItem || targetItem.tier !== draggedItem.tier) {
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
        targetItem.tier,
        orderKey,
        allowLegacyFallback,
        insertAfter,
        targetItem.id,
      )
      setPeripherals(nextPeripherals)

      try {
        await persistReorderedItems(previousPeripherals, nextPeripherals, orderKey, allowLegacyFallback)
        toast.success(isEnglish ? "Order updated" : "Ordem atualizada", {
          description: draggedItem.name,
        })
      } catch (err) {
        setPeripherals(previousPeripherals)
        const message = err instanceof Error ? err.message : (isEnglish ? "Failed to update" : "Erro ao atualizar")
        setError(message)
        toast.error(isEnglish ? "Failed to update peripheral order" : "Erro ao atualizar ordem dos periféricos", { description: message })
      }

      return
    }

    if (overId === "unassigned-pool") {
      if (draggedItem.tier === null) return

      const nextPeripherals = applyTierReorder(
        previousPeripherals,
        draggedItem.id,
        null,
        orderKey,
        allowLegacyFallback,
        false,
      )

      setPeripherals(nextPeripherals)

      try {
        await persistReorderedItems(previousPeripherals, nextPeripherals, orderKey, allowLegacyFallback)
        toast.success(isEnglish ? "Tier removed" : "Tier removido", {
          description: draggedItem.name,
        })
      } catch (err) {
        setPeripherals(previousPeripherals)
        const message = err instanceof Error ? err.message : (isEnglish ? "Failed to update" : "Erro ao atualizar")
        setError(message)
        toast.error(isEnglish ? "Failed to update peripheral" : "Erro ao atualizar periférico", { description: message })
      }

      return
    }

    const newTier = overId as Tier

    if (draggedItem.tier === newTier) {
      return
    }

    const nextPeripherals = applyTierReorder(
      previousPeripherals,
      draggedItem.id,
      newTier,
      orderKey,
      allowLegacyFallback,
      false,
    )

    setPeripherals(nextPeripherals)

    try {
      await persistReorderedItems(previousPeripherals, nextPeripherals, orderKey, allowLegacyFallback)
      toast.success(isEnglish ? `Moved to tier ${newTier}` : `Movido para tier ${newTier}`, {
        description: draggedItem.name,
      })
    } catch (err) {
      setPeripherals(previousPeripherals)
      const message = err instanceof Error ? err.message : (isEnglish ? "Failed to update" : "Erro ao atualizar")
      setError(message)
      toast.error(isEnglish ? "Failed to update peripheral" : "Erro ao atualizar periférico", { description: message })
    }
  }

  async function confirmDelete() {
    if (!deleteDialog.id) return

    const deletedItem = peripherals.find((p) => p.id === deleteDialog.id)

    try {
      setDeleting(true)
      const res = await fetch(`/api/admin/peripherals/${deleteDialog.id}`, { method: "DELETE" })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? (isEnglish ? "Failed to delete" : "Erro ao deletar"))
      setPeripherals(peripherals.filter((p) => p.id !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "" })
      toast.success(isEnglish ? "Peripheral deleted" : "Periférico deletado", {
        description: deletedItem?.name,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : (isEnglish ? "Failed to delete" : "Erro ao deletar")
      setError(message)
      toast.error(isEnglish ? "Failed to delete peripheral" : "Erro ao deletar periférico", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  const selectedCategoryMeta = CATEGORY_META.find((c) => c.key === selectedCategory)
  const categoryLabel = selectedCategory === "all"
    ? (isEnglish ? "All" : "Geral")
    : selectedCategoryMeta
      ? (isEnglish ? selectedCategoryMeta.en : selectedCategoryMeta.pt)
      : "Tierlist"

  usePageHeader(
    `Admin Tierlist - ${categoryLabel}`,
    isEnglish ? "Drag and drop to reorder. Click to edit." : "Arraste e solte para reorganizar. Clique para editar."
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
    if (draggedItem.tier !== targetItem.tier) return peripherals

    return applyTierReorder(
      peripherals,
      draggedItem.id,
      targetItem.tier,
      orderKey,
      allowLegacyFallback,
      hoveredInsertAfterRef.current,
      targetItem.id,
    )
  }, [activeId, hoveredItemId, peripherals, applyTierReorder, orderKey, allowLegacyFallback])

  const filtered = useMemo(() => {
    return visualPeripherals.filter((item) => {
      if (selectedCategory !== "all" && item.category !== selectedCategory) return false

      const specs = item.specs ?? {}
      const searchable = `${item.name} ${item.brand} ${typeof specs.driver === "string" ? specs.driver : ""} ${typeof specs.profile === "string" ? specs.profile : ""}`
        .toLowerCase()
      const matchesQuery = query.trim() === "" || searchable.includes(query.trim().toLowerCase())
      const matchesBrand = selectedBrand === "all" || item.brand === selectedBrand
      const matchesPrice = selectedPriceBand === "all" || getPriceBand(item.price) === selectedPriceBand

      const matchesMouseShape =
        selectedCategory !== "mouse" ||
        selectedMouseShape === "all" ||
        specs.mouseShape === selectedMouseShape

      const matchesKeyboardLayout =
        selectedCategory !== "keyboard" ||
        selectedKeyboardLayout === "all" ||
        specs.keyboardLayout === selectedKeyboardLayout

      return matchesQuery && matchesBrand && matchesPrice && matchesMouseShape && matchesKeyboardLayout
    })
  }, [
    visualPeripherals,
    selectedCategory,
    query,
    selectedBrand,
    selectedPriceBand,
    selectedMouseShape,
    selectedKeyboardLayout,
  ])

  const activeFiltersCount = useMemo(() => {
    return [selectedBrand, selectedPriceBand, selectedMouseShape, selectedKeyboardLayout].filter(
      (value) => value !== "all",
    ).length + (query.trim() ? 1 : 0)
  }, [query, selectedBrand, selectedPriceBand, selectedMouseShape, selectedKeyboardLayout])
  const unassignedItems = filtered.filter((item) => item.tier === null)
  const activeItem = activeId ? peripherals.find((p) => p.id === activeId) ?? null : null
  const modeConfig = MODE_CONFIGS[ratingMode]
  const modeDescription = isEnglish ? modeConfig.enDescription : modeConfig.ptDescription

  const itemsByTier = useMemo(
    () =>
      TIER_ROWS.map((tier) => {
        let tierItems = filtered.filter((item) => item.tier === tier.key)
        if (modeConfig.filterItem) tierItems = tierItems.filter(modeConfig.filterItem)
        return {
          ...tier,
          items: sortWithTierOrder(tierItems, orderKey, allowLegacyFallback, modeConfig.fallbackSort),
        }
      }),
    [filtered, modeConfig, orderKey, allowLegacyFallback]
  )

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
      <div className="flex justify-end">
        <Link href="/admin/tierlist/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            {isEnglish ? "New Peripheral" : "Novo Periférico"}
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


      <div className="flex flex-col gap-4 rounded-xl border border-white/[0.08] bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">{isEnglish ? "You are viewing the tierlist sorted by:" : "Voce esta vendo a tierlist ordenada por:"}</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-100">{modeDescription}</p>
        </div>
        <div className="flex rounded-lg border border-white/[0.1] bg-white/[0.02] p-1">
          {RATING_MODES.filter((m) => {
            if (m.key === "oled" && selectedCategory !== "monitors") return false
            if (m.key === "soundTyping" && selectedCategory !== "switches") return false
            if ((m.key === "mechanical" || m.key === "magnetic" || m.key === "pcb") && selectedCategory !== "keyboard") return false
            if ((m.key === "performance" || m.key === "recommended") && selectedCategory === "keyboard") return false
            return true
          }).map((mode) => (
            <button
              key={mode.key}
              type="button"
              onClick={() => setRatingMode(mode.key)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${ratingMode === mode.key
                ? "bg-cyan-500/20 text-cyan-300"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                }`}
            >
              {getRatingModeLabel(mode.key, selectedCategory, isEnglish)}
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
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-card shadow-lg">
            {itemsByTier.map((tierRow) => (
              <div
                key={tierRow.key}
                className="grid border-b border-white/[0.08] last:border-b-0"
                style={{ gridTemplateColumns: "70px 1fr" }}
              >
                <div className={`flex flex-col items-center justify-center bg-gradient-to-b ${tierRow.accent} text-2xl font-black ${tierRow.textColor}`}>
                  {tierRow.label}
                  {getTierSubtitle(tierRow.key, isEnglish) && (
                    <span className="text-[10px] font-medium opacity-80">
                      {getTierSubtitle(tierRow.key, isEnglish)}
                    </span>
                  )}
                </div>

                <div data-drop-zone={tierRow.key}>
                  <DroppableTier
                    tier={tierRow.key}
                    items={tierRow.items}
                    onDelete={(id) => setDeleteDialog({ open: true, id })}
                    isDragging={activeId !== null}
                    hoveredItemId={hoveredItemId}
                  />
                </div>
              </div>
            ))}
          </section>

          <div
            className={cn(
              "mt-6 overflow-hidden rounded-xl border bg-[#05070d] shadow-lg transition-colors duration-200",
              unassignedItems.length > 0 ? "border-amber-500/20" : activeId ? "border-amber-500/20" : "border-white/[0.08]"
            )}
          >
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <div className="flex items-center gap-3">
                {unassignedItems.length > 0 && <AlertCircle className="size-4 text-amber-400" />}
                <div>
                  <p className={cn("text-sm font-semibold", unassignedItems.length > 0 ? "text-amber-300" : "text-slate-400")}>
                    {isEnglish ? "Under Review peripherals" : "Periféricos Sob Revisão"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {unassignedItems.length > 0
                      ? (isEnglish ? "Drag to a tier row to rank them" : "Arraste para um tier para ranqueá-los")
                      : (isEnglish ? "Drop a peripheral here to remove its tier" : "Solte um periférico aqui para remover o tier")}
                  </p>
                </div>
              </div>
              {unassignedItems.length > 0 && (
                <span className="rounded-full bg-amber-500/20 px-2.5 py-1 text-xs font-semibold text-amber-400">
                  {unassignedItems.length} {isEnglish ? "items" : "itens"}
                </span>
              )}
            </div>
            <DroppableUnassignedPool
              items={unassignedItems}
              onDelete={(id) => setDeleteDialog({ open: true, id })}
              isDragging={activeId !== null}
            />
          </div>

          <DragOverlay dropAnimation={null}>
            {activeItem ? <DragOverlayCard item={activeItem} /> : null}
          </DragOverlay>
        </DndContext>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent className="border border-white/[0.12] bg-[#0a0e17]/95">
          <DialogHeader>
            <DialogTitle>{isEnglish ? "Delete Peripheral?" : "Deletar Periférico?"}</DialogTitle>
            <DialogDescription>
              {isEnglish ? "This action cannot be undone." : "Esta ação não pode ser desfeita."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteDialog({ open: false, id: "" })}
              disabled={deleting}
            >
              {isEnglish ? "Cancel" : "Cancelar"}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? (isEnglish ? "Deleting..." : "Deletando...") : (isEnglish ? "Delete" : "Deletar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



    </div>
  )
}
