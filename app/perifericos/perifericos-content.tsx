"use client"

import Link from "next/link"
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
import { useLocale } from "@/components/providers/locale-context"
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
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80"

type Peripheral = {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: Category
  tier: Tier | null
  price: number
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

const CATEGORY_DESCRIPTIONS_PT: Record<Category, string> = {
  mouse: "Navegue e compare os melhores mouses gamer para encontrar o ideal para o seu estilo de jogo. Formato, tamanho e peso impactam diretamente no conforto e precisão, enquanto métricas como sensor, DPI e polling rate determinam a acurácia em cada movimento.",
  keyboard: "Explore e compare teclados mecânicos, magnéticos e ópticos. O tipo de switch, layout e conectividade influenciam diretamente na experiência de digitação e performance em jogos competitivos.",
  mousepad: "Compare mousepads de diferentes superfícies e tamanhos. A escolha da superfície, perfil e dimensões do pad afetam diretamente a velocidade, controle e precisão do seu mouse durante o jogo.",
  glasspad: "Explore glasspads superfícies de vidro de alto desempenho que oferecem deslizamento extremamente suave e durabilidade superior comparado aos mousepads convencionais.",
  headset: "Encontre o headset ideal para gaming e comunicação. Conectividade, qualidade de áudio e conforto são essenciais para longas sessões de jogo com máxima imersão sonora.",
  iem: "Compare IEMs (In-Ear Monitors) para jogos e áudio de alta qualidade. Drivers, resposta de frequência e isolamento passivo de ruído são fatores cruciais para uma experiência sonora precisa e imersiva.",
  dac_amp: "DACs e amplificadores para elevar a qualidade de áudio do seu setup. Essenciais para extrair o máximo de headsets e IEMs de alta impedância, garantindo fidelidade sonora excepcional.",
  feet: "Mouse feet determinam o deslizamento do seu mouse. Material, espessura e formato impactam na velocidade, controle e vida útil, alterando completamente a sensação do periférico.",
  chairs: "Cadeiras gamer e ergonômicas para longas sessões. Suporte lombar, ajuste de altura e material determinam o conforto e a saúde postural durante o jogo.",
  monitors: "Monitores para gaming com foco em taxa de atualização, tempo de resposta e tipo de painel. Encontre o monitor ideal para vantagem competitiva ou experiência visual premium em cada jogo.",
  switches: "Switches mecânicos, magnéticos e ópticos para teclados personalizados. Peso de atuação, sensação tátil e durabilidade influenciam na performance e preferência pessoal de cada jogador.",
}

const CATEGORY_DESCRIPTIONS_EN: Record<Category, string> = {
  mouse: "Browse and compare the best gaming mice to find the ideal match for your play style. Shape, size, and weight directly impact comfort and precision, while performance metrics such as sensor, DPI and polling rate determine accuracy.",
  keyboard: "Explore and compare mechanical, magnetic and optical keyboards. Switch type, layout and connectivity directly influence your typing experience and performance in competitive gaming.",
  mousepad: "Compare mousepads with different surfaces and sizes. The choice of surface, profile and dimensions directly affect the speed, control and precision of your mouse during play.",
  glasspad: "Explore glasspads — high-performance glass surfaces that offer extremely smooth glide and superior durability compared to conventional mousepads.",
  headset: "Find the ideal headset for gaming and communication. Connectivity, audio quality and comfort are essential for long gaming sessions with maximum immersion.",
  iem: "Compare IEMs (In-Ear Monitors) for gaming and high-quality audio. Drivers, frequency response and passive noise isolation are crucial factors for a precise and immersive sound experience.",
  dac_amp: "DACs and amplifiers to elevate the audio quality of your setup. Essential for getting the most out of high-impedance headsets and IEMs, ensuring exceptional sound fidelity.",
  feet: "Mouse feet determine how your mouse glides. Material, thickness and shape directly impact speed, control and pad lifespan, completely changing the feel of your peripheral.",
  chairs: "Gaming and ergonomic chairs for long sessions. Lumbar support, height adjustment and material determine comfort and postural health during gaming.",
  monitors: "Gaming monitors focused on refresh rate, response time and panel type. Find the ideal monitor for competitive advantage or premium visual experience in every game.",
  switches: "Mechanical, magnetic and optical switches for custom keyboards. Actuation force, tactile feel and durability influence performance and each player's personal preference.",
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
}

function formatTagLabel(tag: Tag, category?: string) {
  if (category === "keyboard" && tag === "light") return "Leve"
  if (category === "keyboard" && tag === "heavy") return "Pesado"
  return TAG_LABELS[tag] ?? formatLabel(tag)
}

function PriceSlider({ value, onChange, isEnglish, max }: { value: [number, number]; onChange: (v: [number, number]) => void; isEnglish: boolean; max: number }) {
  const [minVal, maxVal] = value
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{isEnglish ? "BRL" : "Reais"}</span>
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
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"

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

  const categoryLabels = isEnglish ? CATEGORY_LABELS_EN : CATEGORY_LABELS_PT
  const categoryDescriptions = isEnglish ? CATEGORY_DESCRIPTIONS_EN : CATEGORY_DESCRIPTIONS_PT

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
      { key: "outros" as Category | "outros", label: isEnglish ? "Others" : "Outros", count: othersCount },
    ]
  }, [initialData, categoryLabels, isEnglish])

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
      if (!res.ok) throw new Error(data?.error ?? (isEnglish ? "Failed to delete" : "Erro ao deletar"))
      setInitialData((prev) => prev.filter((p) => p.id !== deleteDialog.id))
      setSelectedIds((prev) => prev.filter((sid) => sid !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "", name: "" })
      toast.success(isEnglish ? "Peripheral deleted" : "Periférico deletado", { description: name })
    } catch (err) {
      const message = err instanceof Error ? err.message : (isEnglish ? "Failed to delete" : "Erro ao deletar")
      setDeleteError(message)
      toast.error(isEnglish ? "Failed to delete peripheral" : "Erro ao deletar periférico", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  usePageHeader(
    isEnglish ? "Peripherals" : "Periféricos",
    isEnglish
      ? "A searchable wiki with filters by category, brand and price."
      : "Wiki pesquisável com filtros por categoria, marca e preço."
  )

  const sidebarFilters = (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Category selector */}
      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isEnglish ? "Category" : "Categoria"}
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
            aria-label={isEnglish ? "Search peripherals" : "Buscar periféricos"}
            className="h-9 border-border bg-muted/20 pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-1"
            onChange={(e) => setQuery(e.target.value)}
            placeholder={isEnglish ? "Name, brand, sensor…" : "Nome, marca, sensor…"}
            value={query}
          />
        </div>
      </div>

      {/* Sort by */}
      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {isEnglish ? "Sort by" : "Ordenar por"}
        </p>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">{isEnglish ? "Recently added" : "Recentes"}</SelectItem>
            <SelectItem value="rank">{isEnglish ? "Best ranked" : "Melhor rankeado"}</SelectItem>
            <SelectItem value="name-asc">{isEnglish ? "Name A→Z" : "Nome A→Z"}</SelectItem>
            <SelectItem value="name-desc">{isEnglish ? "Name Z→A" : "Nome Z→A"}</SelectItem>
            <SelectItem value="price-asc">{isEnglish ? "Price ↑" : "Preço ↑"}</SelectItem>
            <SelectItem value="price-desc">{isEnglish ? "Price ↓" : "Preço ↓"}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Brand */}
      <FilterSection title={isEnglish ? "Brand" : "Marca"}>
        <Select value={selectedBrand} onValueChange={setSelectedBrand}>
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
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
      </FilterSection>

      {/* Price */}
      <FilterSection title={isEnglish ? "Price" : "Preço"}>
        <PriceSlider value={priceRange} onChange={setPriceRange} isEnglish={isEnglish} max={maxPrice} />
      </FilterSection>

      {/* Connectivity */}
      {showConnectivityFilter && (
        <FilterSection title={isEnglish ? "Connectivity" : "Conexão"}>
          <Select value={selectedConnectivity} onValueChange={setSelectedConnectivity}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
              <SelectItem value="wired">{isEnglish ? "Wired" : "Com fio"}</SelectItem>
              <SelectItem value="wireless">{isEnglish ? "Wireless" : "Sem fio"}</SelectItem>
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Mouse shape */}
      {showMouseShapeFilter && availableMouseShapes.length > 0 && (
        <FilterSection title={isEnglish ? "Shape" : "Formato"}>
          <Select value={selectedMouseShape} onValueChange={(v) => setSelectedMouseShape(v as MouseShape | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
              {availableMouseShapes.map((shape) => (
                <SelectItem key={shape} value={shape}>
                  {isEnglish ? formatLabel(shape) : (shape === "symmetrical" ? "Simétrico" : "Ergonômico")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Weight (mouse only) */}
      {showWeightFilter && (
        <FilterSection title={isEnglish ? "Weight" : "Peso"}>
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
              <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
              {availableKeyboardLayouts.map((layout) => (
                <SelectItem key={layout} value={layout}>{layout.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Keyboard type */}
      {showKeyboardTypeFilter && availableKeyboardTypes.length > 0 && (
        <FilterSection title={isEnglish ? "Type" : "Tipo"}>
          <Select value={selectedKeyboardType} onValueChange={(v) => setSelectedKeyboardType(v as KeyboardType | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
              {availableKeyboardTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {isEnglish ? formatLabel(t) : (t === "mechanical" ? "Mecânico" : t === "magnetic" ? "Magnético" : "Óptico")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Surface */}
      {showSurfaceFilter && availableSurfaces.length > 0 && (
        <FilterSection title={isEnglish ? "Surface" : "Superfície"}>
          <Select value={selectedSurface} onValueChange={(v) => setSelectedSurface(v as Surface | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
              {availableSurfaces.map((surface) => (
                <SelectItem key={surface} value={surface}>
                  {isEnglish ? formatLabel(surface) : (surface === "cloth" ? "Tecido" : surface === "glass" ? "Vidro" : "Híbrido")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Pad type */}
      {showPadTypeFilter && availablePadTypes.length > 0 && (
        <FilterSection title={isEnglish ? "Pad Type" : "Tipo de Pad"}>
          <Select value={selectedPadType} onValueChange={(v) => setSelectedPadType(v as PadType | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
              {availablePadTypes.map((p) => (
                <SelectItem key={p} value={p}>
                  {isEnglish ? formatLabel(p) : (p === "speed" ? "Speed" : p === "control" ? "Control" : "Híbrido")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Profile */}
      {showProfileFilter && availableProfiles.length > 0 && (
        <FilterSection title={isEnglish ? "Profile" : "Perfil"}>
          <Select value={selectedProfile} onValueChange={setSelectedProfile}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
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
          <FilterSection title={isEnglish ? "Refresh Rate" : "Taxa de Atualização"}>
            <Select value={selectedRefreshRate} onValueChange={setSelectedRefreshRate}>
              <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
                {availableRefreshRates.map((r) => (
                  <SelectItem key={r} value={r}>{r} Hz</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>

          <FilterSection title={isEnglish ? "Panel Type" : "Tipo de Painel"}>
            <Select value={selectedPanelType} onValueChange={(v) => setSelectedPanelType(v as PanelType | "all")}>
              <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{isEnglish ? "Any" : "Qualquer"}</SelectItem>
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
            {isEnglish ? `Clear filters (${activeFiltersCount})` : `Limpar filtros (${activeFiltersCount})`}
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-4 py-8 md:px-6 lg:px-8">
      {/* Public hero banner */}
      {!showAdminActions && (
        <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 px-6 pb-8 pt-10">
          {/* Top glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary/[0.05] to-transparent" />

          {/* Header */}
          <div className="relative text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
              {isEnglish ? "Gaming Gear Database" : "Banco de Periféricos"}
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground md:text-4xl">
              {isEnglish ? "Find and Compare" : "Descubra e Compare"}
            </h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {isEnglish ? "Gaming Peripherals" : "Periféricos Gamer"}
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
      )}

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

      {/* Mobile filter toggle */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-xs text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? (isEnglish ? "product" : "produto") : (isEnglish ? "products" : "produtos")}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setMobileFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal className="size-3.5" />
          {isEnglish ? "Filters" : "Filtros"}
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
                {filtered.length} {filtered.length === 1 ? (isEnglish ? "product" : "produto") : (isEnglish ? "products" : "produtos")}
              </span>
              {activeFiltersCount > 0 && (
                <span className="text-xs text-muted-foreground/60">
                  · {activeFiltersCount} {isEnglish ? "filter(s) active" : "filtro(s) ativo(s)"}
                </span>
              )}
            </div>
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
            <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map((item) => {
                const isSelected = selectedIds.includes(item.id)
                const specChips = [
                  item.specs.connectivity ? formatLabel(item.specs.connectivity) : null,
                  item.specs.driver ?? null,
                  item.specs.keyboardLayout ? item.specs.keyboardLayout.toUpperCase() : null,
                  item.specs.keyboardType ? (item.specs.keyboardType === "mechanical" ? (isEnglish ? "Mechanical" : "Mecânico") : (isEnglish ? "Magnetic" : "Magnético")) : null,
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
        </main>
      </div>

      {/* Floating compare bar */}
      {selectedIds.length > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4">
          <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md">
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

            <span className="whitespace-nowrap text-xs text-muted-foreground">
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
              <Button variant="destructive" onClick={handleConfirmDelete} disabled={deleting}>
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
