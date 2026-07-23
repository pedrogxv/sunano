"use client"

import Link from "next/link"
import Image from "next/image"
import { ArrowLeftRight, Check, ChevronDown, Edit, Headphones, Keyboard, Layers, LayoutGrid, Monitor, Mouse, Plus, Search, SlidersHorizontal, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Slider } from "@/components/ui/slider"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useT } from "@/lib/use-t"
import { usePageHeader } from "@/components/providers/page-header-context"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { CARD_TAG_STYLES } from "@/lib/tierlist-theme"
import { cn } from "@/lib/utils"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type SortKey = "recent" | "rank" | "name-asc" | "name-desc" | "price-asc" | "price-desc"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type MouseShape = "symmetrical" | "ergonomic"
type KeyboardLayout = "60%" | "75%" | "tkl" | "full-size"
type KeyboardType = "mechanical" | "magnetic" | "optical"
type PadType = "speed" | "control" | "hybrid"
type Surface = PadType | "glass" | "cloth"
type PanelType = "ips" | "tn" | "va" | "oled" | "other"
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado"

type Peripheral = {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: Category
  tier: Tier | null
  price: number
  ranking?: number
  score?: number
  tags: Tag[]
  specs: {
    mouseShape?: "symmetrical" | "ergonomic"
    keyboardLayout?: string
    keyboardType?: KeyboardType
    connectivity?: "wired" | "wireless"
    size?: "small" | "medium" | "large"
    surface?: Surface
    padType?: PadType
    driver?: string
    profile?: string
    refreshRate?: number
    panelType?: PanelType
    weightG?: number
  }
}

const WEIGHT_MIN_G = 0
const WEIGHT_MAX_G = 300
const PRICE_MIN = 0

interface PerifericosContentProps {
  initialData: Peripheral[]
  showAdminActions?: boolean
}

const CATEGORIES: Category[] = ["mouse", "keyboard", "mousepad", "headset", "monitors", "iem", "dac_amp", "glasspad", "switches", "feet", "chairs"]

const HERO_MAIN_CATEGORIES: Category[] = ["mouse", "keyboard", "mousepad", "headset", "monitors"]
const HERO_OTHER_CATEGORIES: Category[] = ["iem", "dac_amp", "glasspad", "switches", "feet", "chairs"]

const HERO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mouse: Mouse,
  keyboard: Keyboard,
  mousepad: Layers,
  headset: Headphones,
  monitors: Monitor,
  outros: LayoutGrid,
}

const TIER_ORDER: Record<string, number> = { GOAT: 0, SS: 1, S: 2, A: 3, B: 4, C: 5, L: 6 }

function formatLabel(value: string) {
  return value.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
}

const TAG_LABELS: Record<Tag, string> = {
  competitive: "Competitivo",
  versatile: "Bomba",
  value: "Custo-beneficio",
  cheap: "Barato",
  expensive: "Caro",
  light: "Leve",
  heavy: "Pesado",
  unbalanced: "Peso Desbalanceado",
  dpi_deviation: "DPI Deviation",
  wobble_high: "Wooble Alto",
  wobble_low: "Wooble Baixo",
  scroll_hard: "Scroll Duro",
  scroll_soft: "Scroll Mole",
  trimode: "Trimode",
  stable: "Estável",
  unstable: "Instável",
  "8_80": "8 80",
  poron: "Poron",
  borracha: "Borracha",
  grosso: "Grosso",
  fino: "Fino",
  rapido: "Rápido",
  devagar: "Devagar",
  hibrido: "Híbrido",
  aspero: "Áspero",
  liso: "Liso",
  mug: "Mug",
  macio: "Macio",
  afetado_umidade: "Afetado por Umidade",
  ultrapassado: "Ultrapassado",
}

function formatTagLabel(tag: Tag, category?: string) {
  if (category === "keyboard" && tag === "light") return "Leve"
  if (category === "keyboard" && tag === "heavy") return "Pesado"
  return TAG_LABELS[tag] ?? formatLabel(tag)
}

function PriceSlider({ value, onChange, max }: { value: [number, number]; onChange: (v: [number, number]) => void; max: number }) {
  const t = useT()
  const [minVal, maxVal] = value
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{t.filters.brl}</span>
        <span className="text-xs font-medium text-foreground">R${minVal} – R${maxVal}</span>
      </div>
      <Slider
        min={PRICE_MIN}
        max={max}
        step={10}
        value={[minVal, maxVal]}
        onValueChange={([min, max]) => onChange([min, max])}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground/60">
        <span>R${PRICE_MIN}</span>
        <span>R${max}</span>
      </div>
    </div>
  )
}

function WeightSlider({ value, onChange }: { value: [number, number]; onChange: (v: [number, number]) => void }) {
  const [minVal, maxVal] = value

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Gramas</span>
        <span className="text-xs font-medium text-foreground">{minVal}g – {maxVal}g</span>
      </div>
      <Slider
        min={WEIGHT_MIN_G}
        max={WEIGHT_MAX_G}
        step={5}
        value={[minVal, maxVal]}
        onValueChange={([min, max]) => onChange([min, max])}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground/60">
        <span>{WEIGHT_MIN_G}g</span>
        <span>{WEIGHT_MAX_G}g</span>
      </div>
    </div>
  )
}

function FilterSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/20"
      >
        {title}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export function PerifericosContent({ initialData: initialDataProp, showAdminActions }: PerifericosContentProps) {
  const t = useT()

  const [initialData, setInitialData] = useState<Peripheral[]>(initialDataProp)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" })
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [weightRange, setWeightRange] = useState<[number, number]>([WEIGHT_MIN_G, WEIGHT_MAX_G])

  useEffect(() => {
    setInitialData(initialDataProp)
  }, [initialDataProp])

  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category>("mouse")
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [priceRange, setPriceRange] = useState<[number, number]>([PRICE_MIN, 0])
  const [selectedConnectivity, setSelectedConnectivity] = useState("all")
  const [selectedMouseShape, setSelectedMouseShape] = useState<MouseShape | "all">("all")
  const [selectedKeyboardLayout, setSelectedKeyboardLayout] = useState<KeyboardLayout | "all">("all")
  const [selectedKeyboardType, setSelectedKeyboardType] = useState<KeyboardType | "all">("all")
  const [selectedSurface, setSelectedSurface] = useState<Surface | "all">("all")
  const [selectedProfile, setSelectedProfile] = useState<string | "all">("all")
  const [selectedPadType, setSelectedPadType] = useState<PadType | "all">("all")
  const [selectedRefreshRate, setSelectedRefreshRate] = useState<string | "all">("all")
  const [selectedPanelType, setSelectedPanelType] = useState<PanelType | "all">("all")
  const [sortKey, setSortKey] = useState<SortKey>("recent")
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const categoryLabels = t.categories.labels
  const categoryDescriptions = t.categories.descriptions

  const lockedCategory = useMemo(() => {
    if (selectedIds.length === 0) return null
    return initialData.find((i) => i.id === selectedIds[0])?.category ?? null
  }, [initialData, selectedIds])

  const effectiveCategory = lockedCategory ?? selectedCategory

  const showConnectivityFilter = useMemo(() => {
    if (!effectiveCategory) return false
    return ["mouse", "keyboard", "headset", "iem", "dac_amp"].includes(effectiveCategory)
  }, [effectiveCategory])

  const showMouseShapeFilter = effectiveCategory === "mouse"
  const showWeightFilter = effectiveCategory === "mouse"
  const showKeyboardLayoutFilter = effectiveCategory === "keyboard"
  const showSurfaceFilter = effectiveCategory === "mousepad" || effectiveCategory === "glasspad"
  const showProfileFilter = effectiveCategory === "mousepad" || effectiveCategory === "glasspad"

  const availableBrands = useMemo(() => {
    const base = effectiveCategory ? initialData.filter((i) => i.category === effectiveCategory) : initialData
    return ["all", ...Array.from(new Set(base.map((i) => i.brand))).sort((a, b) => a.localeCompare(b))]
  }, [initialData, effectiveCategory])

  const maxPrice = useMemo(() => {
    const base = effectiveCategory ? initialData.filter((i) => i.category === effectiveCategory) : initialData
    const max = Math.max(...base.map((i) => i.price), 0)
    return Math.ceil(max / 10) * 10
  }, [initialData, effectiveCategory])

  useEffect(() => {
    setPriceRange([PRICE_MIN, maxPrice])
  }, [maxPrice])

  const availableMouseShapes = useMemo(() => {
    if (!showMouseShapeFilter) return [] as MouseShape[]
    const values = new Set<MouseShape>()
    initialData
      .filter((item) => item.category === "mouse")
      .forEach((item) => { if (item.specs.mouseShape) values.add(item.specs.mouseShape) })
    return Array.from(values)
  }, [initialData, showMouseShapeFilter])

  const availableKeyboardLayouts = useMemo(() => {
    if (!showKeyboardLayoutFilter) return [] as KeyboardLayout[]
    const values = new Set<KeyboardLayout>()
    initialData
      .filter((item) => item.category === "keyboard")
      .forEach((item) => { if (item.specs.keyboardLayout) values.add(item.specs.keyboardLayout as KeyboardLayout) })
    return Array.from(values)
  }, [initialData, showKeyboardLayoutFilter])

  const showKeyboardTypeFilter = effectiveCategory === "keyboard"
  const showPadTypeFilter = effectiveCategory === "mousepad"
  const showMonitorFilters = effectiveCategory === "monitors"

  const availableKeyboardTypes = useMemo(() => {
    if (!showKeyboardTypeFilter) return [] as KeyboardType[]
    const values = new Set<KeyboardType>()
    initialData
      .filter((item) => item.category === "keyboard")
      .forEach((item) => { if (item.specs.keyboardType) values.add(item.specs.keyboardType) })
    return Array.from(values)
  }, [initialData, showKeyboardTypeFilter])

  const availablePadTypes = useMemo(() => {
    if (!showPadTypeFilter) return [] as PadType[]
    const values = new Set<PadType>()
    initialData
      .filter((item) => item.category === "mousepad")
      .forEach((item) => { if (item.specs.padType) values.add(item.specs.padType) })
    return Array.from(values)
  }, [initialData, showPadTypeFilter])

  const availableRefreshRates = useMemo(() => {
    if (!showMonitorFilters) return [] as string[]
    const rates = new Set<number>()
    initialData
      .filter((item) => item.category === "monitors")
      .forEach((item) => { if (typeof item.specs.refreshRate === "number") rates.add(item.specs.refreshRate) })
    const common = [144, 165, 240, 360, 480, 600]
    const found = Array.from(rates).sort((a, b) => a - b)
    return Array.from(new Set([...found, ...common])).map(String)
  }, [initialData, showMonitorFilters])

  const availablePanelTypes = useMemo(() => {
    if (!showMonitorFilters) return [] as PanelType[]
    const values = new Set<PanelType>()
    initialData
      .filter((item) => item.category === "monitors")
      .forEach((item) => { if (item.specs.panelType) values.add(item.specs.panelType) })
    return Array.from(values)
  }, [initialData, showMonitorFilters])

  const availableSurfaces = useMemo(() => {
    if (!showSurfaceFilter || !effectiveCategory) return [] as Surface[]
    const values = new Set<Surface>()
    initialData
      .filter((item) => item.category === effectiveCategory)
      .forEach((item) => { if (item.specs.surface) values.add(item.specs.surface) })
    return Array.from(values)
  }, [initialData, effectiveCategory, showSurfaceFilter])

  const availableProfiles = useMemo(() => {
    if (!showProfileFilter || !effectiveCategory) return [] as string[]
    const values = new Set<string>()
    initialData
      .filter((item) => item.category === effectiveCategory)
      .forEach((item) => { if (item.specs.profile) values.add(String(item.specs.profile)) })
    return Array.from(values)
  }, [initialData, effectiveCategory, showProfileFilter])

  const isWeightFiltered = showWeightFilter && (weightRange[0] > WEIGHT_MIN_G || weightRange[1] < WEIGHT_MAX_G)
  const isPriceFiltered = priceRange[0] > PRICE_MIN || priceRange[1] < maxPrice

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const results = initialData.filter((item) => {
      if (lockedCategory && item.category !== lockedCategory) return false
      if (item.category !== selectedCategory) return false
      const searchable = [item.name, item.brand, item.specs.driver ?? "", item.specs.profile ?? "", item.specs.keyboardLayout ?? ""]
        .join(" ").toLowerCase()
      return (
        (q === "" || searchable.includes(q)) &&
        (selectedBrand === "all" || item.brand === selectedBrand) &&
        (!isPriceFiltered || (item.price >= priceRange[0] && item.price <= priceRange[1])) &&
        (!showConnectivityFilter || selectedConnectivity === "all" || item.specs.connectivity === selectedConnectivity) &&
        (!showMouseShapeFilter || selectedMouseShape === "all" || item.specs.mouseShape === selectedMouseShape) &&
        (!showKeyboardLayoutFilter || selectedKeyboardLayout === "all" || item.specs.keyboardLayout === selectedKeyboardLayout) &&
        (!showKeyboardTypeFilter || selectedKeyboardType === "all" || item.specs.keyboardType === selectedKeyboardType) &&
        (!showSurfaceFilter || selectedSurface === "all" || item.specs.surface === selectedSurface) &&
        (!showPadTypeFilter || selectedPadType === "all" || item.specs.padType === selectedPadType) &&
        (!showProfileFilter || selectedProfile === "all" || item.specs.profile === selectedProfile) &&
        (!showMonitorFilters || selectedRefreshRate === "all" || Number(item.specs.refreshRate) === Number(selectedRefreshRate)) &&
        (!showMonitorFilters || selectedPanelType === "all" || item.specs.panelType === selectedPanelType) &&
        (!isWeightFiltered || item.specs.weightG === undefined || (item.specs.weightG >= weightRange[0] && item.specs.weightG <= weightRange[1]))
      )
    })

    const sorted = [...results]
    switch (sortKey) {
      case "rank":       sorted.sort((a, b) => (TIER_ORDER[a.tier ?? ""] ?? 99) - (TIER_ORDER[b.tier ?? ""] ?? 99) || a.name.localeCompare(b.name)); break
      case "name-asc":   sorted.sort((a, b) => a.name.localeCompare(b.name)); break
      case "name-desc":  sorted.sort((a, b) => b.name.localeCompare(a.name)); break
      case "price-asc":  sorted.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)); break
      case "price-desc": sorted.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name)); break
    }
    return sorted
  }, [
    initialData, query, selectedCategory, selectedBrand, selectedConnectivity,
    selectedMouseShape, selectedKeyboardLayout, selectedKeyboardType, selectedSurface, selectedProfile,
    selectedPadType, selectedRefreshRate, selectedPanelType, sortKey, lockedCategory,
    showConnectivityFilter, showMouseShapeFilter, showKeyboardLayoutFilter, showKeyboardTypeFilter,
    showSurfaceFilter, showProfileFilter, showPadTypeFilter, showMonitorFilters,
    isWeightFiltered, weightRange, isPriceFiltered, priceRange,
  ])

  const activeFiltersCount = useMemo(() =>
    [selectedBrand, selectedConnectivity, selectedMouseShape, selectedKeyboardLayout, selectedKeyboardType, selectedPadType, selectedSurface, selectedProfile, selectedRefreshRate, selectedPanelType]
      .filter((v) => v !== "all").length + (query.trim() ? 1 : 0) + (isWeightFiltered ? 1 : 0) + (isPriceFiltered ? 1 : 0),
    [query, selectedBrand, selectedCategory, selectedConnectivity, selectedMouseShape, selectedKeyboardLayout, selectedKeyboardType, selectedPadType, selectedSurface, selectedProfile, selectedRefreshRate, selectedPanelType, isWeightFiltered, isPriceFiltered]
  )

  const heroCategoryStats = useMemo(() => {
    const counts = CATEGORIES.reduce<Record<string, number>>((acc, cat) => {
      acc[cat] = initialData.filter((i) => i.category === cat).length
      return acc
    }, {})
    const othersCount = HERO_OTHER_CATEGORIES.reduce((sum, cat) => sum + (counts[cat] ?? 0), 0)
    return [
      ...HERO_MAIN_CATEGORIES.map((cat) => ({ key: cat as Category | "outros", label: categoryLabels[cat], count: counts[cat] ?? 0 })),
      { key: "outros" as Category | "outros", label: t.categories.others, count: othersCount },
    ]
  }, [initialData, categoryLabels])

  const resetFilters = () => {
    setQuery("")
    setSelectedCategory("mouse")
    setSelectedBrand("all")
    setPriceRange([PRICE_MIN, maxPrice])
    setSelectedConnectivity("all")
    setSelectedMouseShape("all")
    setSelectedKeyboardLayout("all")
    setSelectedKeyboardType("all")
    setSelectedSurface("all")
    setSelectedProfile("all")
    setSelectedPadType("all")
    setSelectedRefreshRate("all")
    setSelectedPanelType("all")
    setWeightRange([WEIGHT_MIN_G, WEIGHT_MAX_G])
    setSortKey("recent")
  }

  useEffect(() => {
    if (!showConnectivityFilter) setSelectedConnectivity("all")
    if (!showMouseShapeFilter) setSelectedMouseShape("all")
    if (!showKeyboardLayoutFilter) setSelectedKeyboardLayout("all")
    if (!showKeyboardTypeFilter) setSelectedKeyboardType("all")
    if (!showSurfaceFilter) setSelectedSurface("all")
    if (!showProfileFilter) setSelectedProfile("all")
    if (!showPadTypeFilter) setSelectedPadType("all")
    if (!showMonitorFilters) { setSelectedRefreshRate("all"); setSelectedPanelType("all") }
    if (!showWeightFilter) setWeightRange([WEIGHT_MIN_G, WEIGHT_MAX_G])
  }, [showConnectivityFilter, showMouseShapeFilter, showKeyboardLayoutFilter, showKeyboardTypeFilter, showSurfaceFilter, showProfileFilter, showPadTypeFilter, showMonitorFilters, showWeightFilter])

  const toggleSelection = (id: string, category: Category) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((i) => i !== id)
        if (next.length === 0) setSelectedCategory("mouse")
        return next
      }
      if (prev.length === 0) setSelectedCategory(category)
      return [...prev, id]
    })
  }

  const clearSelection = () => {
    setSelectedIds([])
    setSelectedCategory("mouse")
  }

  async function handleConfirmDelete() {
    if (!deleteDialog.id) return
    const name = deleteDialog.name
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/peripherals/${deleteDialog.id}`, { method: "DELETE" })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? (t.peripherals.delete.failed))
      setInitialData((prev) => prev.filter((p) => p.id !== deleteDialog.id))
      setSelectedIds((prev) => prev.filter((sid) => sid !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "", name: "" })
      toast.success(t.peripherals.delete.success, { description: name })
    } catch (err) {
      const message = err instanceof Error ? err.message : (t.peripherals.delete.failed)
      setDeleteError(message)
      toast.error(t.peripherals.delete.error, { description: message })
    } finally {
      setDeleting(false)
    }
  }

  usePageHeader(
    t.peripherals.title,
    t.peripherals.subtitle
  )

  const sidebarFilters = (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Category selector */}
      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.filters.category}
        </p>
        <Select
          value={selectedCategory}
          onValueChange={(v) => setSelectedCategory(v as Category)}
          disabled={selectedIds.length > 0 && lockedCategory !== null}
        >
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem
                key={cat}
                value={cat}
                disabled={selectedIds.length > 0 && lockedCategory !== null && cat !== lockedCategory}
              >
                {categoryLabels[cat]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Search */}
      <div className="border-b border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label={t.filters.searchPeripherals}
            className="h-9 border-border bg-muted/20 pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-1"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t.filters.searchNameBrand}
            value={query}
          />
        </div>
      </div>

      {/* Sort by */}
      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.filters.sortBy}
        </p>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">{t.filters.recentlyAdded}</SelectItem>
            <SelectItem value="rank">{t.filters.bestRanked}</SelectItem>
            <SelectItem value="name-asc">{t.filters.nameAZ}</SelectItem>
            <SelectItem value="name-desc">{t.filters.nameZA}</SelectItem>
            <SelectItem value="price-asc">{t.filters.priceAsc}</SelectItem>
            <SelectItem value="price-desc">{t.filters.priceDesc}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Brand */}
      <FilterSection title={t.common.brand}>
        <Select value={selectedBrand} onValueChange={setSelectedBrand}>
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
            <SelectValue placeholder={t.common.brand} />
          </SelectTrigger>
          <SelectContent>
            {availableBrands.map((brand) => (
              <SelectItem key={brand} value={brand}>
                {brand === "all" ? (t.filters.allBrands) : brand}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FilterSection>

      {/* Price */}
      <FilterSection title={t.common.price}>
        <PriceSlider value={priceRange} onChange={setPriceRange} max={maxPrice} />
      </FilterSection>

      {/* Connectivity */}
      {showConnectivityFilter && (
        <FilterSection title={t.filters.connectivity}>
          <Select value={selectedConnectivity} onValueChange={setSelectedConnectivity}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              <SelectItem value="wired">{t.filters.wired}</SelectItem>
              <SelectItem value="wireless">{t.filters.wireless}</SelectItem>
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Mouse shape */}
      {showMouseShapeFilter && availableMouseShapes.length > 0 && (
        <FilterSection title={t.filters.shape}>
          <Select value={selectedMouseShape} onValueChange={(v) => setSelectedMouseShape(v as MouseShape | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {availableMouseShapes.map((shape) => (
                <SelectItem key={shape} value={shape}>
                  {shape === "symmetrical" ? t.filters.symmetrical : t.filters.ergonomic}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Weight (mouse only) */}
      {showWeightFilter && (
        <FilterSection title={t.filters.weight}>
          <WeightSlider value={weightRange} onChange={setWeightRange} />
        </FilterSection>
      )}

      {/* Keyboard layout */}
      {showKeyboardLayoutFilter && availableKeyboardLayouts.length > 0 && (
        <FilterSection title="Layout">
          <Select value={selectedKeyboardLayout} onValueChange={(v) => setSelectedKeyboardLayout(v as KeyboardLayout | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {availableKeyboardLayouts.map((layout) => (
                <SelectItem key={layout} value={layout}>{layout.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Keyboard type */}
      {showKeyboardTypeFilter && availableKeyboardTypes.length > 0 && (
        <FilterSection title={t.common.type}>
          <Select value={selectedKeyboardType} onValueChange={(v) => setSelectedKeyboardType(v as KeyboardType | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {availableKeyboardTypes.map((kbType) => (
                <SelectItem key={kbType} value={kbType}>
                  {kbType === "mechanical" ? t.filters.mechanical : kbType === "magnetic" ? t.filters.magnetic : t.filters.optical}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Surface */}
      {showSurfaceFilter && availableSurfaces.length > 0 && (
        <FilterSection title={t.filters.surface}>
          <Select value={selectedSurface} onValueChange={(v) => setSelectedSurface(v as Surface | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {availableSurfaces.map((surface) => (
                <SelectItem key={surface} value={surface}>
                  {surface === "cloth" ? t.filters.cloth : surface === "glass" ? t.filters.glass : t.filters.hybrid}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Pad type */}
      {showPadTypeFilter && availablePadTypes.length > 0 && (
        <FilterSection title={t.filters.padType}>
          <Select value={selectedPadType} onValueChange={(v) => setSelectedPadType(v as PadType | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {availablePadTypes.map((p) => (
                <SelectItem key={p} value={p}>
                  {p === "speed" ? "Speed" : p === "control" ? "Control" : t.filters.hybrid}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Profile */}
      {showProfileFilter && availableProfiles.length > 0 && (
        <FilterSection title={t.filters.profile}>
          <Select value={selectedProfile} onValueChange={setSelectedProfile}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {availableProfiles.map((profile) => (
                <SelectItem key={profile} value={profile}>{formatLabel(profile)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Monitor: Refresh rate */}
      {showMonitorFilters && (
        <>
          <FilterSection title={t.filters.refreshRate}>
            <Select value={selectedRefreshRate} onValueChange={setSelectedRefreshRate}>
              <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.common.any}</SelectItem>
                {availableRefreshRates.map((r) => (
                  <SelectItem key={r} value={r}>{r} Hz</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection title={t.filters.panelType}>
            <Select value={selectedPanelType} onValueChange={(v) => setSelectedPanelType(v as PanelType | "all")}>
              <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t.common.any}</SelectItem>
                {availablePanelTypes.map((p) => (
                  <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>
        </>
      )}

      {/* Clear filters */}
      {activeFiltersCount > 0 && (
        <div className="p-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-9 w-full gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
            {t.filters.clearFilters(activeFiltersCount)}
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 md:px-6 lg:px-8">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 px-6 pb-8 pt-10">
          {/* Top glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary/[0.05] to-transparent" />

          {/* Header */}
          <div className="relative text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
              {t.peripherals.gamingGearDb}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {t.peripherals.findAndCompare}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {t.peripherals.gamingPeripherals}
            </p>
          </div>

          {/* Category cards */}
          <div className="relative mt-8 grid grid-cols-3 gap-2.5 sm:grid-cols-6 md:gap-3">
            {heroCategoryStats.map(({ key, label, count }) => {
              const Icon = HERO_ICONS[key] ?? LayoutGrid
              const isActive = selectedCategory === key
              const isOthers = key === "outros"

              if (isOthers) {
                return (
                  <div
                    key="outros"
                    className="flex flex-col items-center gap-2 rounded-xl border border-border/25 bg-muted/[0.06] px-2 py-5"
                  >
                    <div className="flex size-10 items-center justify-center rounded-xl bg-muted/20">
                      <Icon className="size-5 text-muted-foreground/40" />
                    </div>
                    <span className="text-xl font-black leading-none tabular-nums text-foreground/40 md:text-2xl">{count}</span>
                    <span className="text-[11px] text-muted-foreground/40 md:text-xs">{label}</span>
                  </div>
                )
              }

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (lockedCategory && (key as Category) !== lockedCategory) clearSelection()
                    setSelectedCategory(key as Category)
                  }}
                  className={cn(
                    "group relative flex flex-col items-center gap-2 rounded-xl border px-2 py-5 transition-all duration-200",
                    isActive
                      ? "border-primary/40 bg-primary/[0.07] shadow-md shadow-primary/10 ring-1 ring-primary/20"
                      : "border-border/35 bg-muted/[0.06] hover:-translate-y-0.5 hover:border-primary/25 hover:bg-muted/15 hover:shadow-lg hover:shadow-black/20"
                  )}
                >
                  {/* Active top bar */}
                  {isActive && (
                    <span className="absolute inset-x-4 top-0 h-px bg-gradient-to-r from-transparent via-primary/60 to-transparent" />
                  )}

                  <div className={cn(
                    "flex size-10 items-center justify-center rounded-xl transition-all duration-200",
                    isActive
                      ? "bg-primary/20 text-primary"
                      : "bg-muted/25 text-muted-foreground/70 group-hover:bg-primary/10 group-hover:text-primary/80"
                  )}>
                    <Icon className="size-5" />
                  </div>

                  <span className={cn(
                    "text-xl font-black leading-none tabular-nums transition-colors duration-200 md:text-2xl",
                    isActive ? "text-primary" : "text-foreground group-hover:text-foreground"
                  )}>
                    {count}
                  </span>

                  <span className={cn(
                    "text-[11px] transition-colors duration-200 md:text-xs",
                    isActive ? "text-primary/70 font-medium" : "text-muted-foreground"
                  )}>
                    {label}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

      {/* Admin actions */}
      {showAdminActions && (
        <div className="flex justify-end">
          <Link href="/admin/perifericos/new" className="shrink-0">
            <Button size="sm" className="gap-2">
              <Plus className="size-4" />
              {t.peripherals.new}
            </Button>
          </Link>
        </div>
      )}

      {/* Mobile filter toggle */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-xs text-muted-foreground">
          {t.filters.productCount(filtered.length)}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setMobileFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal className="size-3.5" />
          {t.common.filters}
          {activeFiltersCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </div>

      {/* Mobile filters panel */}
      {mobileFiltersOpen && <div className="md:hidden">{sidebarFilters}</div>}

      {/* Two-column layout */}
      <div className="flex items-start gap-8">
        {/* Left sidebar — desktop only */}
        <aside className="hidden w-[260px] shrink-0 md:block md:sticky md:top-4">
          {sidebarFilters}
        </aside>

        {/* Right content */}
        <main className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              {categoryLabels[selectedCategory]}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {categoryDescriptions[selectedCategory]}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {t.filters.productCount(filtered.length)}
              </span>
              {activeFiltersCount > 0 && (
                <span className="text-xs text-muted-foreground/60">
                  · {activeFiltersCount} {t.filters.activeFilters}
                </span>
              )}
            </div>
          </div>

          {/* Ranking list */}
          {(() => {
            const ranked = initialData
              .filter((p) => p.category === selectedCategory && typeof p.score === "number" && (p.score as number) > 0)
              .sort((a, b) => (b.score as number) - (a.score as number))
              .slice(0, 3)
            if (ranked.length === 0) return null
            return (
              <div className="mb-8">
                <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  {t.peripherals.ranking}
                </p>
                <div className="flex flex-col gap-1.5">
                  {ranked.map((item, index) => {
                    const href = `/perifericos/${buildPeripheralSlug(item.name, item.id)}`
                    return (
                      <Link
                        key={item.id}
                        href={href}
                        className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2 transition-all hover:bg-muted/40"
                      >
                        <span
                          className={cn(
                            "w-7 text-center text-lg font-black tabular-nums",
                            index === 0
                              ? "text-yellow-400"
                              : index === 1
                              ? "text-zinc-300"
                              : "text-amber-600"
                          )}
                        >
                          #{index + 1}
                        </span>
                        {item.image_url && (
                          <Image src={item.image_url} alt={item.name} width={36} height={36} className="size-9 rounded-lg object-cover" />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                          <p className="text-xs text-muted-foreground">{item.brand}</p>
                        </div>
                        {item.tier && (
                          <span className="rounded-md bg-muted/50 px-2 py-0.5 text-[11px] font-bold text-muted-foreground">
                            {item.tier}
                          </span>
                        )}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Grid */}
          {filtered.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {t.peripherals.notFound}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                {t.peripherals.adjustFilters}
              </p>
            </div>
          ) : (
            <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => {
                const isSelected = selectedIds.includes(item.id)
                const specChips = [
                  item.specs.connectivity ? formatLabel(item.specs.connectivity) : null,
                  item.specs.driver ?? null,
                  item.specs.keyboardLayout ? item.specs.keyboardLayout.toUpperCase() : null,
                  item.specs.keyboardType ? (item.specs.keyboardType === "mechanical" ? (t.filters.mechanical) : (t.filters.magnetic)) : null,
                  item.specs.surface ? formatLabel(item.specs.surface) : null,
                  item.specs.mouseShape ? formatLabel(item.specs.mouseShape) : null,
                  item.specs.refreshRate ? `${item.specs.refreshRate}Hz` : null,
                  item.specs.panelType ? String(item.specs.panelType).toUpperCase() : null,
                ].filter(Boolean) as string[]

                const cardHref = showAdminActions
                  ? `/admin/perifericos/${item.id}`
                  : `/perifericos/${buildPeripheralSlug(item.name, item.id)}`

                return (
                  <Link
                    key={item.id}
                    href={cardHref}
                    className={cn(
                      "group relative flex flex-col rounded-xl border bg-card transition-all duration-200",
                      "hover:-translate-y-0.5 hover:shadow-xl hover:shadow-black/30",
                      isSelected
                        ? "border-primary/50 ring-1 ring-primary/25 shadow-lg shadow-primary/5"
                        : "border-border hover:border-border/70"
                    )}
                  >
                    {/* Image area */}
                    <div className="relative overflow-hidden rounded-t-xl border-b border-border bg-muted/10">
                      <div className="relative flex h-36 items-center justify-center">
                        {item.image_url ? (
                          <Image
                            alt={item.name}
                            src={item.image_url}
                            fill
                            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
                            className="object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04]"
                          />
                        ) : (
                          <span className="select-none text-4xl font-bold text-muted-foreground/20">
                            {item.brand.slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-primary/8">
                          <div className="flex size-8 items-center justify-center rounded-full bg-primary shadow-lg">
                            <Check className="size-4 text-primary-foreground" />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Content */}
                    <div className="flex flex-1 flex-col gap-3 p-4">
                      <div>
                        <h3 className="truncate text-sm font-semibold leading-tight text-foreground">{item.name}</h3>
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.brand}</p>
                      </div>

                      {item.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.map((tag) => (
                            <span
                              key={tag}
                              className={cn(
                                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                                CARD_TAG_STYLES[tag].bg,
                                CARD_TAG_STYLES[tag].text,
                                CARD_TAG_STYLES[tag].border,
                              )}
                            >
                              <span className={cn("size-1.5 rounded-full", CARD_TAG_STYLES[tag].dot)} />
                              {formatTagLabel(tag, item.category)}
                            </span>
                          ))}
                        </div>
                      )}

                      {specChips.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {specChips.slice(0, 3).map((chip) => (
                            <span
                              key={chip}
                              className="rounded-md bg-muted/40 px-1.5 py-0.5 text-[10px] text-muted-foreground"
                            >
                              {chip}
                            </span>
                          ))}
                        </div>
                      )}

                      {showAdminActions ? (
                        <div className="grid grid-cols-2 gap-2">
                          <span className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/20 py-2 text-xs font-semibold text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary hover:border-primary/30">
                            <Edit className="size-3" />
                            {t.common.edit}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setDeleteDialog({ open: true, id: item.id, name: item.name })
                            }}
                            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/20 py-2 text-xs font-semibold text-muted-foreground transition-all hover:bg-red-500/10 hover:text-red-400 hover:border-red-500/30"
                          >
                            <Trash2 className="size-3" />
                            {t.common.delete}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault()
                            e.stopPropagation()
                            toggleSelection(item.id, item.category)
                          }}
                          className={cn(
                            "flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold transition-all",
                            isSelected
                              ? "border border-primary/30 bg-primary/12 text-primary"
                              : "border border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                          )}
                        >
                          {isSelected ? (
                            <><Check className="size-3" />{t.common.selected}</>
                          ) : (
                            <><ArrowLeftRight className="size-3" />{t.common.compare}</>
                          )}
                        </button>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </main>
      </div>

      {/* Floating compare bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] left-1/2 z-50 w-full max-w-[calc(100vw-1rem)] -translate-x-1/2 px-4 sm:w-auto">
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              {selectedIds.slice(0, 3).map((id) => {
                const item = initialData.find((i) => i.id === id)
                if (!item) return null
                return (
                  <div key={id} className="size-8 overflow-hidden rounded-lg border border-border bg-muted/40">
                    {item.image_url ? (
                      <Image src={item.image_url} alt={item.name} width={32} height={32} className="h-full w-full object-contain p-0.5" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-muted-foreground">
                        {item.brand.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {selectedIds.length} {t.common.selected}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                aria-label={t.common.clear}
                className="flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground md:size-8"
              >
                <X className="size-3.5" />
              </button>

              {selectedIds.length >= 2 && (
                <Link
                  href={`/perifericos/comparar?ids=${selectedIds.join(",")}`}
                  className="flex h-11 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 md:h-8"
                >
                  <ArrowLeftRight className="size-3.5" />
                  {t.common.compare}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {selectedIds.length > 0 && <div className="h-16" />}

      {/* Delete confirmation dialog */}
      {showAdminActions && (
        <Dialog
          open={deleteDialog.open}
          onOpenChange={(open) => {
            if (!open) setDeleteError(null)
            setDeleteDialog((prev) => ({ ...prev, open }))
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {t.peripherals.delete.title}
              </DialogTitle>
              <DialogDescription>
                {deleteDialog.name ? (
                  <>
                    {t.peripherals.delete.aboutToDelete}
                    <span className="font-semibold text-foreground">{deleteDialog.name}</span>.{" "}
                    {t.peripherals.delete.cannotUndo}
                  </>
                ) : (
                  t.peripherals.delete.cannotUndo
                )}
              </DialogDescription>
            </DialogHeader>
            {deleteError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">
                {deleteError}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeleteDialog({ open: false, id: "", name: "" })}
                disabled={deleting}
              >
                {t.common.cancel}
              </Button>
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
                {deleting
                  ? (t.common.deleting)
                  : (t.common.delete)}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
