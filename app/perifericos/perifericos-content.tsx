"use client"

import Link from "next/link"
import { ArrowLeftRight, Check, Edit, Plus, Search, Trash2, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLocale } from "@/lib/locale-context"
import { usePageHeader } from "@/lib/page-header-context"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { cn } from "@/lib/utils"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type PriceBand = "all" | "budget" | "mid" | "premium"
type SortKey = "recent" | "name-asc" | "name-desc" | "price-asc" | "price-desc"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type MouseShape = "symmetrical" | "ergonomic"
type KeyboardLayout = "60%" | "75%" | "tkl" | "full-size"
type KeyboardType = "mechanical" | "magnetic" | "optical"
type PadType = "speed" | "control" | "hybrid"
type Surface = PadType | "glass" | "cloth"
type PanelType = "ips" | "tn" | "va" | "oled" | "other"

type Peripheral = {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: Category
  tier: Tier | null
  price: number
  tags: Array<"competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode">
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
  }
}

interface PerifericosContentProps {
  initialData: Peripheral[]
  showAdminActions?: boolean
}

const TIER_CLASS: Record<Tier, string> = {
  GOAT: "tier-badge-t0",
  SS:   "tier-badge-t05",
  S:    "tier-badge-t1",
  A:    "tier-badge-t2",
  B:    "bg-muted/60 border border-border",
  C:    "bg-muted/40 border border-border",
  L:    "bg-muted/30 border border-border",
}

const CATEGORY_LABELS_PT: Record<Category, string> = {
  keyboard: "Teclados", mouse: "Mouses",
  mousepad: "Mousepads", glasspad: "Glasspads", iem: "IEMs", headset: "Headsets",
  feet: "Feet", chairs: "Cadeiras", monitors: "Monitores", switches: "Switches", dac_amp: "DAC/AMP",
}

const CATEGORY_LABELS_EN: Record<Category, string> = {
  keyboard: "Keyboards", mouse: "Mice",
  mousepad: "Mousepads", glasspad: "Glasspads", iem: "IEMs", headset: "Headsets",
  feet: "Mouse Feet", chairs: "Chairs", monitors: "Monitors", switches: "Switches", dac_amp: "DAC/AMP",
}

const CATEGORIES: Category[] = ["mouse", "keyboard", "mousepad", "headset", "monitors", "iem", "dac_amp", "glasspad", "switches", "feet", "chairs"]

function formatLabel(value: string) {
  return value.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
}

function getPriceBand(price: number): Exclude<PriceBand, "all"> {
  if (price <= 80) return "budget"
  if (price <= 160) return "mid"
  return "premium"
}

function TierBadge({ tier }: { tier: Tier }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-white/90 shadow-sm",
        TIER_CLASS[tier]
      )}
    >
      {tier}
    </span>
  )
}

export function PerifericosContent({ initialData: initialDataProp, showAdminActions }: PerifericosContentProps) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"

  const [initialData, setInitialData] = useState<Peripheral[]>(initialDataProp)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" })
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  useEffect(() => {
    setInitialData(initialDataProp)
  }, [initialDataProp])

  const [query, setQuery] = useState("")
  const [selectedCategory, setSelectedCategory] = useState<Category>("mouse")
  const [selectedBrand, setSelectedBrand] = useState("all")
  const [selectedPriceBand, setSelectedPriceBand] = useState<PriceBand>("all")
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

  const categoryLabels = isEnglish ? CATEGORY_LABELS_EN : CATEGORY_LABELS_PT

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
  const showKeyboardLayoutFilter = effectiveCategory === "keyboard"
  const showSurfaceFilter = effectiveCategory === "mousepad" || effectiveCategory === "glasspad"
  const showProfileFilter = effectiveCategory === "mousepad" || effectiveCategory === "glasspad"

  const availableBrands = useMemo(() => {
    const base = effectiveCategory ? initialData.filter((i) => i.category === effectiveCategory) : initialData
    return ["all", ...Array.from(new Set(base.map((i) => i.brand)))]
  }, [initialData, effectiveCategory])

  const availableMouseShapes = useMemo(() => {
    if (!showMouseShapeFilter) return [] as MouseShape[]
    const values = new Set<MouseShape>()
    initialData
      .filter((item) => item.category === "mouse")
      .forEach((item) => {
        if (item.specs.mouseShape) values.add(item.specs.mouseShape)
      })
    return Array.from(values)
  }, [initialData, showMouseShapeFilter])

  const availableKeyboardLayouts = useMemo(() => {
    if (!showKeyboardLayoutFilter) return [] as KeyboardLayout[]
    const values = new Set<KeyboardLayout>()
    initialData
      .filter((item) => item.category === "keyboard")
      .forEach((item) => {
        if (item.specs.keyboardLayout) values.add(item.specs.keyboardLayout as KeyboardLayout)
      })
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
      .forEach((item) => {
        if (item.specs.keyboardType) values.add(item.specs.keyboardType)
      })
    return Array.from(values)
  }, [initialData, showKeyboardTypeFilter])

  const availablePadTypes = useMemo(() => {
    if (!showPadTypeFilter) return [] as PadType[]
    const values = new Set<PadType>()
    initialData
      .filter((item) => item.category === "mousepad")
      .forEach((item) => {
        if (item.specs.padType) values.add(item.specs.padType)
      })
    return Array.from(values)
  }, [initialData, showPadTypeFilter])

  const availableRefreshRates = useMemo(() => {
    if (!showMonitorFilters) return [] as string[]
    const rates = new Set<number>()
    initialData
      .filter((item) => item.category === "monitors")
      .forEach((item) => {
        if (typeof item.specs.refreshRate === "number") rates.add(item.specs.refreshRate)
      })
    const common = [144, 165, 240, 360, 480, 600]
    const found = Array.from(rates).sort((a, b) => a - b)
    const merged = Array.from(new Set([...found, ...common]))
    return merged.map(String)
  }, [initialData, showMonitorFilters])

  const availablePanelTypes = useMemo(() => {
    if (!showMonitorFilters) return [] as PanelType[]
    const values = new Set<PanelType>()
    initialData
      .filter((item) => item.category === "monitors")
      .forEach((item) => {
        if (item.specs.panelType) values.add(item.specs.panelType)
      })
    return Array.from(values)
  }, [initialData, showMonitorFilters])

  const availableSurfaces = useMemo(() => {
    if (!showSurfaceFilter || !effectiveCategory) return [] as Surface[]
    const values = new Set<Surface>()
    initialData
      .filter((item) => item.category === effectiveCategory)
      .forEach((item) => {
        if (item.specs.surface) values.add(item.specs.surface)
      })
    return Array.from(values)
  }, [initialData, effectiveCategory, showSurfaceFilter])

  const availableProfiles = useMemo(() => {
    if (!showProfileFilter || !effectiveCategory) return [] as string[]
    const values = new Set<string>()
    initialData
      .filter((item) => item.category === effectiveCategory)
      .forEach((item) => {
        if (item.specs.profile) values.add(String(item.specs.profile))
      })
    return Array.from(values)
  }, [initialData, effectiveCategory, showProfileFilter])

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
        (selectedPriceBand === "all" || getPriceBand(item.price) === selectedPriceBand) &&
        (!showConnectivityFilter || selectedConnectivity === "all" || item.specs.connectivity === selectedConnectivity) &&
        (!showMouseShapeFilter || selectedMouseShape === "all" || item.specs.mouseShape === selectedMouseShape) &&
        (!showKeyboardLayoutFilter || selectedKeyboardLayout === "all" || item.specs.keyboardLayout === selectedKeyboardLayout) &&
        (!showKeyboardTypeFilter || selectedKeyboardType === "all" || item.specs.keyboardType === selectedKeyboardType) &&
        (!showSurfaceFilter || selectedSurface === "all" || item.specs.surface === selectedSurface) &&
        (!showPadTypeFilter || selectedPadType === "all" || item.specs.padType === selectedPadType) &&
        (!showProfileFilter || selectedProfile === "all" || item.specs.profile === selectedProfile) &&
        (!showMonitorFilters || selectedRefreshRate === "all" || Number(item.specs.refreshRate) === Number(selectedRefreshRate)) &&
        (!showMonitorFilters || selectedPanelType === "all" || item.specs.panelType === selectedPanelType)
      )
    })

    const sorted = [...results]
    switch (sortKey) {
      case "name-asc":   sorted.sort((a, b) => a.name.localeCompare(b.name)); break
      case "name-desc":  sorted.sort((a, b) => b.name.localeCompare(a.name)); break
      case "price-asc":  sorted.sort((a, b) => a.price - b.price || a.name.localeCompare(b.name)); break
      case "price-desc": sorted.sort((a, b) => b.price - a.price || a.name.localeCompare(b.name)); break
    }
    return sorted
  }, [
    initialData,
    query,
    selectedCategory,
    selectedBrand,
    selectedPriceBand,
    selectedConnectivity,
    selectedMouseShape,
    selectedKeyboardLayout,
    selectedKeyboardType,
    selectedSurface,
    selectedProfile,
    selectedPadType,
    selectedRefreshRate,
    selectedPanelType,
    sortKey,
    lockedCategory,
    showConnectivityFilter,
    showMouseShapeFilter,
    showKeyboardLayoutFilter,
    showKeyboardTypeFilter,
    showSurfaceFilter,
    showProfileFilter,
    showPadTypeFilter,
    showMonitorFilters,
  ])

  const activeFiltersCount = useMemo(() =>
    [selectedBrand, selectedPriceBand, selectedConnectivity, selectedMouseShape, selectedKeyboardLayout, selectedKeyboardType, selectedPadType, selectedSurface, selectedProfile, selectedRefreshRate, selectedPanelType]
      .filter((v) => v !== "all").length +
    (query.trim() ? 1 : 0),
    [
      query,
      selectedBrand,
      selectedCategory,
      selectedConnectivity,
      selectedPriceBand,
      selectedMouseShape,
      selectedKeyboardLayout,
      selectedKeyboardType,
      selectedPadType,
      selectedSurface,
      selectedProfile,
      selectedRefreshRate,
      selectedPanelType,
    ]
  )

  const resetFilters = () => {
    setQuery("")
    setSelectedCategory("mouse")
    setSelectedBrand("all")
    setSelectedPriceBand("all")
    setSelectedConnectivity("all")
    setSelectedMouseShape("all")
    setSelectedKeyboardLayout("all")
    setSelectedKeyboardType("all")
    setSelectedSurface("all")
    setSelectedProfile("all")
    setSelectedPadType("all")
    setSelectedRefreshRate("all")
    setSelectedPanelType("all")
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
    if (!showMonitorFilters) {
      setSelectedRefreshRate("all")
      setSelectedPanelType("all")
    }
  }, [
    showConnectivityFilter,
    showMouseShapeFilter,
    showKeyboardLayoutFilter,
    showKeyboardTypeFilter,
    showSurfaceFilter,
    showProfileFilter,
    showPadTypeFilter,
    showMonitorFilters,
  ])

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
      if (!res.ok) throw new Error(data?.error ?? (isEnglish ? "Failed to delete" : "Erro ao deletar"))
      setInitialData((prev) => prev.filter((p) => p.id !== deleteDialog.id))
      setSelectedIds((prev) => prev.filter((sid) => sid !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "", name: "" })
      toast.success(isEnglish ? "Peripheral deleted" : "Periférico deletado", {
        description: name,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : (isEnglish ? "Failed to delete" : "Erro ao deletar")
      setDeleteError(message)
      toast.error(isEnglish ? "Failed to delete peripheral" : "Erro ao deletar periférico", {
        description: message,
      })
    } finally {
      setDeleting(false)
    }
  }

  const formatCurrency = (value: number) => {
    const currency = isEnglish ? "USD" : "BRL"
    try {
      return new Intl.NumberFormat(locale, { style: "currency", currency }).format(value)
    } catch {
      return `${isEnglish ? "$" : "R$"}${value}`
    }
  }

  usePageHeader(
    isEnglish ? "Peripherals" : "Periféricos",
    isEnglish
      ? "A searchable wiki with filters by category, brand and price."
      : "Wiki pesquisável com filtros por categoria, marca e preço."
  )

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 md:px-6 lg:px-8">
      {/* Admin actions */}
      {showAdminActions && (
        <div className="flex justify-end">
          <Link href="/admin/perifericos/new" className="shrink-0">
            <Button size="sm" className="gap-2">
              <Plus className="size-4" />
              {isEnglish ? "New" : "Novo"}
            </Button>
          </Link>
        </div>
      )}

      {/* Category chips */}
      <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {CATEGORIES.map((cat) => {
          const isDisabled = selectedIds.length > 0 && lockedCategory !== null && cat !== lockedCategory
          return (
            <button
              key={cat}
              type="button"
              disabled={isDisabled}
              onClick={() => setSelectedCategory(cat)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                selectedCategory === cat
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border bg-muted/20 text-muted-foreground hover:border-border/80 hover:bg-muted/40 hover:text-foreground",
                isDisabled && "pointer-events-none opacity-30"
              )}
            >
              {categoryLabels[cat]}
            </button>
          )
        })}
      </div>

      {/* Search + secondary filters */}
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              aria-label={isEnglish ? "Search peripherals" : "Buscar periféricos"}
              className="h-9 border-border bg-muted/20 pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-1"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isEnglish ? "Name, brand, sensor…" : "Nome, marca, sensor…"}
              value={query}
            />
          </div>

          <Select value={selectedBrand} onValueChange={setSelectedBrand}>
            <SelectTrigger className="h-9 w-auto min-w-[110px] border-border bg-muted/20 text-sm">
              <SelectValue placeholder={isEnglish ? "Brand" : "Marca"} />
            </SelectTrigger>
            <SelectContent>
              {availableBrands.map((brand) => (
                <SelectItem key={brand} value={brand}>
                  {brand === "all" ? (isEnglish ? "All brands" : "Todas") : brand}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedPriceBand} onValueChange={(v) => setSelectedPriceBand(v as PriceBand)}>
            <SelectTrigger className="h-9 w-auto min-w-[90px] border-border bg-muted/20 text-sm">
              <SelectValue placeholder={isEnglish ? "Price" : "Preço"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEnglish ? "All prices" : "Todos"}</SelectItem>
              <SelectItem value="budget">{isEnglish ? "Budget (≤$80)" : "Budget (≤R$80)"}</SelectItem>
              <SelectItem value="mid">{isEnglish ? "Mid ($81–$160)" : "Mid (R$81–R$160)"}</SelectItem>
              <SelectItem value="premium">{isEnglish ? "Premium ($160+)" : "Premium (R$160+)"}</SelectItem>
            </SelectContent>
          </Select>

          {showConnectivityFilter && (
            <Select value={selectedConnectivity} onValueChange={setSelectedConnectivity}>
              <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                <SelectValue placeholder={isEnglish ? "Connectivity" : "Conexão"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                <SelectItem value="wired">{isEnglish ? "Wired" : "Com fio"}</SelectItem>
                <SelectItem value="wireless">{isEnglish ? "Wireless" : "Sem fio"}</SelectItem>
              </SelectContent>
            </Select>
          )}

          {showMouseShapeFilter && availableMouseShapes.length > 0 && (
            <Select value={selectedMouseShape} onValueChange={(v) => setSelectedMouseShape(v as MouseShape | "all")}>
              <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                <SelectValue placeholder={isEnglish ? "Shape" : "Shape"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                {availableMouseShapes.map((shape) => (
                  <SelectItem key={shape} value={shape}>
                    {isEnglish ? formatLabel(shape) : (shape === "symmetrical" ? "Simetrico" : "Ergonomico")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showKeyboardLayoutFilter && availableKeyboardLayouts.length > 0 && (
            <Select value={selectedKeyboardLayout} onValueChange={(v) => setSelectedKeyboardLayout(v as KeyboardLayout | "all")}>
              <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                <SelectValue placeholder={isEnglish ? "Layout" : "Layout"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                {availableKeyboardLayouts.map((layout) => (
                  <SelectItem key={layout} value={layout}>
                    {layout.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showKeyboardTypeFilter && availableKeyboardTypes.length > 0 && (
            <Select value={selectedKeyboardType} onValueChange={(v) => setSelectedKeyboardType(v as KeyboardType | "all")}>
              <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                <SelectValue placeholder={isEnglish ? "Type" : "Tipo"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                {availableKeyboardTypes.map((t) => (
                  <SelectItem key={t} value={t}>{isEnglish ? formatLabel(t) : (t === 'mechanical' ? 'Mecânico' : t === 'magnetic' ? 'Magnético' : 'Óptico')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showSurfaceFilter && availableSurfaces.length > 0 && (
            <Select value={selectedSurface} onValueChange={(v) => setSelectedSurface(v as Surface | "all")}>
              <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                <SelectValue placeholder={isEnglish ? "Surface" : "Superficie"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                {availableSurfaces.map((surface) => (
                  <SelectItem key={surface} value={surface}>
                    {isEnglish ? formatLabel(surface) : (surface === "cloth" ? "Tecido" : surface === "glass" ? "Vidro" : "Hibrido")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showPadTypeFilter && availablePadTypes.length > 0 && (
            <Select value={selectedPadType} onValueChange={(v) => setSelectedPadType(v as PadType | "all")}>
              <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                <SelectValue placeholder={isEnglish ? "Pad" : "Pad"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                {availablePadTypes.map((p) => (
                  <SelectItem key={p} value={p}>{isEnglish ? formatLabel(p) : (p === 'speed' ? 'Speed' : p === 'control' ? 'Control' : 'Híbrido')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showProfileFilter && availableProfiles.length > 0 && (
            <Select value={selectedProfile} onValueChange={setSelectedProfile}>
              <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                <SelectValue placeholder={isEnglish ? "Profile" : "Perfil"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                {availableProfiles.map((profile) => (
                  <SelectItem key={profile} value={profile}>
                    {formatLabel(profile)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {showMonitorFilters && (
            <>
              <Select value={selectedRefreshRate} onValueChange={setSelectedRefreshRate}>
                <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                  <SelectValue placeholder={isEnglish ? "Hz" : "Hz"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                  {availableRefreshRates.map((r) => (
                    <SelectItem key={r} value={r}>{r} Hz</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={selectedPanelType} onValueChange={(v) => setSelectedPanelType(v as PanelType | "all")}>
                <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
                  <SelectValue placeholder={isEnglish ? "Panel" : "Painel"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                  {availablePanelTypes.map((p) => (
                    <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
            <SelectTrigger className="h-9 w-auto min-w-[100px] border-border bg-muted/20 text-sm">
              <SelectValue placeholder={isEnglish ? "Sort" : "Ordenar"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="recent">{isEnglish ? "Recent" : "Recentes"}</SelectItem>
              <SelectItem value="name-asc">{isEnglish ? "Name A→Z" : "Nome A→Z"}</SelectItem>
              <SelectItem value="name-desc">{isEnglish ? "Name Z→A" : "Nome Z→A"}</SelectItem>
              <SelectItem value="price-asc">{isEnglish ? "Price ↑" : "Preço ↑"}</SelectItem>
              <SelectItem value="price-desc">{isEnglish ? "Price ↓" : "Preço ↓"}</SelectItem>
            </SelectContent>
          </Select>

          {activeFiltersCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={resetFilters}
              className="h-9 gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
              {isEnglish ? "Clear" : "Limpar"}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? (isEnglish ? "item" : "item") : (isEnglish ? "items" : "itens")}
          {activeFiltersCount > 0 && (
            <span className="ml-1 text-muted-foreground/60">
              · {activeFiltersCount} {isEnglish ? "filter(s) active" : "filtro(s) ativo(s)"}
            </span>
          )}
        </p>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            {isEnglish ? "No peripherals found." : "Nenhum periférico encontrado."}
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            {isEnglish ? "Try adjusting your filters." : "Tente ajustar os filtros."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((item) => {
            const isSelected = selectedIds.includes(item.id)
            const specChips = [
              item.specs.connectivity ? formatLabel(item.specs.connectivity) : null,
              item.specs.driver ?? null,
              item.specs.keyboardLayout ? item.specs.keyboardLayout.toUpperCase() : null,
              item.specs.keyboardType ? (item.specs.keyboardType === 'mechanical' ? (isEnglish ? 'Mechanical' : 'Mecânico') : (isEnglish ? 'Magnetic' : 'Magnético')) : null,
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
                {/* Tier badge */}
                {item.tier && (
                  <div className="absolute right-3 top-3 z-10">
                    <TierBadge tier={item.tier} />
                  </div>
                )}

                {/* Image area */}
                <div className="relative overflow-hidden rounded-t-xl border-b border-border bg-muted/10">
                  <div className="flex h-36 items-center justify-center">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        alt={item.name}
                        src={item.image_url}
                        className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-[1.04]"
                      />
                    ) : (
                      <span className="select-none text-4xl font-bold text-muted-foreground/20">
                        {item.brand.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Selected overlay */}
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

                  <div className="mt-auto flex items-center justify-between border-t border-border/40 pt-3">
                    <span className="text-base font-bold text-foreground">{formatCurrency(item.price)}</span>
                    <Badge variant="secondary" className="bg-muted/30 text-[10px] text-muted-foreground">
                      {categoryLabels[item.category]}
                    </Badge>
                  </div>

                  {showAdminActions ? (
                    /* Admin actions: Edit + Delete */
                    <div className="grid grid-cols-2 gap-2">
                      <span
                        className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/20 py-2 text-xs font-semibold text-muted-foreground transition-all hover:bg-primary/10 hover:text-primary hover:border-primary/30"
                      >
                        <Edit className="size-3" />
                        {isEnglish ? "Edit" : "Editar"}
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
                        {isEnglish ? "Delete" : "Deletar"}
                      </button>
                    </div>
                  ) : (
                    /* Compare button */
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
                        <><Check className="size-3" />{isEnglish ? "Selected" : "Selecionado"}</>
                      ) : (
                        <><ArrowLeftRight className="size-3" />{isEnglish ? "Compare" : "Comparar"}</>
                      )}
                    </button>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}

      {/* Floating compare bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md">
            {/* Thumbnails */}
            <div className="flex items-center gap-1.5">
              {selectedIds.slice(0, 3).map((id) => {
                const item = initialData.find((i) => i.id === id)
                if (!item) return null
                return (
                  <div key={id} className="size-8 overflow-hidden rounded-lg border border-border bg-muted/40">
                    {item.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={item.image_url} alt={item.name} className="h-full w-full object-contain p-0.5" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-muted-foreground">
                        {item.brand.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            <span className="text-xs text-muted-foreground whitespace-nowrap">
              {selectedIds.length} {isEnglish ? "selected" : "selecionados"}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearSelection}
                className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>

              {selectedIds.length >= 2 && (
                <Link
                  href={`/perifericos/comparar?ids=${selectedIds.join(",")}`}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90"
                >
                  <ArrowLeftRight className="size-3.5" />
                  {isEnglish ? "Compare" : "Comparar"}
                </Link>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Bottom padding for floating bar */}
      {selectedIds.length > 0 && <div className="h-16" />}

      {/* Delete confirmation dialog (admin only) */}
      {showAdminActions && (
        <Dialog
          open={deleteDialog.open}
          onOpenChange={(open) => {
            if (!open) setDeleteError(null)
            setDeleteDialog((prev) => ({ ...prev, open }))
          }}
        >
          <DialogContent className="border border-white/[0.12] bg-[#0a0e17]/95">
            <DialogHeader>
              <DialogTitle>
                {isEnglish ? "Delete Peripheral?" : "Deletar Periférico?"}
              </DialogTitle>
              <DialogDescription>
                {deleteDialog.name ? (
                  <>
                    {isEnglish ? "You are about to delete " : "Você está prestes a deletar "}
                    <span className="font-semibold text-foreground">{deleteDialog.name}</span>.{" "}
                    {isEnglish ? "This action cannot be undone." : "Esta ação não pode ser desfeita."}
                  </>
                ) : (
                  isEnglish ? "This action cannot be undone." : "Esta ação não pode ser desfeita."
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
                {isEnglish ? "Cancel" : "Cancelar"}
              </Button>
              <Button
                variant="destructive"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting
                  ? (isEnglish ? "Deleting..." : "Deletando...")
                  : (isEnglish ? "Delete" : "Deletar")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
