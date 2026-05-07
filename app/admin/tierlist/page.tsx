"use client"

import { useEffect, useState, useMemo, useCallback } from "react"
import Link from "next/link"
import Image from "next/image"
import { Edit, Plus, Trash2, AlertCircle } from "lucide-react"
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core"
import { CSS } from "@dnd-kit/utilities"

import { Badge } from "@/components/ui/badge"
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

type RatingMode = "performance" | "value" | "recommended"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type Tag = "competitive" | "versatile" | "value" | "comfort"

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

const TAGS_OPTIONS: Tag[] = ["competitive", "versatile", "value", "comfort"]
const RATING_MODES: { key: RatingMode; en: string; pt: string }[] = [
  { key: "performance", en: "Performance", pt: "Performance" },
  { key: "value", en: "Value", pt: "Custo-Beneficio" },
  { key: "recommended", en: "Recommended", pt: "Recomendado" },
]

const UNASSIGNED_SLOT_COUNT = 8

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

function getSpecBadges(item: Peripheral) {
  const badges: string[] = [`$${item.price}`]

  const specs = item.specs ?? {}
  if (typeof specs.mouseShape === "string") badges.push(formatLabel(specs.mouseShape))
  if (typeof specs.keyboardLayout === "string") badges.push(specs.keyboardLayout.toUpperCase())
  if (typeof specs.connectivity === "string") badges.push(formatLabel(specs.connectivity))
  if (typeof specs.surface === "string") badges.push(formatLabel(specs.surface))

  return badges
}

function getSecondaryLine(item: Peripheral) {
  const specs = item.specs ?? {}
  const parts: string[] = []

  if (typeof specs.size === "string") parts.push(formatLabel(specs.size))
  if (typeof specs.driver === "string") parts.push(specs.driver)
  if (typeof specs.profile === "string") parts.push(specs.profile)

  return parts.join(" • ")
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

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  })
  const tierStyle = item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L
  const tagStyle = item.tags[0] ? CARD_TAG_STYLES[item.tags[0]] : CARD_TAG_STYLES.versatile

  const style = {
    transform: CSS.Transform.toString(transform),
    opacity: isDragging ? 0.5 : 1,
    transition: "all 0.2s ease",
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          ref={setNodeRef}
          style={style}
          className="group relative cursor-grab active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <Card className="group cursor-default overflow-visible border border-white/[0.12] bg-[#0a0e17]/95 p-0 shadow-xl transition-all duration-200 hover:-translate-y-0.5 hover:border-white/[0.18] hover:bg-[#0a0e17]/95">
            <CardContent className="p-0">
              <div className="flex gap-2.5 p-2.5">
                <div className={`grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg text-sm font-bold shadow-lg ${tierStyle.bg} ${tierStyle.text}`}>
                  {item.image_url ? (
                    <Image
                      src={item.image_url}
                      alt={item.name}
                      width={48}
                      height={48}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    item.brand.slice(0, 2).toUpperCase()
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-xs font-bold leading-tight text-slate-100">
                      {item.name}
                    </h3>
                    <p className="mt-0.5 text-[9px] font-medium text-slate-500">
                      {item.brand}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {getSpecBadges(item).map((badge, index) => (
                      <Badge
                        className="rounded-sm border border-white/[0.08] bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-slate-100"
                        key={`${item.id}-${badge}-${index}`}
                        variant="outline"
                      >
                        {badge}
                      </Badge>
                    ))}
                  </div>

                  <div className={`truncate text-[10px] font-semibold uppercase ${tagStyle.text}`}>
                    {getSecondaryLine(item)}
                  </div>
                </div>

                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <Link href={`/admin/tierlist/${item.id}`}>
                    <Button
                      className="h-7 w-7 text-slate-300 hover:text-slate-100"
                      size="icon"
                      variant="ghost"
                    >
                      <Edit className="size-3.5" />
                    </Button>
                  </Link>

                  <Button
                    className="h-7 w-7 text-red-400 hover:text-red-300"
                    onClick={() => onDelete(item.id)}
                    size="icon"
                    variant="ghost"
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </TooltipTrigger>

      <TooltipContent
        arrowClassName="!bg-[#0a0e17] !fill-[#0a0e17]"
        className="max-w-sm rounded-lg border border-white/[0.12] bg-[#0a0e17]/95 p-5 text-left shadow-xl backdrop-blur-md"
        sideOffset={12}
      >
        <div className="space-y-3.5">
          <div className="border-b border-white/[0.08] pb-3">
            <div className="flex items-start justify-between gap-3">
              {item.image_url ? (
                <div className={`size-12 shrink-0 overflow-hidden rounded-lg ${tierStyle.bg} ${tierStyle.text}`}>
                  <Image
                    src={item.image_url}
                    alt={item.name}
                    width={48}
                    height={48}
                    className="h-full w-full object-cover"
                  />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-slate-100">{item.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {item.brand} • {(isEnglish
                    ? CATEGORY_META.find((category) => category.key === item.category)?.en
                    : CATEGORY_META.find((category) => category.key === item.category)?.pt)}
                </p>
              </div>
              <Badge className={`rounded-md px-2 py-1 text-center text-[10px] font-bold ${tierStyle.bg} ${tierStyle.text}`} variant="secondary">
                {item.tier}
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-md border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-center transition-colors duration-150 hover:bg-white/[0.08]">
              <div className="text-lg font-bold text-emerald-400">${item.price}</div>
              <div className="text-xs uppercase tracking-[0.1em] text-slate-500">Price</div>
            </div>
            <div className="rounded-md border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-center transition-colors duration-150 hover:bg-white/[0.08]">
              <div className="text-sm font-bold text-slate-100">{getPriceBand(item.price).toUpperCase()}</div>
              <div className="text-xs uppercase tracking-[0.1em] text-slate-500">Band</div>
            </div>
            <div className="rounded-md border border-white/[0.08] bg-white/[0.05] px-3 py-2.5 text-center transition-colors duration-150 hover:bg-white/[0.08]">
              <div className="text-sm font-bold text-slate-100">Admin</div>
              <div className="text-xs uppercase tracking-[0.1em] text-slate-500">Status</div>
            </div>
          </div>

          <div className="rounded-md border border-white/[0.08] bg-white/[0.05] px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Specs</p>
            <p className="mt-1.5 text-sm text-slate-100">
              {getSecondaryLine(item) || "No extra specs"}
            </p>
          </div>

          <div className="rounded-md border border-white/[0.08] bg-white/[0.05] px-3.5 py-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">Tags</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {item.tags.length > 0 ? (
                item.tags.map((tag) => (
                  <Badge
                    key={tag}
                    className={`rounded-full border px-2.5 py-1 text-xs ${CARD_TAG_STYLES[tag].bg} ${CARD_TAG_STYLES[tag].text} ${CARD_TAG_STYLES[tag].border}`}
                  >
                    {formatLabel(tag)}
                  </Badge>
                ))
              ) : (
                <span className="text-xs text-slate-300">{isEnglish ? "No tags" : "Sem tags"}</span>
              )}
            </div>
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

// Droppable Column
function DroppableColumn({
  tier,
  column,
  items,
  onDelete,
}: {
  tier: Tier
  column: string
  items: Peripheral[]
  onDelete: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `${tier}-${column}` })

  return (
    <div
      ref={setNodeRef}
      className={`border-r border-white/[0.08] last:border-r-0 transition-colors ${
        isOver ? "bg-white/5" : ""
      }`}
    >
      <div className="space-y-1.5 p-2 min-h-[60px]">
        {items.length > 0 ? (
          items.map((item) => (
            <DraggablePeripheralCard
              key={item.id}
              item={item}
              onDelete={onDelete}
            />
          ))
        ) : (
          <div className="px-1 py-2 text-xs text-slate-400">Vazio</div>
        )}
      </div>
    </div>
  )
}

function UnassignedSlot({ index, item, onDelete }: { index: number; item: Peripheral | undefined; onDelete: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: `unassigned-${index}` })

  if (!item) {
    return (
      <div
        ref={setNodeRef}
        className={`flex min-h-[124px] items-center justify-center rounded-xl border border-dashed transition-colors ${
          isOver ? "border-cyan-400 bg-cyan-500/10" : "border-white/[0.12] bg-white/[0.03]"
        }`}
      >
        <div className="text-center">
          <p className="text-xs font-medium text-slate-400">Slot vazio</p>
          <p className="mt-1 text-[10px] text-slate-500">Solte um periférico aqui</p>
        </div>
      </div>
    )
  }

  return (
    <div ref={setNodeRef} className={`relative group ${isOver ? "ring-2 ring-cyan-400/70 ring-offset-0" : ""}`}>
      <Card className="border border-white/[0.08] bg-[#0a0e17]/95 p-0 shadow-lg hover:border-white/[0.12] hover:bg-[#0a0e17]/95 transition-all">
        <CardContent className="p-3">
          <div className="flex gap-2 items-start">
            <div className={`grid size-10 shrink-0 place-items-center rounded-lg overflow-hidden text-xs font-bold ${(item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L).bg} ${(item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L).text}`}>
              {item.image_url ? (
                <Image
                  src={item.image_url}
                  alt={item.name}
                  width={40}
                  height={40}
                  className="w-full h-full object-cover"
                />
              ) : (
                item.brand.slice(0, 2).toUpperCase()
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="truncate text-xs font-bold text-slate-100">{item.name}</p>
              <p className="text-[9px] text-slate-500">{item.brand}</p>
              <p className="mt-1 text-[10px] font-semibold text-slate-500">Sem tags</p>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs border-white/[0.08] hover:border-white/[0.12] hover:bg-white/[0.05]"
              onClick={() => onDelete(item.id)}
            >
              Remover
            </Button>
          </div>
        </CardContent>
      </Card>
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
  const [tagsDialog, setTagsDialog] = useState<{ open: boolean; item: Peripheral | null }>({
    open: false,
    item: null,
  })
  const [selectedTag, setSelectedTag] = useState<Tag>("competitive")

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
        .select("*")
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (!over) return

    const draggedItem = peripherals.find((p) => p.id === active.id)
    if (!draggedItem) return

    const overId = over.id.toString()
    const specs = draggedItem.specs ?? {}

    if (overId.startsWith("unassigned-")) {
      const nextPeripherals = peripherals.map((item) =>
        item.id === draggedItem.id
          ? {
              ...item,
              tier: null,
              specs: {
                ...specs,
                adminValueBand: undefined,
                adminRecommendedBand: undefined,
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
          : getStoredModeColumn(
              draggedItem,
              "adminRecommendedBand",
              getRecommendedScore(draggedItem) >= 4.4
                ? "top"
                : getRecommendedScore(draggedItem) >= 3.2
                  ? "strong"
                  : "niche"
            )

    if (draggedItem.tier === newTier && currentColumn === newColumn) {
      return
    }

    const nextSpecs = {
      ...specs,
      ...(ratingMode === "value" ? { adminValueBand: newColumn } : {}),
      ...(ratingMode === "recommended" ? { adminRecommendedBand: newColumn } : {}),
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

  async function saveQuickTags() {
    if (!tagsDialog.item) return

    const itemId = tagsDialog.item.id

    const nextPeripherals = peripherals.map((item) =>
      item.id === itemId ? { ...item, tags: [selectedTag] } : item
    )

    setPeripherals(nextPeripherals)

    try {
      const { error: err } = await supabase
        .from("peripherals")
        .update({ tags: [selectedTag] })
        .eq("id", itemId)

      if (err) throw err
      setTagsDialog({ open: false, item: null })
    } catch (err) {
      setPeripherals(peripherals)
      setError(err instanceof Error ? err.message : (isEnglish ? "Failed to save tags" : "Erro ao salvar tags"))
    }
  }

  const selectedCategoryMeta = CATEGORY_META.find((c) => c.key === selectedCategory)
  const categoryLabel = selectedCategoryMeta ? (isEnglish ? selectedCategoryMeta.en : selectedCategoryMeta.pt) : "Tierlist"
  const filtered = peripherals.filter((item) => item.category === selectedCategory)
  const unassignedItems = filtered.filter((item) => item.tier === null)
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
            {RATING_MODES.map((mode) => (
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
                {isEnglish ? mode.en : mode.pt}
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
        <Card className="border-white/[0.08] bg-card shadow-lg">
          <CardContent className="pt-6 text-center text-slate-400">{isEnglish ? "Loading..." : "Carregando..."}</CardContent>
        </Card>
      ) : (
        <>
          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-card shadow-lg">

              {itemsByTier.map((tierRow) => (
                <div
                  key={tierRow.key}
                  className="grid border-b border-white/[0.08] last:border-b-0"
                  style={{
                    gridTemplateColumns: `70px repeat(${modeConfig.columns.length}, minmax(220px, 1fr))`,
                  }}
                >
                  {/* Tier Label */}
                  <div className={`flex items-center justify-center bg-gradient-to-b ${tierRow.accent} text-2xl font-black ${tierRow.textColor}`}>
                    {tierRow.label}
                  </div>

                  {/* Columns */}
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
                      />
                    </div>
                  ))}
                </div>
              ))}
            </section>
          </DndContext>

          {/* Periféricos sem tier */}
          <div className="mt-6 space-y-3">
            <Alert className="border-amber-500/30 bg-amber-500/10">
              <AlertCircle className="size-3.5 text-amber-400" />
              <AlertDescription className="text-xs leading-5 text-amber-300">
                ⚠️ {unassignedItems.length} {isEnglish ? "peripheral(s) without tier. Drag them to a tier when you want to rank them." : "periférico(s) sem tier. Arraste para um tier quando quiser ranqueá-los."}
              </AlertDescription>
            </Alert>

            <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#05070d] shadow-lg">
              <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    {isEnglish ? "No tier peripherals" : "Periféricos sem tier"}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isEnglish ? "Visible only in the admin editor." : "Visível apenas no editor admin."}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {unassignedItems.length}/{UNASSIGNED_SLOT_COUNT} {isEnglish ? "filled" : "ocupados"}
                </p>
              </div>

              <div className="grid gap-3 p-4 [grid-template-columns:repeat(auto-fill,minmax(148px,1fr))]">
                {Array.from({ length: Math.max(UNASSIGNED_SLOT_COUNT, unassignedItems.length) }).map((_, index) => (
                  <UnassignedSlot
                    key={`slot-${index}`}
                    index={index}
                    item={unassignedItems[index]}
                    onDelete={(id) => {
                      const item = peripherals.find((peripheral) => peripheral.id === id)
                      if (item) setTagsDialog({ open: true, item })
                    }}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
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

      {/* Quick Tags Dialog */}
      <Dialog
        open={tagsDialog.open}
        onOpenChange={(open) => !open && setTagsDialog({ open: false, item: null })}
      >
        <DialogContent className="border border-white/[0.12] bg-[#0a0e17]/95">
          <DialogHeader>
            <DialogTitle>{isEnglish ? "Add Tags" : "Adicionar Tags"}</DialogTitle>
            <DialogDescription>
              {isEnglish ? "Select tags for" : "Selecione as tags para"} {tagsDialog.item?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">{isEnglish ? "Primary tag" : "Tag principal"}</label>
              <Select value={selectedTag} onValueChange={(value) => setSelectedTag(value as Tag)}>
                <SelectTrigger className="border-white/10 bg-white/5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TAGS_OPTIONS.map((tag) => (
                    <SelectItem key={tag} value={tag}>
                      {tag.charAt(0).toUpperCase() + tag.slice(1)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-400">
              {isEnglish ? "The card will appear in a single column to avoid duplication." : "O card vai aparecer em uma única coluna para evitar duplicação."}
            </p>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setTagsDialog({ open: false, item: null })}
            >
              {isEnglish ? "Cancel" : "Cancelar"}
            </Button>
            <Button onClick={saveQuickTags}>
              {isEnglish ? "Save Tags" : "Salvar Tags"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Total */}
      <div className="text-sm text-slate-400 text-center">
        {isEnglish ? "Total" : "Total"}: {filtered.length} {isEnglish ? "peripherals in" : "periféricos em"} {categoryLabel}
      </div>
    </div>
  )
}
