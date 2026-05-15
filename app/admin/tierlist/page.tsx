"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Edit, Plus, Trash2, AlertCircle } from "lucide-react"
import BoxLoader from "@/components/ui/box-loader"
import {
  DndContext,
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
import { Card, CardContent } from "@/components/ui/card"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLocale } from "@/lib/locale-context"
import { supabase } from "@/lib/supabase"
import {
  CARD_TAG_STYLES,
  CARD_TIER_STYLES,
  RECOMMENDED_COLUMN_COLORS,
  TAG_COLUMN_COLORS,
  TIER_THEMES,
  VALUE_COLUMN_COLORS,
} from "@/lib/tierlist-theme"
import { TierItemTooltipContent } from "@/components/tierlist/TierItemTooltipContent"

type RatingMode = "oled" | "performance" | "value" | "recommended" | "soundTyping"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type Tag = "competitive" | "versatile" | "value" | "comfort" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode"

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

const COLUMNS: { key: Tag; title: string }[] = [
  { key: "competitive", title: "Competitive" },
  { key: "versatile", title: "Versatile" },
  { key: "value", title: "Value" },
  { key: "comfort", title: "Comfort" },
]

const RATING_MODES: { key: RatingMode; en: string; pt: string }[] = [
  { key: "oled", en: "OLED", pt: "OLED" },
  { key: "performance", en: "Performance", pt: "Performance" },
  { key: "value", en: "Value", pt: "Custo-Beneficio" },
  { key: "recommended", en: "Recommended", pt: "Recomendado" },
  { key: "soundTyping", en: "Sound & Typing", pt: "Som e Digitação" },
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

type PriceBand = "budget" | "mid" | "premium"

type ModeColumn = {
  key: string
  title: string
  color: string
}

type ModeConfig = {
  enDescription: string
  ptDescription: string
  columns: ModeColumn[]
  getColumnKeys: (item: Peripheral) => string[]
  sortItems: (items: Peripheral[]) => Peripheral[]
}

function getPrimaryTag(item: Peripheral): Tag | null {
  return item.tags[0] ?? null
}

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getSpecPairs(item: Peripheral): { label: string; value: string }[] {
  const specs = item.specs ?? {}
  const pairs: { label: string; value: string }[] = []
  if (typeof specs.connectivity === "string") pairs.push({ label: "Connect.", value: formatLabel(specs.connectivity) })
  if (typeof specs.size === "string") pairs.push({ label: "Size", value: formatLabel(specs.size) })
  if (typeof specs.driver === "string") pairs.push({ label: "Driver", value: String(specs.driver) })
  if (typeof specs.mouseShape === "string") pairs.push({ label: "Shape", value: formatLabel(specs.mouseShape) })
  if (typeof specs.keyboardLayout === "string") pairs.push({ label: "Layout", value: specs.keyboardLayout.toUpperCase() })
  if (typeof specs.surface === "string") pairs.push({ label: "Surface", value: formatLabel(specs.surface) })
  if (typeof specs.profile === "string") pairs.push({ label: "Profile", value: String(specs.profile) })
  if (typeof specs.keyboardType === "string") pairs.push({ label: "Type", value: formatLabel(specs.keyboardType) })
  if (typeof specs.padType === "string") pairs.push({ label: "Pad", value: formatLabel(specs.padType) })
  if (typeof specs.refreshRate === "number") pairs.push({ label: "Refresh", value: `${specs.refreshRate}Hz` })
  if (typeof specs.panelType === "string") pairs.push({ label: "Panel", value: formatLabel(specs.panelType) })
  return pairs
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

function getRecommendedScore(item: Peripheral) {
  const tagScore = item.tags.reduce((accumulator, tag) => {
    if (tag === "competitive") return accumulator + 0.8
    if (tag === "versatile") return accumulator + 0.6
    if (tag === "value") return accumulator + 0.7
    if (tag === "comfort") return accumulator + 0.4
    return accumulator
  }, 0)

  return getTierScore(item.tier) + tagScore - Math.min(item.price / 300, 1)
}

function getPerformanceColumnKeys(item: Peripheral) {
  const primaryTag = getPrimaryTag(item)
  if (item.category === "mouse") return [primaryTag ?? "versatile"]
  return item.tags.length > 0 ? item.tags : ["value"]
}

function getStoredModeColumn(item: Peripheral, fieldName: string, fallbackValue: string) {
  const storedValue = item.specs?.[fieldName]
  return typeof storedValue === "string" && storedValue ? storedValue : fallbackValue
}

const PERFORMANCE_COLUMNS: ModeColumn[] = COLUMNS.map((column) => ({
  ...column,
  color: TAG_COLUMN_COLORS[column.key],
}))
const VALUE_COLUMNS: ModeColumn[] = [
  { key: "budget", title: "Budget", color: VALUE_COLUMN_COLORS.budget },
  { key: "mid", title: "Mid", color: VALUE_COLUMN_COLORS.mid },
  { key: "premium", title: "Premium", color: VALUE_COLUMN_COLORS.premium },
]
const RECOMMENDED_COLUMNS: ModeColumn[] = [
  { key: "top", title: "Top Picks", color: RECOMMENDED_COLUMN_COLORS.top },
  { key: "strong", title: "Strong Picks", color: RECOMMENDED_COLUMN_COLORS.strong },
  { key: "niche", title: "Niche Picks", color: RECOMMENDED_COLUMN_COLORS.niche },
]

const MODE_CONFIGS: Record<RatingMode, ModeConfig> = {
  performance: {
    enDescription: "Sorted by pure performance",
    ptDescription: "Ordenado por desempenho puro",
    columns: PERFORMANCE_COLUMNS,
    getColumnKeys: getPerformanceColumnKeys,
    sortItems: (items) =>
      [...items].sort((left, right) => getTierScore(right.tier) - getTierScore(left.tier) || left.name.localeCompare(right.name)),
  },
  value: {
    enDescription: "Grouped by price range within each tier",
    ptDescription: "Distribuído por faixa de preco dentro de cada tier",
    columns: VALUE_COLUMNS,
    getColumnKeys: (item) => [getStoredModeColumn(item, "adminValueBand", getPriceBand(item.price))],
    sortItems: (items) => [...items].sort((left, right) => left.price - right.price || left.name.localeCompare(right.name)),
  },
  recommended: {
    enDescription: "Suggested picks by Sunano, prioritizing overall balance",
    ptDescription: "Escolhas sugeridas por Sunano, priorizando equilibrio geral",
    columns: RECOMMENDED_COLUMNS,
    getColumnKeys: (item) => {
      const score = getRecommendedScore(item)
      const fallbackColumn = score >= 4.4 ? "top" : score >= 3.2 ? "strong" : "niche"
      return [getStoredModeColumn(item, "adminRecommendedBand", fallbackColumn)]
    },
    sortItems: (items) =>
      [...items].sort((left, right) => getRecommendedScore(right) - getRecommendedScore(left) || left.name.localeCompare(right.name)),
  },
  oled: {
    enDescription: "Show only OLED panels",
    ptDescription: "Apenas painéis OLED",
    columns: [
      { key: "oled", title: "OLED", color: "text-cyan-300" },
    ],
    getColumnKeys: (item) => {
      const spec = item.specs?.panelType
      return typeof spec === "string" && spec.toLowerCase().includes("oled") ? ["oled"] : []
    },
    sortItems: (items) =>
      [...items].sort((left, right) => getTierScore(right.tier) - getTierScore(left.tier) || left.name.localeCompare(right.name)),
  },
  soundTyping: {
    enDescription: "Sorted by sound and typing feel",
    ptDescription: "Ordenado por som e digitação",
    columns: [
      { key: "thocky-linear", title: "Thocky Linear", color: "text-cyan-400" },
      { key: "thocky-tactile", title: "Thocky Tactile", color: "text-cyan-300" },
      { key: "clacky-linear", title: "Clacky Linear", color: "text-blue-400" },
      { key: "clacky-tactile", title: "Clacky Tactile", color: "text-blue-300" },
      { key: "hollow-linear", title: "Hollow Linear", color: "text-purple-400" },
      { key: "hollow-tactile", title: "Hollow Tactile", color: "text-purple-300" },
    ],
    getColumnKeys: (item) => {
      const sound = getStoredModeColumn(item, "adminSoundProfile", "thocky")
      const typing = getStoredModeColumn(item, "adminTypingFeel", "linear")
      return [`${sound}-${typing}`]
    },
    sortItems: (items) =>
      [...items].sort((left, right) => getTierScore(right.tier) - getTierScore(left.tier) || left.name.localeCompare(right.name)),
  },
}

// Draggable Item Component
function DraggablePeripheralCard({
  item,
  onDelete,
}: {
  item: Peripheral
  onDelete: (id: string) => void
}) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: item.id })
  const tierStyle = item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L
  const categoryMeta = CATEGORY_META.find((c) => c.key === item.category)
  const specPairs = getSpecPairs(item)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          style={{ opacity: isDragging ? 0.2 : 1 }}
          className="group cursor-grab active:cursor-grabbing transition-opacity duration-100"
          {...attributes}
          {...listeners}
        >
          <Card className="border border-white/[0.10] bg-[#0a0e17]/90 p-0 shadow-md transition-all duration-200 hover:border-white/[0.22] hover:shadow-lg">
            <CardContent className="p-0">
              <div className="flex items-start gap-2.5 p-2.5">
                <div className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg text-[10px] font-bold shadow-md", tierStyle.bg, tierStyle.text)}>
                  {item.image_url ? (
                    <Image src={item.image_url} alt={item.name} width={40} height={40} className="h-full w-full object-cover" />
                  ) : (
                    item.brand.slice(0, 2).toUpperCase()
                  )}
                </div>

                <div className="min-w-0 flex-1 pt-px">
                  <p className="truncate text-[11px] font-bold leading-tight text-slate-100">{item.name}</p>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="truncate text-[9px] text-slate-500">{item.brand}</span>
                    <span className="text-slate-700">·</span>
                    <span className="text-[9px] font-semibold text-emerald-400">${item.price}</span>
                  </div>
                  {item.tags.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {item.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className={cn("rounded px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide", CARD_TAG_STYLES[tag].bg, CARD_TAG_STYLES[tag].text)}
                        >
                          {tag.slice(0, 4)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex shrink-0 flex-col gap-0.5 pt-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <Link href={`/admin/tierlist/${item.id}`}>
                    <Button size="icon" variant="ghost" className="h-6 w-6 text-slate-400 hover:text-slate-100">
                      <Edit className="size-3" />
                    </Button>
                  </Link>
                  <Button size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-400" onClick={() => onDelete(item.id)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TooltipTrigger>

      <TooltipContent
        className="rounded-xl border border-white/[0.12] bg-[#0a0e17]/95 p-4 shadow-2xl backdrop-blur-md"
        sideOffset={12}
      >
        <TierItemTooltipContent
          name={item.name}
          brand={item.brand}
          categoryLabel={isEnglish ? (categoryMeta?.en ?? item.category) : (categoryMeta?.pt ?? item.category)}
          image_url={item.image_url}
          tier={item.tier}
          tags={item.tags}
          specs={specPairs}
          displayPrice={`$${item.price}`}
          isEnglish={isEnglish}
          priceBand={getPriceBand(item.price)}
        />
      </TooltipContent>
    </Tooltip>
  )
}

// Floating card that follows the cursor during drag
function DragOverlayCard({ item }: { item: Peripheral }) {
  const tierStyle = item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L

  return (
    <div className="w-[240px] rotate-1 scale-105 cursor-grabbing drop-shadow-2xl">
      <Card className="border border-cyan-400/50 bg-[#0a0e17] p-0 ring-2 ring-cyan-400/20">
        <CardContent className="p-0">
          <div className="flex items-start gap-2.5 p-2.5">
            <div className={cn("grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg text-[10px] font-bold shadow-md", tierStyle.bg, tierStyle.text)}>
              {item.image_url ? (
                <Image src={item.image_url} alt={item.name} width={40} height={40} className="h-full w-full object-cover" />
              ) : (
                item.brand.slice(0, 2).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1 pt-px">
              <p className="truncate text-[11px] font-bold leading-tight text-slate-100">{item.name}</p>
              <div className="mt-0.5 flex items-center gap-1.5">
                <span className="text-[9px] text-slate-500">{item.brand}</span>
                <span className="text-slate-700">·</span>
                <span className="text-[9px] font-semibold text-emerald-400">${item.price}</span>
              </div>
              {item.tags.length > 0 && (
                <div className="mt-1.5 flex gap-1">
                  {item.tags.slice(0, 2).map((tag) => (
                    <span key={tag} className={cn("rounded px-1.5 py-0.5 text-[8px] font-bold uppercase", CARD_TAG_STYLES[tag].bg, CARD_TAG_STYLES[tag].text)}>
                      {tag.slice(0, 4)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// Droppable Column
function DroppableColumn({
  tier,
  column,
  items,
  onDelete,
  isDragging,
}: {
  tier: Tier
  column: string
  items: Peripheral[]
  onDelete: (id: string) => void
  isDragging: boolean
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${tier}-${column}` })

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "relative border-r border-white/[0.08] last:border-r-0 transition-all duration-150",
        isOver && "bg-cyan-500/[0.06]"
      )}
    >
      {isOver && (
        <div className="pointer-events-none absolute inset-0 ring-1 ring-inset ring-cyan-400/50" />
      )}

      <div className="space-y-1.5 p-2">
        {items.length > 0 ? (
          <>
            {items.map((item) => (
              <DraggablePeripheralCard key={item.id} item={item} onDelete={onDelete} />
            ))}
            {isOver && (
              <div className="flex h-7 items-center justify-center rounded border border-dashed border-cyan-400/50 bg-cyan-500/5">
                <p className="text-[9px] font-medium text-cyan-400">Soltar aqui</p>
              </div>
            )}
          </>
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
        <div className="grid gap-2 p-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {items.map((item) => (
            <DraggablePeripheralCard key={item.id} item={item} onDelete={onDelete} />
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
                : (isEnglish ? "No peripherals without tier" : "Nenhum periférico sem tier")}
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
  const [selectedCategory, setSelectedCategory] = useState<Category>("mouse")
  const [ratingMode, setRatingMode] = useState<RatingMode>("performance")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  )

  const loadPeripherals = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const { data, error: err } = await supabase
        .from("peripherals")
        .select("id, name, brand, category, tier, price, image_url, tags, specs, created_at")
        .order("created_at", { ascending: false })

      if (err) throw err
      setPeripherals(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to load" : "Erro ao carregar"))
    } finally {
      setLoading(false)
    }
  }, [isEnglish])

  useEffect(() => {
    loadPeripherals()
  }, [loadPeripherals])

  // Ensure OLED mode is only active for monitors
  useEffect(() => {
    if (ratingMode === "oled" && selectedCategory !== "monitors") setRatingMode("performance")
    if (ratingMode === "soundTyping" && selectedCategory !== "switches") setRatingMode("performance")
  }, [ratingMode, selectedCategory])

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id.toString())
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null)
    const { active, over } = event

    if (!over) return

    const draggedItem = peripherals.find((p) => p.id === active.id)
    if (!draggedItem) return

    const overId = over.id.toString()
    const specs = draggedItem.specs ?? {}

    if (overId === "unassigned-pool") {
      const nextPeripherals = peripherals.map((item) =>
        item.id === draggedItem.id
          ? {
              ...item,
              tier: null,
              specs: {
                ...specs,
                adminValueBand: undefined,
                adminRecommendedBand: undefined,
                adminSoundProfile: undefined,
                adminTypingFeel: undefined,
              },
            }
          : item
      )

      setPeripherals(nextPeripherals)

      try {
        const { error: err } = await supabase
          .from("peripherals")
          .update({
            tier: null,
            specs: {
              ...specs,
              adminValueBand: null,
              adminRecommendedBand: null,
              adminSoundProfile: null,
              adminTypingFeel: null,
            },
          })
          .eq("id", draggedItem.id)

        if (err) throw err
      } catch (err) {
        setPeripherals(peripherals)
        setError(err instanceof Error ? err.message : (isEnglish ? "Failed to update" : "Erro ao atualizar"))
      }

      return
    }

    const [newTier, newColumn] = overId.split("-") as [Tier, string]

    const currentColumn =
      ratingMode === "performance"
        ? getPrimaryTag(draggedItem) ?? ""
        : ratingMode === "value"
          ? getStoredModeColumn(draggedItem, "adminValueBand", getPriceBand(draggedItem.price))
          : ratingMode === "recommended"
            ? getStoredModeColumn(
                draggedItem,
                "adminRecommendedBand",
                getRecommendedScore(draggedItem) >= 4.4
                  ? "top"
                  : getRecommendedScore(draggedItem) >= 3.2
                    ? "strong"
                    : "niche"
              )
            : ratingMode === "oled"
              ? (typeof draggedItem.specs?.panelType === "string" && draggedItem.specs.panelType.toLowerCase().includes("oled") ? "oled" : "")
              : ratingMode === "soundTyping"
                ? (() => {
                    const sound = getStoredModeColumn(draggedItem, "adminSoundProfile", "thocky")
                    const typing = getStoredModeColumn(draggedItem, "adminTypingFeel", "linear")
                    return `${sound}-${typing}`
                  })()
                : ""

    if (draggedItem.tier === newTier && currentColumn === newColumn) {
      return
    }

    const nextSpecs = {
      ...specs,
      ...(ratingMode === "value" ? { adminValueBand: newColumn } : {}),
      ...(ratingMode === "recommended" ? { adminRecommendedBand: newColumn } : {}),
      ...(ratingMode === "soundTyping" ? (() => {
        const [sound, typing] = newColumn.split("-")
        return { adminSoundProfile: sound, adminTypingFeel: typing }
      })() : {}),
    }

    const nextPeripherals = peripherals.map((item) =>
      item.id === draggedItem.id
        ? {
            ...item,
            tier: newTier,
            tags: ratingMode === "performance" ? [newColumn as Tag] : item.tags,
            specs: nextSpecs,
          }
        : item
    )

    setPeripherals(nextPeripherals)

    try {
      const { error: err } = await supabase.from("peripherals").update({
        tier: newTier,
        tags: ratingMode === "performance" ? [newColumn as Tag] : draggedItem.tags,
        specs: nextSpecs,
      }).eq("id", draggedItem.id)

      if (err) throw err
    } catch (err) {
      setPeripherals(peripherals)
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to update" : "Erro ao atualizar"))
    }
  }

  async function confirmDelete() {
    if (!deleteDialog.id) return

    try {
      setDeleting(true)
      const { error: err } = await supabase
        .from("peripherals")
        .delete()
        .eq("id", deleteDialog.id)

      if (err) throw err
      setPeripherals(peripherals.filter((p) => p.id !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "" })
    } catch (err) {
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to delete" : "Erro ao deletar"))
    } finally {
      setDeleting(false)
    }
  }

  const selectedCategoryMeta = CATEGORY_META.find((c) => c.key === selectedCategory)
  const categoryLabel = selectedCategoryMeta ? (isEnglish ? selectedCategoryMeta.en : selectedCategoryMeta.pt) : "Tierlist"
  const filtered = peripherals.filter((item) => item.category === selectedCategory)
  const unassignedItems = filtered.filter((item) => item.tier === null)
  const activeItem = activeId ? peripherals.find((p) => p.id === activeId) ?? null : null
  const modeConfig = MODE_CONFIGS[ratingMode]
  const modeDescription = isEnglish ? modeConfig.enDescription : modeConfig.ptDescription

  const itemsByTier = useMemo(
    () =>
      TIER_ROWS.map((tier) => ({
        ...tier,
        itemsByColumn: modeConfig.columns.map((column) => ({
          ...column,
          items: modeConfig.sortItems(filtered.filter((item) => item.tier === tier.key))
            .filter((item) => modeConfig.getColumnKeys(item).includes(column.key)),
        })),
      })),
    [filtered, modeConfig]
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">
            Admin Tierlist - {categoryLabel}
          </h1>
          <p className="text-sm text-slate-400 mt-1">{isEnglish ? "Drag and drop to reorder. Click to edit." : "Arraste e solte para reorganizar. Clique para editar."}</p>
        </div>
        <Link href="/admin/tierlist/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            {isEnglish ? "New Peripheral" : "Novo Periférico"}
          </Button>
        </Link>
      </div>

      {/* Category Selector */}
      <div className="space-y-3 rounded-xl border border-white/[0.08] bg-card p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-sm font-semibold text-slate-300">{isEnglish ? "Category:" : "Categoria:"}</span>
            <Select value={selectedCategory} onValueChange={(v) => setSelectedCategory(v as Category)}>
              <SelectTrigger className="w-48 border-white/10 bg-white/5 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORY_META.map((cat) => (
                  <SelectItem key={cat.key} value={cat.key}>
                    {isEnglish ? cat.en : cat.pt}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex rounded-lg border border-white/[0.1] bg-white/[0.02] p-1">
            {RATING_MODES.filter((m) => {
              if (m.key === "oled" && selectedCategory !== "monitors") return false
              if (m.key === "soundTyping" && selectedCategory !== "switches") return false
              return true
            }).map((mode) => (
              <button
                key={mode.key}
                type="button"
                onClick={() => setRatingMode(mode.key)}
                className={`rounded-md px-4 py-2 text-sm font-medium transition-all ${
                  ratingMode === mode.key
                    ? "bg-cyan-500/20 text-cyan-300"
                    : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
                }`}
              >
                {getRatingModeLabel(mode.key, selectedCategory, isEnglish)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-slate-500">{modeDescription}</p>
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
      ) :(
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-card shadow-lg">
            {itemsByTier.map((tierRow) => (
              <div
                key={tierRow.key}
                className="grid border-b border-white/[0.08] last:border-b-0"
                style={{
                  gridTemplateColumns: `70px repeat(${modeConfig.columns.length}, minmax(220px, 1fr))`,
                }}
              >
                <div className={`flex items-center justify-center bg-gradient-to-b ${tierRow.accent} text-2xl font-black ${tierRow.textColor}`}>
                  {tierRow.label}
                </div>

                {tierRow.itemsByColumn.map((column) => (
                  <div
                    key={`${tierRow.key}-${column.key}`}
                    data-drop-zone={`${tierRow.key}-${column.key}`}
                  >
                    <DroppableColumn
                      tier={tierRow.key}
                      column={column.key}
                      items={column.items}
                      onDelete={(id) => setDeleteDialog({ open: true, id })}
                      isDragging={activeId !== null}
                    />
                  </div>
                ))}
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
                    {isEnglish ? "No tier peripherals" : "Periféricos sem tier"}
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
