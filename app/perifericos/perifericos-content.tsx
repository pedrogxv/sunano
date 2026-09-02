"use client"

import Link from "next/link"
import Image from "next/image"
import { useRouter, useSearchParams, usePathname } from "next/navigation"
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  CircuitBoard,
  Cpu,
  Edit,
  Footprints,
  Gem,
  Headphones,
  Keyboard,
  Layers,
  LayoutGrid,
  Loader2,
  Monitor,
  Mouse,
  Plus,
  Search,
  SlidersHorizontal,
  Sofa,
  SquareDashedBottom,
  ToggleLeft,
  Trash2,
  X,
  Youtube,
  Zap,
} from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
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
import { MultiCombobox } from "@/components/ui/combobox"
import { useT } from "@/lib/use-t"
import { usePageHeader } from "@/components/providers/page-header-context"
import { AnimatedCounter } from "@/components/animated-counter"
import { LikeButton } from "@/components/peripherals/LikeButton"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { hasScoreRanking } from "@/lib/tag-options"
import { CARD_TAG_STYLES } from "@/lib/tierlist-theme"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { formatCurrencyBRL } from "@/lib/format"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { cn } from "@/lib/utils"
import type { PeripheralFilterOptions, RankedPeripheral } from "@/lib/server/repositories/peripherals-repository"

type Category = "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp" | "psu"
type CategoryFilter = Category | "outros"

/** Ícone + cor de destaque do card por categoria — reforça o "escaneio visual" da grade. */
const CATEGORY_CARD_STYLE: Record<Category, { icon: typeof Mouse; text: string; glow: string }> = {
  keyboard: { icon: Keyboard, text: "text-sky-400", glow: "bg-sky-400" },
  pcb: { icon: CircuitBoard, text: "text-sky-400", glow: "bg-sky-400" },
  mouse: { icon: Mouse, text: "text-emerald-400", glow: "bg-emerald-400" },
  mousepad: { icon: SquareDashedBottom, text: "text-amber-400", glow: "bg-amber-400" },
  glasspad: { icon: SquareDashedBottom, text: "text-cyan-400", glow: "bg-cyan-400" },
  iem: { icon: Headphones, text: "text-fuchsia-400", glow: "bg-fuchsia-400" },
  headset: { icon: Headphones, text: "text-fuchsia-400", glow: "bg-fuchsia-400" },
  feet: { icon: Footprints, text: "text-orange-400", glow: "bg-orange-400" },
  chairs: { icon: Sofa, text: "text-rose-400", glow: "bg-rose-400" },
  monitors: { icon: Monitor, text: "text-violet-400", glow: "bg-violet-400" },
  switches: { icon: ToggleLeft, text: "text-lime-400", glow: "bg-lime-400" },
  dac_amp: { icon: Cpu, text: "text-teal-400", glow: "bg-teal-400" },
  psu: { icon: Zap, text: "text-yellow-400", glow: "bg-yellow-400" },
}
type SortKey = "recent" | "rank" | "name-asc" | "name-desc" | "price-asc" | "price-desc"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type MouseShape = "symmetrical" | "ergonomic"
type KeyboardLayout = "60%" | "75%" | "tkl" | "full-size"
type KeyboardType = "mechanical" | "magnetic" | "optical"
type PadType = "speed" | "control" | "hybrid"
type Surface = PadType | "glass" | "cloth"
type PanelType = "ips" | "tn" | "va" | "oled" | "other"
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado" | "raro" | "fibra_carbono" | "control" | "speed" | "silicone" | "ia" | "white_label" | "ips" | "va" | "tn" | "oled" | "miniled" | "fhd" | "qhd" | "4k" | "headphone" | "padrao_atx" | "full_modular" | "semi_modular" | "white_noise" | "bom_ripple" | "ripple_ruim" | "fonte_instavel" | "80_plus" | "selo_cybenetics" | "capacitor_japones" | "v_shaped" | "u_shaped" | "neutro" | "neutro_quente" | "quente" | "escuro" | "basshead" | "vocal_forward" | "harman" | "ief_neutral" | "jm_1" | "sub_bass_focus" | "mid_bass_focus" | "punchy" | "smooth" | "arejado" | "sibilante" | "detalhado" | "palco_amplo" | "boa_separacao" | "metal" | "resina" | "plastico" | "shell_pequeno" | "shell_grande" | "deep_fit" | "boa_isolacao" | "driver_flex" | "planar"

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
  hasYoutubeReview?: boolean
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
  initialTotal: number
  initialCategory: CategoryFilter
  initialFilterOptions: PeripheralFilterOptions
  initialTopRanked: RankedPeripheral[]
  pageSize: number
  showAdminActions?: boolean
}

const CATEGORIES: Category[] = ["mouse", "keyboard", "mousepad", "headset", "monitors", "iem", "dac_amp", "glasspad", "switches", "pcb", "feet", "chairs", "psu"]

const HERO_MAIN_CATEGORIES: Category[] = ["mouse", "keyboard", "mousepad", "glasspad", "monitors"]
const HERO_OTHER_CATEGORIES: Category[] = ["iem", "dac_amp", "headset", "switches", "pcb", "feet", "chairs", "psu"]

function categoryMatches(itemCategory: Category, target: CategoryFilter): boolean {
  return target === "outros" ? HERO_OTHER_CATEGORIES.includes(itemCategory) : itemCategory === target
}

const HERO_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  mouse: Mouse,
  keyboard: Keyboard,
  mousepad: Layers,
  glasspad: Gem,
  monitors: Monitor,
  outros: LayoutGrid,
}

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
  raro: "Raro",
  fibra_carbono: "Fibra de Carbono",
  control: "Control",
  speed: "Speed",
  silicone: "Silicone",
  ia: "IA",
  white_label: "White Label",
  ips: "IPS",
  va: "VA",
  tn: "TN",
  oled: "OLED",
  miniled: "MINILED",
  fhd: "FHD",
  qhd: "QHD",
  "4k": "4K",
  headphone: "Headphone",
  padrao_atx: "Padrão ATX",
  full_modular: "Full Modular",
  semi_modular: "Semi Modular",
  white_noise: "White Noise",
  bom_ripple: "Bom Ripple",
  ripple_ruim: "Ripple Ruim",
  fonte_instavel: "Fonte Instável",
  "80_plus": "80% Plus",
  selo_cybenetics: "Selo Cybenetics",
  capacitor_japones: "Capacitor Japonês",
  v_shaped: "V-Shaped",
  u_shaped: "U-Shaped",
  neutro: "Neutro",
  neutro_quente: "Neutro Quente",
  quente: "Quente",
  escuro: "Escuro",
  basshead: "Basshead",
  vocal_forward: "Vocal Forward",
  harman: "Harman",
  ief_neutral: "IEF Neutral",
  jm_1: "JM-1",
  sub_bass_focus: "Sub-bass Focus",
  mid_bass_focus: "Mid-bass Focus",
  punchy: "Punchy",
  smooth: "Smooth",
  arejado: "Arejado",
  sibilante: "Sibilante",
  detalhado: "Detalhado",
  palco_amplo: "Palco Amplo",
  boa_separacao: "Boa Separação",
  metal: "Metal",
  resina: "Resina",
  plastico: "Plástico",
  shell_pequeno: "Shell Pequeno",
  shell_grande: "Shell Grande",
  deep_fit: "Deep Fit",
  boa_isolacao: "Boa Isolação",
  driver_flex: "Driver Flex",
  planar: "Planar",
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

export function PerifericosContent({
  initialData,
  initialTotal,
  initialCategory,
  initialFilterOptions,
  initialTopRanked,
  pageSize,
  showAdminActions,
}: PerifericosContentProps) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  const [items, setItems] = useState<Peripheral[]>(initialData)
  const [total, setTotal] = useState(initialTotal)
  const [isFetching, setIsFetching] = useState(false)
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; id: string; name: string }>({ open: false, id: "", name: "" })
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
  const [weightRange, setWeightRange] = useState<[number, number]>([WEIGHT_MIN_G, WEIGHT_MAX_G])
  const [page, setPage] = useState(1)

  // Favoritos do usuário. O estado vive aqui (e não em cada `LikeButton`)
  // porque os cards desmontam ao trocar de categoria/filtro — se cada botão
  // guardasse o próprio estado, voltar à categoria remontaria o coração com
  // o valor da carga inicial e o like sumiria da tela.
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [likesLoaded, setLikesLoaded] = useState(false)
  useEffect(() => {
    let active = true
    fetch("/api/peripherals/likes", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { ids?: string[] }) => {
        if (active) setLikedIds(new Set(data.ids ?? []))
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLikesLoaded(true)
      })
    return () => {
      active = false
    }
  }, [])

  const handleLikedChange = useCallback((peripheralId: string, liked: boolean) => {
    setLikedIds((prev) => {
      const next = new Set(prev)
      if (liked) next.add(peripheralId)
      else next.delete(peripheralId)
      return next
    })
  }, [])

  const [query, setQuery] = useState("")
  const debouncedQuery = useDebouncedValue(query, 400)
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>(initialCategory)
  const [selectedBrandIds, setSelectedBrandIds] = useState<string[]>([])
  const [priceRangeOverride, setPriceRangeOverride] = useState<[number, number] | null>(null)
  const [selectedConnectivity, setSelectedConnectivity] = useState("all")
  const [selectedMouseShape, setSelectedMouseShape] = useState<MouseShape | "all">("all")
  const [selectedKeyboardLayout, setSelectedKeyboardLayout] = useState<KeyboardLayout | "all">("all")
  const [selectedSurface, setSelectedSurface] = useState<Surface | "all">("all")
  const [selectedProfile, setSelectedProfile] = useState<string | "all">("all")
  const [selectedRefreshRate, setSelectedRefreshRate] = useState<string | "all">("all")
  const [selectedPanelType, setSelectedPanelType] = useState<PanelType | "all">("all")
  const [selectedTags, setSelectedTags] = useState<Tag[]>([])
  const [onlyWithYoutubeReview, setOnlyWithYoutubeReview] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>("recent")

  // Itens selecionados pro comparador: guarda os dados mínimos no momento do
  // clique (não só o id) porque, com paginação, o item selecionado pode não
  // estar mais presente em `items` quando o usuário troca de página/filtro.
  const [selectedItems, setSelectedItems] = useState<{ id: string; category: Category; name: string; image_url: string | null }[]>([])

  const categoryLabels = t.categories.labels
  const categoryDescriptions = t.categories.descriptions

  const lockedCategory = selectedItems.length > 0 ? selectedItems[0].category : null
  const effectiveCategory = lockedCategory ?? selectedCategory

  const showConnectivityFilter = useMemo(() => {
    if (!effectiveCategory) return false
    // IEM ficou de fora: a ficha técnica dessa categoria não tem mais conectividade
    // (ver a seção de specs por categoria no formulário de admin).
    return ["mouse", "keyboard", "headset", "dac_amp"].includes(effectiveCategory)
  }, [effectiveCategory])

  const showMouseShapeFilter = effectiveCategory === "mouse"
  const showWeightFilter = effectiveCategory === "mouse"
  const showKeyboardLayoutFilter = effectiveCategory === "keyboard"
  const showSurfaceFilter = effectiveCategory === "mousepad" || effectiveCategory === "glasspad"
  const showProfileFilter = effectiveCategory === "mousepad" || effectiveCategory === "glasspad"
  const showMonitorFilters = effectiveCategory === "monitors"

  // Opções de filtro (marcas/specs) pré-computadas pelo servidor — filtradas
  // pela categoria atual, recarregadas por troca de categoria (não a cada
  // keystroke). Aceita ficar levemente desatualizada entre janelas de cache
  // em troca de não escanear o dataset a cada filtro.
  const [filterOptions, setFilterOptions] = useState<PeripheralFilterOptions>(initialFilterOptions)
  useEffect(() => {
    if (!effectiveCategory || effectiveCategory === "outros") {
      setFilterOptions((prev) => ({ ...prev, brands: [], mouseShapes: [], keyboardLayouts: [], surfaces: [], profiles: [], refreshRates: [], panelTypes: [] }))
      return
    }
    fetch(`/api/peripherals/filter-options?category=${effectiveCategory}`)
      .then((res) => res.json())
      .then((data: PeripheralFilterOptions) => setFilterOptions((prev) => ({ ...data, categoryCounts: prev.categoryCounts })))
      .catch(() => {})
  }, [effectiveCategory])

  // Contagem por categoria pros hero cards — sempre sobre TODAS as
  // categorias (sem filtro), independente da categoria selecionada. Busca
  // uma vez ao montar; não recarrega a cada troca de categoria porque não
  // muda com o filtro atual.
  useEffect(() => {
    fetch("/api/peripherals/filter-options")
      .then((res) => res.json())
      .then((data: PeripheralFilterOptions) => setFilterOptions((prev) => ({ ...prev, categoryCounts: data.categoryCounts })))
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const brandOptions = useMemo(
    () => filterOptions.brands.map(({ id, name }) => ({ value: id, label: name })),
    [filterOptions.brands]
  )

  useEffect(() => {
    setSelectedBrandIds((prev) => prev.filter((id) => filterOptions.brands.some((b) => b.id === id)))
    setSelectedTags((prev) => prev.filter((tag) => filterOptions.tags.includes(tag)))
  }, [filterOptions])

  const maxPrice = useMemo(() => Math.ceil((filterOptions.priceMax || 0) / 10) * 10, [filterOptions.priceMax])
  useEffect(() => {
    setPriceRangeOverride(null)
  }, [maxPrice])
  const priceRange = priceRangeOverride ?? [PRICE_MIN, maxPrice]
  const setPriceRange = setPriceRangeOverride
  const isPriceFiltered = priceRange[0] > PRICE_MIN || priceRange[1] < maxPrice
  const isWeightFiltered = showWeightFilter && (weightRange[0] > WEIGHT_MIN_G || weightRange[1] < WEIGHT_MAX_G)

  useEffect(() => {
    if (!showConnectivityFilter) setSelectedConnectivity("all")
    if (!showMouseShapeFilter) setSelectedMouseShape("all")
    if (!showKeyboardLayoutFilter) setSelectedKeyboardLayout("all")
    if (!showSurfaceFilter) setSelectedSurface("all")
    if (!showProfileFilter) setSelectedProfile("all")
    if (!showMonitorFilters) { setSelectedRefreshRate("all"); setSelectedPanelType("all") }
    if (!showWeightFilter) setWeightRange([WEIGHT_MIN_G, WEIGHT_MAX_G])
  }, [showConnectivityFilter, showMouseShapeFilter, showKeyboardLayoutFilter, showSurfaceFilter, showProfileFilter, showMonitorFilters, showWeightFilter])

  // Top ranking por categoria — vem do servidor (endpoint dedicado), não
  // depende de `items` (que agora é só a página atual).
  const [topRanked, setTopRanked] = useState<RankedPeripheral[]>(initialTopRanked)
  useEffect(() => {
    if (!effectiveCategory || effectiveCategory === "outros" || !hasScoreRanking(effectiveCategory)) {
      setTopRanked([])
      return
    }
    fetch(`/api/peripherals/ranked?category=${effectiveCategory}&limit=3`)
      .then((res) => res.json())
      .then((data: { items: RankedPeripheral[] }) => setTopRanked(data.items ?? []))
      .catch(() => {})
  }, [effectiveCategory])

  const activeFiltersCount = useMemo(() =>
    [selectedConnectivity, selectedMouseShape, selectedKeyboardLayout, selectedSurface, selectedProfile, selectedRefreshRate, selectedPanelType]
      .filter((v) => v !== "all").length + selectedBrandIds.length + (query.trim() ? 1 : 0) + (isWeightFiltered ? 1 : 0) + (isPriceFiltered ? 1 : 0) + selectedTags.length + (onlyWithYoutubeReview ? 1 : 0),
    [query, selectedBrandIds, selectedConnectivity, selectedMouseShape, selectedKeyboardLayout, selectedSurface, selectedProfile, selectedRefreshRate, selectedPanelType, isWeightFiltered, isPriceFiltered, selectedTags, onlyWithYoutubeReview]
  )

  const heroCategoryStats = useMemo(() => {
    const counts = filterOptions.categoryCounts
    const othersCount = HERO_OTHER_CATEGORIES.reduce((sum, cat) => sum + (counts[cat] ?? 0), 0)
    return [
      ...HERO_MAIN_CATEGORIES.map((cat) => ({ key: cat as CategoryFilter, label: categoryLabels[cat], count: counts[cat] ?? 0 })),
      { key: "outros" as CategoryFilter, label: t.categories.others, count: othersCount },
    ]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOptions.categoryCounts, categoryLabels])

  const resetFilters = () => {
    setQuery("")
    setSelectedBrandIds([])
    setPriceRangeOverride(null)
    setSelectedConnectivity("all")
    setSelectedMouseShape("all")
    setSelectedKeyboardLayout("all")
    setSelectedSurface("all")
    setSelectedProfile("all")
    setSelectedRefreshRate("all")
    setSelectedPanelType("all")
    setSelectedTags([])
    setOnlyWithYoutubeReview(false)
    setWeightRange([WEIGHT_MIN_G, WEIGHT_MAX_G])
    setSortKey("recent")
  }

  const toggleSelection = (item: Peripheral) => {
    setSelectedItems((prev) => {
      if (prev.some((i) => i.id === item.id)) {
        return prev.filter((i) => i.id !== item.id)
      }
      if (prev.length > 0 && prev[0].category !== item.category) return prev
      return [...prev, { id: item.id, category: item.category, name: item.name, image_url: item.image_url }]
    })
  }

  const clearSelection = () => setSelectedItems([])

  // Volta pra página 1 sempre que um filtro (não a página em si) muda.
  const filterKey = [
    selectedCategory, debouncedQuery, selectedBrandIds.join(","), selectedConnectivity, selectedMouseShape,
    selectedKeyboardLayout, selectedSurface, selectedProfile, selectedRefreshRate, selectedPanelType,
    selectedTags.join(","), onlyWithYoutubeReview, sortKey, priceRange[0], priceRange[1], weightRange[0], weightRange[1],
  ].join("|")
  const prevFilterKey = useRef(filterKey)
  useEffect(() => {
    if (prevFilterKey.current !== filterKey) {
      prevFilterKey.current = filterKey
      setPage(1)
    }
  }, [filterKey])

  const isFirstRun = useRef(true)
  useEffect(() => {
    const params = new URLSearchParams()
    if (selectedCategory !== "outros") params.set("category", selectedCategory)
    else if (HERO_OTHER_CATEGORIES.length > 0) params.set("category", HERO_OTHER_CATEGORIES.join(","))
    if (debouncedQuery.trim()) params.set("search", debouncedQuery.trim())
    if (selectedBrandIds.length > 0) params.set("brandIds", selectedBrandIds.join(","))
    if (isPriceFiltered) { params.set("priceMin", String(priceRange[0])); params.set("priceMax", String(priceRange[1])) }
    if (selectedConnectivity !== "all") params.set("connectivity", selectedConnectivity)
    if (selectedMouseShape !== "all") params.set("mouseShape", selectedMouseShape)
    if (isWeightFiltered) { params.set("weightMin", String(weightRange[0])); params.set("weightMax", String(weightRange[1])) }
    if (selectedKeyboardLayout !== "all") params.set("keyboardLayout", selectedKeyboardLayout)
    if (selectedSurface !== "all") params.set("surface", selectedSurface)
    if (selectedProfile !== "all") params.set("profile", selectedProfile)
    if (selectedRefreshRate !== "all") params.set("refreshRate", selectedRefreshRate)
    if (selectedPanelType !== "all") params.set("panelType", selectedPanelType)
    if (selectedTags.length > 0) params.set("tags", selectedTags.join(","))
    if (sortKey !== "recent") params.set("sort", sortKey)
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))

    if (isFirstRun.current) {
      isFirstRun.current = false
      if (selectedCategory === initialCategory && page === 1 && !debouncedQuery && activeFiltersCount === 0) {
        return
      }
    }

    setIsFetching(true)
    const controller = new AbortController()
    fetch(`/api/peripherals/list?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { items: Peripheral[]; total: number }) => {
        setItems(data.items)
        setTotal(data.total)
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setItems([])
      })
      .finally(() => setIsFetching(false))

    // Filtro de youtube review não tem coluna dedicada — filtra client-side
    // sobre a página já carregada (custo baixo, não motiva coluna extra).
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory, debouncedQuery, selectedBrandIds.join(","), isPriceFiltered, priceRange[0], priceRange[1],
      selectedConnectivity, selectedMouseShape, isWeightFiltered, weightRange[0], weightRange[1], selectedKeyboardLayout,
      selectedSurface, selectedProfile, selectedRefreshRate, selectedPanelType, selectedTags.join(","), sortKey, page, pageSize])

  // Reflete a categoria selecionada na URL (compartilhável), sem recarregar.
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("category", selectedCategory)
    const next = params.toString()
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategory])

  const visibleItems = useMemo(() => {
    if (!onlyWithYoutubeReview) return items
    return items.filter((item) => item.hasYoutubeReview === true)
  }, [items, onlyWithYoutubeReview])

  async function handleConfirmDelete() {
    if (!deleteDialog.id) return
    const name = deleteDialog.name
    setDeleting(true)
    setDeleteError(null)
    try {
      const res = await fetch(`/api/admin/peripherals/${deleteDialog.id}`, { method: "DELETE" })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? (t.peripherals.delete.failed))
      setItems((prev) => prev.filter((p) => p.id !== deleteDialog.id))
      setTotal((prev) => Math.max(0, prev - 1))
      setSelectedItems((prev) => prev.filter((sid) => sid.id !== deleteDialog.id))
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

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const sidebarFilters = (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Category selector */}
      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t.filters.category}
        </p>
        <Select
          value={selectedCategory}
          onValueChange={(v) => setSelectedCategory(v as CategoryFilter)}
          disabled={selectedItems.length > 0 && lockedCategory !== null}
        >
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CATEGORIES.map((cat) => (
              <SelectItem
                key={cat}
                value={cat}
                disabled={selectedItems.length > 0 && lockedCategory !== null && cat !== lockedCategory}
              >
                {categoryLabels[cat]}
              </SelectItem>
            ))}
            <SelectItem value="outros" disabled={selectedItems.length > 0 && lockedCategory !== null}>
              {t.categories.others}
            </SelectItem>
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
        <MultiCombobox
          options={brandOptions}
          values={selectedBrandIds}
          onValuesChange={setSelectedBrandIds}
          placeholder={t.filters.allBrands}
          searchPlaceholder={t.filters.searchBrand}
          allLabel={t.filters.allBrands}
          className="h-9 w-full border-border bg-muted/20 text-sm"
        />
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
      {showMouseShapeFilter && filterOptions.mouseShapes.length > 0 && (
        <FilterSection title={t.filters.shape}>
          <Select value={selectedMouseShape} onValueChange={(v) => setSelectedMouseShape(v as MouseShape | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {filterOptions.mouseShapes.map((shape) => (
                <SelectItem key={shape} value={shape}>
                  {shape === "symmetrical" ? t.filters.symmetrical : shape === "ergonomic" ? t.filters.ergonomic : formatLabel(shape)}
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
      {showKeyboardLayoutFilter && filterOptions.keyboardLayouts.length > 0 && (
        <FilterSection title="Layout">
          <Select value={selectedKeyboardLayout} onValueChange={(v) => setSelectedKeyboardLayout(v as KeyboardLayout | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {filterOptions.keyboardLayouts.map((layout) => (
                <SelectItem key={layout} value={layout}>{layout.toUpperCase()}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Surface */}
      {showSurfaceFilter && filterOptions.surfaces.length > 0 && (
        <FilterSection title={t.filters.surface}>
          <Select value={selectedSurface} onValueChange={(v) => setSelectedSurface(v as Surface | "all")}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {filterOptions.surfaces.map((surface) => (
                <SelectItem key={surface} value={surface}>
                  {surface === "cloth" ? t.filters.cloth : surface === "glass" ? t.filters.glass : surface === "hybrid" ? t.filters.hybrid : formatLabel(surface)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterSection>
      )}

      {/* Profile */}
      {showProfileFilter && filterOptions.profiles.length > 0 && (
        <FilterSection title={t.filters.profile}>
          <Select value={selectedProfile} onValueChange={setSelectedProfile}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t.common.any}</SelectItem>
              {filterOptions.profiles.map((profile) => (
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
                {filterOptions.refreshRates.map((r) => (
                  <SelectItem key={r} value={String(r)}>{r} Hz</SelectItem>
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
                {filterOptions.panelTypes.map((p) => (
                  <SelectItem key={p} value={p}>{p.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FilterSection>
        </>
      )}

      {/* Tags */}
      {filterOptions.tags.length > 0 && (
        <FilterSection title={t.filters.tags}>
          <div className="flex flex-wrap gap-1.5">
            {filterOptions.tags.map((tag) => {
              const active = selectedTags.includes(tag as Tag)
              const style = CARD_TAG_STYLES[tag as Tag]
              if (!style) return null
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setSelectedTags((prev) =>
                      prev.includes(tag as Tag) ? prev.filter((t) => t !== tag) : [...prev, tag as Tag]
                    )
                  }
                  className={cn(
                    "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors",
                    active
                      ? cn(style.bg, style.text, style.border)
                      : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
                  )}
                >
                  <span className={cn("size-1.5 rounded-full", active ? style.dot : "bg-muted-foreground/40")} />
                  {formatTagLabel(tag as Tag, effectiveCategory ?? undefined)}
                </button>
              )
            })}
          </div>
        </FilterSection>
      )}

      {/* Review no Youtube */}
      <div className="border-b border-border p-4">
        <button
          type="button"
          onClick={() => setOnlyWithYoutubeReview((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            onlyWithYoutubeReview
              ? "border-red-500/40 bg-red-500/10 text-red-400"
              : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          )}
        >
          <Youtube className="size-4" />
          {t.filters.youtubeReview}
        </button>
      </div>

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
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 py-8 sm:px-4 md:px-6 lg:px-8">
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
              const isActive = key === "outros"
                ? selectedCategory === "outros" || HERO_OTHER_CATEGORIES.includes(selectedCategory as Category)
                : selectedCategory === key

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (lockedCategory && key !== lockedCategory) clearSelection()
                    setSelectedCategory(key)
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
                    <AnimatedCounter value={count} />
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
          {t.filters.productCount(total)}
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
        <aside className="hidden w-[260px] shrink-0 md:block md:sticky md:top-[var(--sticky-header-h)]">
          {sidebarFilters}
        </aside>

        {/* Right content */}
        <main className="min-w-0 flex-1">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold tracking-tight text-foreground">
              {selectedCategory === "outros" ? t.categories.others : categoryLabels[selectedCategory]}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {selectedCategory === "outros" ? t.categories.othersDescription : categoryDescriptions[selectedCategory]}
            </p>
            <div className="mt-4 flex items-center gap-3">
              <span className="text-sm font-medium text-muted-foreground">
                {t.filters.productCount(total)}
              </span>
              {activeFiltersCount > 0 && (
                <span className="text-xs text-muted-foreground/60">
                  · {activeFiltersCount} {t.filters.activeFilters}
                </span>
              )}
              {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />}
            </div>
          </div>

          {/* Ranking list */}
          {topRanked.length > 0 && (
            <div className="mb-8">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                {t.peripherals.ranking}
              </p>
              <div className="flex flex-col gap-1.5">
                {topRanked.map((item, index) => {
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
                        <Image src={item.image_url} alt={item.name} width={36} height={36} className="size-9 rounded-lg bg-muted/30 object-contain p-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-foreground">{item.name}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Grid */}
          {visibleItems.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
                {t.peripherals.notFound}
              </p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                {t.peripherals.adjustFilters}
              </p>
            </div>
          ) : (
            <div className={cn("grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-3 transition-opacity", isFetching && "opacity-60")}>
              {visibleItems.map((item) => {
                const isSelected = selectedItems.some((i) => i.id === item.id)
                const categoryStyle = CATEGORY_CARD_STYLE[item.category]
                const CategoryIcon = categoryStyle.icon

                const cardHref = showAdminActions
                  ? `/admin/perifericos/${item.id}`
                  : `/perifericos/${buildPeripheralSlug(item.name, item.id)}`

                return (
                  <Link
                    key={item.id}
                    href={cardHref}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-xl border transition-all duration-200",
                      CARD_SURFACE,
                      "hover:-translate-y-1 hover:shadow-xl hover:shadow-black/30",
                      isSelected && "border-primary/50 ring-1 ring-primary/25 shadow-lg shadow-primary/5"
                    )}
                  >
                    {/* Glow sutil na cor da categoria, só visível no hover — reforça a identidade sem competir com o conteúdo. */}
                    <div
                      aria-hidden="true"
                      className={cn(
                        "pointer-events-none absolute inset-0 rounded-xl opacity-0 transition-opacity duration-300 group-hover:opacity-[0.07]",
                        "[mask-image:radial-gradient(120%_60%_at_50%_0%,black,transparent)]",
                        categoryStyle.glow
                      )}
                    />
                    {/* Image area */}
                    <div className="relative overflow-hidden rounded-t-xl border-b border-border/60 bg-background/40">
                      {/* A listagem do admin é de gestão do catálogo, não de
                          consumo — favoritar ali não faz sentido. */}
                      {!showAdminActions && (
                        <LikeButton
                          peripheralId={item.id}
                          liked={likedIds.has(item.id)}
                          onLikedChange={handleLikedChange}
                          className={cn(
                            "absolute right-2 top-2 transition-opacity duration-200",
                            likesLoaded ? "opacity-100" : "pointer-events-none opacity-0"
                          )}
                        />
                      )}
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
                    <div className="relative flex flex-1 flex-col gap-3 p-4">
                      <div>
                        <h3 className="flex items-center gap-1.5 truncate text-xs font-bold uppercase tracking-wide leading-tight text-foreground">
                          <CategoryIcon
                            className={cn("size-3.5 shrink-0 transition-colors duration-200", categoryStyle.text)}
                          />
                          <span className="truncate">{item.name}</span>
                        </h3>
                        <p className="mt-1 text-xs text-muted-foreground">{item.brand}</p>
                      </div>

                      <span className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-sm font-bold text-emerald-300">
                        {formatCurrencyBRL(item.price)}
                      </span>

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
                            toggleSelection(item)
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

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          )}
        </main>
      </div>

      {/* Floating compare bar */}
      {selectedItems.length > 0 && (
        <div className="fixed bottom-[calc(1.5rem_+_env(safe-area-inset-bottom))] left-1/2 z-50 w-full max-w-[calc(100vw-1rem)] -translate-x-1/2 px-4 sm:w-auto">
          <div className="flex items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/95 px-4 py-3 shadow-2xl shadow-black/50 backdrop-blur-md">
            <div className="flex items-center gap-1.5">
              {selectedItems.slice(0, 3).map((item) => (
                <div key={item.id} className="size-8 overflow-hidden rounded-lg border border-border bg-muted/40">
                  {item.image_url ? (
                    <Image src={item.image_url} alt={item.name} width={32} height={32} className="h-full w-full object-contain p-0.5" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-muted-foreground">
                      {item.name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <span className="whitespace-nowrap text-xs text-muted-foreground">
              {selectedItems.length} {t.common.selected}
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

              {selectedItems.length >= 2 && (
                <Link
                  href={`/perifericos/comparar?ids=${selectedItems.map((i) => i.id).join(",")}`}
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

      {selectedItems.length > 0 && <div className="h-16" />}

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
