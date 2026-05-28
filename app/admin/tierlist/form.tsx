"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Upload, ChevronDown, ChevronUp, ImageIcon, Tag, Layers, FileText, ShoppingCart, Info, Link2, Search, X } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import * as z from "zod"

import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu"
import { useLocale } from "@/components/providers/locale-context"
import { usePageHeader } from "@/components/providers/page-header-context"
import { mapTier } from "@/lib/tier-utils"
import { RATING_LEVEL_COLORS } from "@/lib/tierlist-theme"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierField = Tier | "__none__"
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode"

const peripheralSchema = z.object({
  name: z
    .string()
    .min(1, "Informe o nome do periférico")
    .max(200, "Nome muito longo (máx. 200 caracteres)"),
  brand: z
    .string()
    .min(1, "Selecione a marca")
    .max(120, "Marca muito longa (máx. 120 caracteres)"),
  category: z.enum(
    ["keyboard", "mouse", "mousepad", "glasspad", "iem", "headset", "feet", "chairs", "monitors", "switches", "dac_amp"],
    { message: "Selecione uma das categorias disponíveis" }
  ),
  tier: z.union([z.enum(["GOAT", "SS", "S", "A", "B", "C", "L"]), z.literal("__none__")]),
  price: z
    .number({ message: "Preço inválido" })
    .positive("Preço deve ser maior que zero"),
  rankLabel: z.string().optional(),
  priceRange: z.string().optional(),
  reviewUrl: z.string().optional(),
  reviewNote: z.string().optional(),
  guideUrl: z.string().optional(),
  wikiUrl: z.string().optional(),
  notesLong: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.string().optional(),
  pros: z.string().optional(),
  cons: z.string().optional(),
  gallery: z.string().optional(),
  buyLinks: z.string().optional(),
  compatibility: z.string().optional(),
  notes: z.string().optional(),
  comparisons: z.string().optional(),
  weight: z.string().optional(),
  latency: z.string().optional(),
  switchType: z.string().optional(),
  coating: z.string().optional(),
  shape: z.string().optional(),
  gripSmall: z.string().optional(),
  gripMedium: z.string().optional(),
  gripLarge: z.string().optional(),
  ratingOverall: z.number().min(0).max(6).optional(),
  ratingBuild: z.number().min(0).max(6).optional(),
  ratingSoftware: z.number().min(0).max(6).optional(),
  ratingBattery: z.number().min(0).max(6).optional(),
  ratingPerformance: z.number().min(0).max(6).optional(),
  ratingQc: z.number().min(0).max(6).optional(),
  ratingValue: z.number().min(0).max(6).optional(),
  mouseShape: z.string().optional(),
  keyboardLayout: z.string().optional(),
  connectivity: z.string().optional(),
  size: z.string().optional(),
  surface: z.string().optional(),
  padType: z.string().optional(),
  driver: z.string().optional(),
  profile: z.string().optional(),
  keyboardType: z.string().optional(),
  trimode: z.string().optional(),
  refreshRate: z.preprocess(
    (value) => (value === "" || value === null || Number.isNaN(value) ? undefined : value),
    z.number().positive().optional()
  ),
  panelType: z.string().optional(),
})

type PeripheralFormData = z.infer<typeof peripheralSchema>

const CATEGORIES: { key: Category; label: string; emoji: string }[] = [
  { key: "mouse", label: "Mouse", emoji: "🖱️" },
  { key: "keyboard", label: "Teclado", emoji: "⌨️" },
  { key: "mousepad", label: "Mousepad", emoji: "🟦" },
  { key: "glasspad", label: "Glasspad", emoji: "🪟" },
  { key: "iem", label: "IEM", emoji: "🎧" },
  { key: "headset", label: "Headset", emoji: "🎙️" },
  { key: "feet", label: "Feet", emoji: "🦶" },
  { key: "chairs", label: "Cadeiras", emoji: "🪑" },
  { key: "monitors", label: "Monitores", emoji: "🖥️" },
  { key: "switches", label: "Switches", emoji: "⌨️" },
  { key: "dac_amp", label: "DAC/AMP", emoji: "🎚️" },
]

const TIER_OPTIONS: { key: Tier; color: string; textColor: string; bg: string }[] = [
  { key: "GOAT", color: "border-orange-400 bg-orange-500/20 text-orange-300", textColor: "text-orange-300", bg: "bg-orange-500/20" },
  { key: "SS", color: "border-yellow-400 bg-yellow-500/20 text-yellow-300", textColor: "text-yellow-300", bg: "bg-yellow-500/20" },
  { key: "S", color: "border-amber-400 bg-amber-500/20 text-amber-300", textColor: "text-amber-300", bg: "bg-amber-500/20" },
  { key: "A", color: "border-lime-400 bg-lime-500/20 text-lime-300", textColor: "text-lime-300", bg: "bg-lime-500/20" },
  { key: "B", color: "border-cyan-400 bg-cyan-500/20 text-cyan-300", textColor: "text-cyan-300", bg: "bg-cyan-500/20" },
  { key: "C", color: "border-blue-400 bg-blue-500/20 text-blue-300", textColor: "text-blue-300", bg: "bg-blue-500/20" },
  { key: "L", color: "border-border bg-muted/40 text-muted-foreground", textColor: "text-muted-foreground", bg: "bg-muted/40" },
]

const TAGS_OPTIONS: { key: Tag; en: string; pt: string; color: string }[] = [
  { key: "competitive", en: "Competitive", pt: "Competitivo", color: "border-red-400/50 bg-red-500/10 text-red-300 data-[active=true]:bg-red-500/30 data-[active=true]:border-red-400" },
  { key: "versatile", en: "Bomba", pt: "Bomba", color: "border-violet-400/50 bg-violet-500/10 text-violet-300 data-[active=true]:bg-violet-500/30 data-[active=true]:border-violet-400" },
  { key: "value", en: "Value", pt: "Custo-Benefício", color: "border-emerald-400/50 bg-emerald-500/10 text-emerald-300 data-[active=true]:bg-emerald-500/30 data-[active=true]:border-emerald-400" },
  { key: "cheap", en: "Cheap", pt: "Barato", color: "border-green-400/50 bg-green-500/10 text-green-300 data-[active=true]:bg-green-500/30 data-[active=true]:border-green-400" },
  { key: "expensive", en: "Expensive", pt: "Caro", color: "border-rose-400/50 bg-rose-500/10 text-rose-300 data-[active=true]:bg-rose-500/30 data-[active=true]:border-rose-400" },
  { key: "light", en: "Light", pt: "Leve", color: "border-sky-400/50 bg-sky-500/10 text-sky-300 data-[active=true]:bg-sky-500/30 data-[active=true]:border-sky-400" },
  { key: "heavy", en: "Heavy", pt: "Pesado", color: "border-slate-400/50 bg-slate-500/10 text-slate-300 data-[active=true]:bg-slate-500/30 data-[active=true]:border-slate-400" },
  { key: "unbalanced", en: "Unbalanced weight", pt: "Peso Desbalanceado", color: "border-pink-400/50 bg-pink-500/10 text-pink-300 data-[active=true]:bg-pink-500/30 data-[active=true]:border-pink-400" },
  { key: "dpi_deviation", en: "DPI Deviation", pt: "DPI Deviation", color: "border-yellow-400/50 bg-yellow-500/10 text-yellow-300 data-[active=true]:bg-yellow-500/30 data-[active=true]:border-yellow-400" },
  { key: "wobble_high", en: "High wobble", pt: "Wooble Alto", color: "border-fuchsia-400/50 bg-fuchsia-500/10 text-fuchsia-300 data-[active=true]:bg-fuchsia-500/30 data-[active=true]:border-fuchsia-400" },
  { key: "wobble_low", en: "Low wobble", pt: "Wooble Baixo", color: "border-violet-400/50 bg-violet-500/10 text-violet-300 data-[active=true]:bg-violet-500/30 data-[active=true]:border-violet-400" },
  { key: "scroll_hard", en: "Hard scroll", pt: "Scroll Duro", color: "border-stone-400/50 bg-stone-500/10 text-stone-300 data-[active=true]:bg-stone-500/30 data-[active=true]:border-stone-400" },
  { key: "scroll_soft", en: "Soft scroll", pt: "Scroll Mole", color: "border-lime-400/50 bg-lime-500/10 text-lime-300 data-[active=true]:bg-lime-500/30 data-[active=true]:border-lime-400" },
  { key: "trimode", en: "Trimode", pt: "Trimode", color: "border-indigo-400/50 bg-indigo-500/10 text-indigo-300 data-[active=true]:bg-indigo-500/30 data-[active=true]:border-indigo-400" },
]

const BRAND_OPTIONS = [
  "Akko",
  "AOC",
  "Angry Miao",
  "Apple",
  "Artisan",
  "Asus",
  "Asus Rog",
  "ATK",
  "Attack Shark",
  "Aula",
  "Ausdom",
  "Audio-Technica",
  "BenQ",
  "Beyerdynamic",
  "Cooler Master",
  "Corsair",
  "Dell",
  "Ducky",
  "Endgame Gear",
  "Everglide",
  "Fantech",
  "Philco",
  "Finalmouse",
  "Gamemax",
  "GLSSWRKS",
  "Glorious",
  "G-Wolves",
  "HyperX",
  "IROK",
  "Ipi",
  "Keychron",
  "Lamzu",
  "Leopold",
  "Lian Li",
  "LG",
  "Logitech",
  "Mad Catz",
  "MCHOSE",
  "Melgeek",
  "Msi",
  "Nollie",
  "NZXT",
  "Pulsar",
  "Rakka",
  "Rawn",
  "Razer",
  "Reddragon",
  "Roccat",
  "Samsung",
  "Scyrox",
  "Sennheiser",
  "SteelSeries",
  "Tekkusai",
  "Varmilo",
  "VGN",
  "VXE",
  "Waizowl",
  "Wallhack",
  "Wob",
  "Wooting",
  "Xiaomi",
  "Zowie",
  "WL Mouse",
]

const COATING_OPTIONS = [
  "Emborrachado",
  "Plastico",
  "Magnesio",
  "Metalizado",
  "Fibra de carbono",
  "Fibra de vidro",
]

const RATING_FIELDS: { key: keyof PeripheralFormData; label: string; ptLabel: string }[] = [
  { key: "ratingOverall", label: "Overall", ptLabel: "Geral" },
  { key: "ratingBuild", label: "Build", ptLabel: "Construção" },
  { key: "ratingPerformance", label: "Performance", ptLabel: "Performance" },
  { key: "ratingValue", label: "Value", ptLabel: "Custo-Benefício" },
  { key: "ratingSoftware", label: "Software", ptLabel: "Software" },
  { key: "ratingBattery", label: "Battery", ptLabel: "Bateria" },
  { key: "ratingQc", label: "QC", ptLabel: "Controle de Qualidade" },
]

interface SectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
}

function FormSection({ title, icon, children, defaultOpen = true }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Card className="border-border bg-card/50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-2.5 text-sm font-semibold text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {title}
        </div>
        {open ? <ChevronUp className="size-4 text-muted-foreground" /> : <ChevronDown className="size-4 text-muted-foreground" />}
      </button>
      {open && <CardContent className="border-t border-border pt-4 pb-5">{children}</CardContent>}
    </Card>
  )
}

function RatingInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: number | undefined
  onChange: (v: number | undefined) => void
}) {
  const levels = [1, 2, 3, 4, 5, 6]

  const RATING_COLORS = RATING_LEVEL_COLORS

  const activeColor = typeof value === "number" ? RATING_COLORS[value].bar : null

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${typeof value === "number" ? RATING_COLORS[value].bg : "bg-muted text-foreground"}`}>
          {value !== undefined ? `${value}/6` : "—"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex gap-1 flex-1 h-3 items-center">
          {levels.map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => onChange(lvl)}
              className={`flex-1 rounded transition-colors h-3 ${typeof value === "number" && lvl <= (value ?? 0) ? activeColor : "bg-muted/40 hover:bg-muted/60"}`}
              title={`${lvl}/6`}
            />
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={() => onChange(0)}
            className={`flex size-6 items-center justify-center rounded text-[10px] font-bold ${RATING_COLORS[0].bg}`}
            title="Set 0"
          >
            0
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="flex size-6 items-center justify-center rounded text-[10px] font-bold bg-muted/20"
            title="Limpar"
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

interface LinkedProduct {
  id: string
  slug: string
  name: string
  type: "store" | "bazaar"
  price_cents: number
  images: string[]
}

function LinkedProductPicker({
  kind,
  value,
  onChange,
  excludeId,
  isEnglish,
}: {
  kind: "store" | "bazaar"
  value: LinkedProduct | null
  onChange: (product: LinkedProduct | null) => void
  excludeId: string | null
  isEnglish: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<LinkedProduct[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/admin/store/products?type=${kind}`, { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json: { products?: LinkedProduct[] } | null) => {
        if (!cancelled) setResults(json?.products ?? [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, kind])

  const filtered = query.trim()
    ? results.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : results
  const visible = filtered.filter((p) => p.id !== excludeId)

  const placeholderLabel = kind === "store"
    ? (isEnglish ? "Search a store product…" : "Buscar produto da Loja…")
    : (isEnglish ? "Search a bazaar item…" : "Buscar item do Bazar…")

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
          <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted/40">
            {value.images?.[0] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.images[0]} alt={value.name} className="h-full w-full object-contain p-0.5" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">{value.name.slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">{value.name}</p>
            <p className="text-xs text-muted-foreground">{(value.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
          </div>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full justify-start gap-2 text-muted-foreground">
          <Search className="size-4" />
          {placeholderLabel}
        </Button>
      )}

      {open && (
        <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3">
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder={isEnglish ? "Type to filter…" : "Digite para filtrar…"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-border bg-background"
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {isEnglish ? "Close" : "Fechar"}
            </Button>
          </div>
          <div className="max-h-56 overflow-auto rounded-md border border-border/60 bg-background/40">
            {loading ? (
              <p className="p-3 text-xs text-muted-foreground">{isEnglish ? "Loading…" : "Carregando…"}</p>
            ) : visible.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{isEnglish ? "No items found." : "Nenhum item encontrado."}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {visible.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(p); setOpen(false) }}
                      className="flex w-full items-center gap-3 p-2 text-left transition hover:bg-muted/30"
                    >
                      <div className="size-9 shrink-0 overflow-hidden rounded-md bg-muted/40">
                        {p.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">{p.name.slice(0, 2).toUpperCase()}</div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-foreground">{p.name}</p>
                        <p className="text-xs text-muted-foreground">{(p.price_cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

interface PeripheralEditProps {
  peripheralId?: string
}

export const PeripheralForm: React.FC<PeripheralEditProps> = ({ peripheralId }) => {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const router = useRouter()
  const pathname = usePathname()
  const backHref = pathname?.startsWith("/admin/perifericos") ? "/admin/perifericos" : "/admin/tierlist"
  const parentLabel = pathname?.startsWith("/admin/perifericos")
    ? (isEnglish ? "Peripherals" : "Periféricos")
    : "Tierlist"
  const [uploading, setUploading] = useState(false)
  const [loadingPeripheral, setLoadingPeripheral] = useState(Boolean(peripheralId))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [usdToBrl, setUsdToBrl] = useState<number | null>(null)
  const [originalUsdPrice, setOriginalUsdPrice] = useState<number | null>(null)
  const [linkedStore, setLinkedStore] = useState<LinkedProduct | null>(null)
  const [linkedBazaar, setLinkedBazaar] = useState<LinkedProduct | null>(null)

  const form = useForm<PeripheralFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(peripheralSchema) as any,
    defaultValues: {
      name: "",
      brand: "",
      category: "mouse",
      tier: "__none__",
      price: 0,
      rankLabel: "", priceRange: "", reviewUrl: "", reviewNote: "", guideUrl: "", wikiUrl: "",
      notesLong: "", summary: "", highlights: "", pros: "", cons: "", gallery: "",
      buyLinks: "", compatibility: "", notes: "", comparisons: "",
      weight: "", latency: "", switchType: "", coating: "", shape: "",
      gripSmall: "", gripMedium: "", gripLarge: "",
      ratingOverall: undefined, ratingBuild: undefined, ratingSoftware: undefined,
      ratingBattery: undefined, ratingPerformance: undefined, ratingQc: undefined, ratingValue: undefined,
      keyboardType: "",
      trimode: "",
      padType: "",
      refreshRate: undefined,
      panelType: "",
    },
  })

  const watchedTier = form.watch("tier")
  const watchedCategory = form.watch("category")

  usePageHeader(
    peripheralId ? (isEnglish ? "Edit Peripheral" : "Editar Periférico") : (isEnglish ? "New Peripheral" : "Novo Periférico"),
    peripheralId
      ? (isEnglish ? "Update the peripheral information below." : "Atualize as informações do periférico abaixo.")
      : (isEnglish ? "Fill in the details to add a new peripheral to the tierlist." : "Preencha os dados para adicionar um novo periférico à tierlist.")
  )

  useEffect(() => {
    if (peripheralId) loadPeripheral()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peripheralId])

  useEffect(() => {
    if (locale === "pt-BR") fetchUsdToBrl()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale])

  useEffect(() => {
    if (usdToBrl && originalUsdPrice !== null && locale === "pt-BR") {
      form.setValue("price", Number((originalUsdPrice * usdToBrl).toFixed(2)))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usdToBrl, originalUsdPrice])

  async function fetchUsdToBrl() {
    try {
      const res = await fetch("https://api.exchangerate.host/latest?base=USD&symbols=BRL")
      const json = await res.json()
      if (json?.rates?.BRL) setUsdToBrl(Number(json.rates.BRL))
    } catch { /* ignore */ }
  }

  async function loadPeripheral() {
    setLoadingPeripheral(true)
    try {
      const res = await fetch(`/api/admin/peripherals/${peripheralId}`, { cache: "no-store" })
      const json = (await res.json().catch(() => null)) as { peripheral?: any; error?: string } | null
      if (!res.ok || !json?.peripheral) throw new Error(json?.error ?? (isEnglish ? "Failed to load peripheral" : "Erro ao carregar periférico"))
      const data = json.peripheral
      if (data) {
        setOriginalUsdPrice(data.price)
        const displayedPrice = locale === "pt-BR" && usdToBrl ? Number((data.price * usdToBrl).toFixed(2)) : data.price
        form.reset({
          name: data.name, brand: data.brand, category: data.category,
          tier: data.tier ? mapTier(data.tier) : "__none__",
          price: displayedPrice,
          rankLabel: data.specs?.details?.rankLabel ?? "",
          priceRange: data.specs?.details?.priceRange ?? "",
          reviewUrl: data.specs?.details?.reviewUrl ?? "",
          reviewNote: data.specs?.details?.reviewNote ?? "",
          guideUrl: data.specs?.details?.guideUrl ?? "",
          wikiUrl: data.specs?.details?.wikiUrl ?? "",
          notesLong: data.specs?.details?.notesLong ?? "",
          summary: data.specs?.details?.summary ?? "",
          highlights: Array.isArray(data.specs?.details?.highlights) ? data.specs.details.highlights.join("\n") : data.specs?.details?.highlights ?? "",
          pros: Array.isArray(data.specs?.details?.pros) ? data.specs.details.pros.join("\n") : data.specs?.details?.pros ?? "",
          cons: Array.isArray(data.specs?.details?.cons) ? data.specs.details.cons.join("\n") : data.specs?.details?.cons ?? "",
          gallery: Array.isArray(data.specs?.details?.gallery) ? data.specs.details.gallery.join("\n") : data.specs?.details?.gallery ?? "",
          buyLinks: Array.isArray(data.specs?.details?.buyLinks)
            ? data.specs.details.buyLinks.map((l: { label: string; url: string }) => `${l.label} | ${l.url}`).join("\n")
            : data.specs?.details?.buyLinks ?? "",
          compatibility: data.specs?.details?.compatibility ?? "",
          notes: data.specs?.details?.notes ?? "",
          comparisons: Array.isArray(data.specs?.details?.comparisons) ? data.specs.details.comparisons.join("\n") : data.specs?.details?.comparisons ?? "",
          weight: data.specs?.details?.weight ?? "",
          latency: data.specs?.details?.latency ?? "",
          switchType: data.specs?.details?.switchType ?? "",
          coating: data.specs?.details?.coating ?? "",
          shape: data.specs?.details?.shape ?? "",
          gripSmall: data.specs?.details?.gripSmall ?? "",
          gripMedium: data.specs?.details?.gripMedium ?? "",
          gripLarge: data.specs?.details?.gripLarge ?? "",
          ratingOverall: data.specs?.details?.ratings?.overall,
          ratingBuild: data.specs?.details?.ratings?.build,
          ratingSoftware: data.specs?.details?.ratings?.software,
          ratingBattery: data.specs?.details?.ratings?.battery,
          ratingPerformance: data.specs?.details?.ratings?.performance,
          ratingQc: data.specs?.details?.ratings?.qc,
          ratingValue: data.specs?.details?.ratings?.value,
          trimode: data.specs?.trimode ?? "",
          ...data.specs,
        })
        setSelectedTag(data.tags ?? [])
        if (data.image_url) setImagePreview(data.image_url)
      }

      try {
        const linksRes = await fetch(`/api/admin/peripherals/${peripheralId}/links`, { cache: "no-store" })
        const linksJson = (await linksRes.json().catch(() => null)) as { store?: LinkedProduct | null; bazaar?: LinkedProduct | null } | null
        if (linksRes.ok && linksJson) {
          setLinkedStore(linksJson.store ?? null)
          setLinkedBazaar(linksJson.bazaar ?? null)
        }
      } catch { /* ignore — links are optional */ }
    } catch (err) {
      const message = err instanceof Error ? err.message : (isEnglish ? "Failed to load peripheral" : "Erro ao carregar periférico")
      setError(message)
      toast.error(isEnglish ? "Failed to load peripheral" : "Erro ao carregar periférico", {
        description: message,
      })
    } finally {
      setLoadingPeripheral(false)
    }
  }

  async function onSubmit(data: PeripheralFormData): Promise<void> {
    try {
      setError(null)
      if (!selectedTag || selectedTag.length === 0) {
        const msg = isEnglish ? "Select a tag" : "Selecione uma tag"
        setError(msg)
        toast.error(msg)
        return
      }

      let imageUrl = imagePreview
      if (imageFile) {
        setUploading(true)
        const uploadForm = new FormData()
        uploadForm.set("file", imageFile)
        const uploadRes = await fetch("/api/admin/peripherals/upload-image", {
          method: "POST",
          body: uploadForm,
        })
        const uploadData = (await uploadRes.json().catch(() => null)) as { publicUrl?: string; error?: string; ok?: boolean } | null
        if (!uploadRes.ok || !uploadData?.publicUrl) {
          throw new Error(uploadData?.error ?? (isEnglish ? "Failed to upload image" : "Erro ao enviar imagem"))
        }
        imageUrl = uploadData.publicUrl
      }

      const splitLines = (value?: string) =>
        value ? value.split("\n").map((l) => l.trim()).filter(Boolean) : []

      const parseBuyLinks = (value?: string) =>
        splitLines(value).map((line) => {
          const [label, url] = line.split("|").map((p) => p.trim())
          return { label: url ? label || "Comprar" : "Comprar", url: url || label }
        })

      const ratings = {
        overall: data.ratingOverall, build: data.ratingBuild, software: data.ratingSoftware,
        battery: data.ratingBattery, performance: data.ratingPerformance, qc: data.ratingQc, value: data.ratingValue,
      }
      const cleanedRatings = Object.fromEntries(
        Object.entries(ratings).filter(([, v]) => typeof v === "number" && !Number.isNaN(v))
      )

      const specs = {
        mouseShape: data.mouseShape, keyboardLayout: data.keyboardLayout, keyboardType: data.keyboardType, connectivity: data.connectivity,
        trimode: data.trimode || undefined,
        size: data.size, surface: data.surface, padType: data.padType, driver: data.driver, profile: data.profile,
        refreshRate: typeof data.refreshRate === "number" && !Number.isNaN(data.refreshRate) ? data.refreshRate : undefined,
        panelType: data.panelType || undefined,
        details: {
          rankLabel: data.rankLabel || undefined, priceRange: data.priceRange || undefined,
          reviewUrl: data.reviewUrl || undefined, reviewNote: data.reviewNote || undefined,
          guideUrl: data.guideUrl || undefined, wikiUrl: data.wikiUrl || undefined,
          notesLong: data.notesLong || undefined,
          summary: data.summary || undefined, highlights: splitLines(data.highlights),
          pros: splitLines(data.pros), cons: splitLines(data.cons), gallery: splitLines(data.gallery),
          buyLinks: parseBuyLinks(data.buyLinks), compatibility: data.compatibility || undefined,
          notes: data.notes || undefined, comparisons: splitLines(data.comparisons),
          weight: data.weight || undefined, latency: data.latency || undefined,
          switchType: data.switchType || undefined, coating: data.coating || undefined,
          shape: data.shape || undefined, gripSmall: data.gripSmall || undefined,
          gripMedium: data.gripMedium || undefined, gripLarge: data.gripLarge || undefined,
          ratings: Object.keys(cleanedRatings).length > 0 ? cleanedRatings : undefined,
        },
      }

      let priceToSave = data.price
      if (locale === "pt-BR" && originalUsdPrice !== null && usdToBrl && usdToBrl > 0) {
        priceToSave = Number((data.price / usdToBrl).toFixed(2))
      }

      const peripheralData = {
        name: data.name, brand: data.brand, category: data.category,
        tier: data.tier === "__none__" ? null : data.tier,
        price: priceToSave, image_url: imageUrl, tags: selectedTag || [], specs,
      }

      let savedId: string | null = peripheralId ?? null

      if (peripheralId) {
        const res = await fetch(`/api/admin/peripherals/${peripheralId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(peripheralData),
        })
        const json = (await res.json().catch(() => null)) as { error?: string; field?: string; peripheral?: { id?: string } } | null
        if (!res.ok) {
          if (json?.field) {
            form.setError(json.field as any, { type: "server", message: json.error })
          }
          throw new Error(json?.error ?? (isEnglish ? "Failed to save" : "Erro ao salvar"))
        }
        savedId = json?.peripheral?.id ?? peripheralId
        toast.success(isEnglish ? "Peripheral updated" : "Periférico atualizado", {
          description: data.name,
        })
      } else {
        const res = await fetch("/api/admin/peripherals", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(peripheralData),
        })
        const json = (await res.json().catch(() => null)) as { error?: string; field?: string; peripheral?: { id?: string } } | null
        if (!res.ok) {
          if (json?.field) {
            form.setError(json.field as any, { type: "server", message: json.error })
          }
          throw new Error(json?.error ?? (isEnglish ? "Failed to save" : "Erro ao salvar"))
        }
        savedId = json?.peripheral?.id ?? null
        toast.success(isEnglish ? "Peripheral created" : "Periférico criado", {
          description: data.name,
        })
      }

      if (savedId) {
        const linkRes = await fetch(`/api/admin/peripherals/${savedId}/links`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            storeProductId: linkedStore?.id ?? null,
            bazaarProductId: linkedBazaar?.id ?? null,
          }),
        })
        if (!linkRes.ok) {
          const linkJson = (await linkRes.json().catch(() => null)) as { error?: string } | null
          throw new Error(linkJson?.error ?? (isEnglish ? "Failed to save linked products" : "Erro ao salvar produtos vinculados"))
        }
      }

      router.replace(backHref)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : (isEnglish ? "Failed to save" : "Erro ao salvar")
      setError(message)
      toast.error(isEnglish ? "Failed to save peripheral" : "Erro ao salvar periférico", {
        description: message,
      })
    } finally {
      setUploading(false)
    }
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onloadend = () => setImagePreview(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const toggleTag = (tag: Tag) =>
    setSelectedTag((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])

  const setRating = (field: keyof PeripheralFormData, value: number | undefined) => {
    form.setValue(field as any, value)
  }

  const watchedName = form.watch("name")
  const currentLabel = peripheralId
    ? (loadingPeripheral && !watchedName
        ? (isEnglish ? "Loading…" : "Carregando…")
        : watchedName || (isEnglish ? "Edit" : "Editar"))
    : (isEnglish ? "New" : "Novo")

  if (loadingPeripheral) {
    return (
      <div className="space-y-6 pb-10">
        <BackBreadcrumb href={backHref} parentLabel={parentLabel} currentLabel={currentLabel} />

        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card/40 py-20">
          <BoxLoader />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {isEnglish ? "Loading peripheral…" : "Carregando periférico…"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {isEnglish
                ? "Fetching saved info, image and specs."
                : "Buscando informações, imagem e especificações salvas."}
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-10">
      <BackBreadcrumb href={backHref} parentLabel={parentLabel} currentLabel={currentLabel} />

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

        {/* SECTION 1: Imagem */}
        <FormSection title={isEnglish ? "Image" : "Imagem"} icon={<ImageIcon className="size-4" />} defaultOpen>
          <div className="flex gap-4 items-start">
            {imagePreview && (
              <div className="relative w-28 h-28 rounded-xl border border-border overflow-hidden shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Preview" className="w-full h-full object-cover" src={imagePreview} />
              </div>
            )}
            <label className="flex-1 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-primary/40 hover:bg-muted/10 transition group">
              <input accept="image/*" className="hidden" onChange={handleImageSelect} type="file" />
              <div className="flex flex-col items-center gap-2 text-center">
                <Upload className="size-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                  {imagePreview
                    ? (isEnglish ? "Click to change image" : "Clique para trocar a imagem")
                    : (isEnglish ? "Click to upload image" : "Clique para enviar a imagem")}
                </p>
                <p className="text-xs text-muted-foreground/60">PNG, JPG, WebP</p>
              </div>
            </label>
          </div>
        </FormSection>

        {/* SECTION 2: Informações Básicas */}
        <FormSection title={isEnglish ? "Basic Info" : "Informações Básicas"} icon={<Info className="size-4" />} defaultOpen>
          <div className="space-y-4">
            {/* Category picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                {isEnglish ? "Category" : "Categoria"} <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-muted-foreground/80">
                {isEnglish
                  ? "Required. Pick one of the categories below — values are validated by the database."
                  : "Obrigatório. Escolha uma das categorias abaixo — os valores são validados pelo banco."}
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => form.setValue("category", cat.key, { shouldValidate: true })}
                    className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                      watchedCategory === cat.key
                        ? "border-primary bg-primary/10 text-foreground"
                        : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}
                  >
                    <span>{cat.emoji}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
              {form.formState.errors.category && (
                <p className="text-xs text-red-400">{form.formState.errors.category.message as string}</p>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {isEnglish ? "Name" : "Nome"} <span className="text-red-400">*</span>
                </label>
                <Input
                  className="border-border bg-background"
                  placeholder="G Pro X Superlight 2"
                  maxLength={200}
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register("name")}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  {isEnglish ? "1–200 characters" : "Entre 1 e 200 caracteres"}
                </p>
                {form.formState.errors.name && <p className="text-xs text-red-400">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {isEnglish ? "Brand" : "Marca"} <span className="text-red-400">*</span>
                </label>
                <Select value={form.watch("brand")} onValueChange={(value) => form.setValue("brand", value, { shouldValidate: true })}>
                  <SelectTrigger className="border-border bg-background" aria-invalid={!!form.formState.errors.brand}>
                    <SelectValue placeholder={isEnglish ? "Select a brand" : "Selecione uma marca"} />
                  </SelectTrigger>
                  <SelectContent>
                    {BRAND_OPTIONS.map((brand) => (
                      <SelectItem key={brand} value={brand}>
                        {brand}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground/60">
                  {isEnglish ? "Pick from the list above" : "Escolha uma das marcas da lista"}
                </p>
                {form.formState.errors.brand && <p className="text-xs text-red-400">{form.formState.errors.brand.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {isEnglish ? "Price (USD)" : "Preço (USD)"} <span className="text-red-400">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input
                  className="border-border bg-background pl-7"
                  placeholder="159.00"
                  type="number"
                  step="0.01"
                  min={0.01}
                  aria-invalid={!!form.formState.errors.price}
                  {...form.register("price", { valueAsNumber: true })}
                />
              </div>
              <p className="text-[10px] text-muted-foreground/60">
                {isEnglish
                  ? "Use a positive value in US dollars (e.g. 159.00). It will be converted automatically."
                  : "Use um valor positivo em dólares (ex: 159.00). A conversão é feita automaticamente."}
              </p>
              {form.formState.errors.price && <p className="text-xs text-red-400">{form.formState.errors.price.message}</p>}
            </div>
          </div>
        </FormSection>

        {/* SECTION 3: Tier */}
        <FormSection title="Tier" icon={<Layers className="size-4" />} defaultOpen>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{isEnglish ? "Select the tier that best represents this peripheral's performance" : "Selecione o tier que melhor representa a performance deste periférico"}</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => form.setValue("tier", "__none__")}
                className={`rounded-lg border px-4 py-2 text-sm font-bold transition-all ${
                  watchedTier === "__none__"
                    ? "border-border bg-muted text-foreground"
                    : "border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                }`}
              >
                {isEnglish ? "Under Review" : "Sob Revisão"}
              </button>
              {TIER_OPTIONS.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => form.setValue("tier", t.key)}
                  className={`rounded-lg border px-5 py-2 text-sm font-black transition-all ${t.color} ${
                    watchedTier === t.key ? "scale-105 shadow-md" : "opacity-60 hover:opacity-100"
                  }`}
                >
                  {t.key}
                </button>
              ))}
            </div>
          </div>
        </FormSection>

        {/* SECTION 4: Tags */}
        <FormSection title="Tag" icon={<Tag className="size-4" />} defaultOpen>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              {isEnglish
                ? "Required — select at least one tag describing this peripheral."
                : "Obrigatório — selecione ao menos uma tag que descreva este periférico."}
            </p>
            <div className="flex flex-wrap gap-2">
              {TAGS_OPTIONS.map((tag) => {
                const active = selectedTag.includes(tag.key)
                return (
                  <button
                    key={tag.key}
                    type="button"
                    data-active={active}
                    onClick={() => toggleTag(tag.key)}
                    className={`rounded-lg border px-4 py-2 text-sm font-semibold transition-all ${tag.color} ${active ? "scale-105 shadow-sm" : "opacity-60 hover:opacity-100"}`}
                  >
                      {isEnglish ? tag.en : tag.pt}
                    {active && " ✓"}
                  </button>
                )
              })}
            </div>
            {selectedTag.length === 0 && (
              <p className="text-xs text-red-400">{isEnglish ? "Select at least one tag." : "Selecione pelo menos uma tag."}</p>
            )}
          </div>
        </FormSection>

        {/* SECTION 5: Ratings */}
        <FormSection
          title={isEnglish ? "Ratings (0–6)" : "Notas (0–6)"}
          icon={
            <div className="flex items-center gap-1">
              <span className="w-4 h-1 rounded bg-red-600" />
              <span className="w-4 h-1 rounded bg-yellow-400" />
              <span className="w-4 h-1 rounded bg-zinc-400" />
              <span className="w-4 h-1 rounded bg-green-600" />
              <span className="w-4 h-1 rounded bg-sky-500" />
              <span className="w-4 h-1 rounded bg-purple-600" />
            </div>
          }
          defaultOpen={false}
        >
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {isEnglish
                ? "Rate each aspect from 1 (worst) to 6 (best). Click × to clear a rating."
                : "Avalie cada aspecto de 1 (pior) a 6 (melhor). Clique × para limpar."}
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {RATING_FIELDS.map((field) => (
                <RatingInput
                  key={field.key}
                  label={isEnglish ? field.label : field.ptLabel}
                  value={form.watch(field.key) as number | undefined}
                  onChange={(v) => setRating(field.key, v)}
                />
              ))}
            </div>
          </div>
        </FormSection>

        {/* SECTION 6: Specs por categoria */}
        <FormSection title={isEnglish ? "Technical Specs" : "Especificações Técnicas"} icon={<FileText className="size-4" />} defaultOpen>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {watchedCategory === "mouse" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Shape" : "Formato"}</label>
                  <Select value={form.watch("mouseShape") || ""} onValueChange={(v) => form.setValue("mouseShape", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select shape" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="symmetrical">Symmetrical</SelectItem>
                      <SelectItem value="ergonomic">Ergonomic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Connectivity" : "Conectividade"}</label>
                  <Select value={form.watch("connectivity") || ""} onValueChange={(v) => form.setValue("connectivity", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wired">{isEnglish ? "Wired" : "Com fio"}</SelectItem>
                      <SelectItem value="wireless">{isEnglish ? "Wireless" : "Sem fio"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trimode</label>
                  <Select value={form.watch("trimode") || ""} onValueChange={(v) => form.setValue("trimode", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{isEnglish ? "Yes" : "Sim"}</SelectItem>
                      <SelectItem value="no">{isEnglish ? "No" : "Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Size" : "Tamanho"}</label>
                  <Select value={form.watch("size") || ""} onValueChange={(v) => form.setValue("size", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fingertip">Fingertip</SelectItem>
                      <SelectItem value="small">{isEnglish ? "Small" : "Pequeno"}</SelectItem>
                      <SelectItem value="medium">{isEnglish ? "Medium" : "Médio"}</SelectItem>
                      <SelectItem value="large">{isEnglish ? "Large" : "Grande"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sensor</label>
                  <Input className="border-border bg-background" placeholder="HERO 2, PMW 3395" {...form.register("driver")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Weight" : "Peso"}</label>
                  <Input className="border-border bg-background" placeholder="61g" {...form.register("weight")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Latency" : "Latência"}</label>
                  <Input className="border-border bg-background" placeholder="0.62ms" {...form.register("latency")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Switch</label>
                  <Select value={form.watch("switchType") || ""} onValueChange={(v) => form.setValue("switchType", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="magnetic">{isEnglish ? "Magnetic" : "Magnético"}</SelectItem>
                      <SelectItem value="optical">{isEnglish ? "Optical" : "Óptico"}</SelectItem>
                      <SelectItem value="mechanical">{isEnglish ? "Mechanical" : "Mecânico"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coating</label>
                  <Select value={form.watch("coating") || ""} onValueChange={(v) => form.setValue("coating", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      {COATING_OPTIONS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2 grid grid-cols-3 gap-3">
                  {[
                    { field: "gripSmall", label: isEnglish ? "Grip · Small hand" : "Grip · Mão pequena" },
                    { field: "gripMedium", label: isEnglish ? "Grip · Medium hand" : "Grip · Mão média" },
                    { field: "gripLarge", label: isEnglish ? "Grip · Large hand" : "Grip · Mão grande" },
                  ].map(({ field, label }) => (
                    <div key={field} className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" type="button" className="w-full justify-between">
                            <span className="line-clamp-1">
                              {(form.watch(field as any) || "") || (isEnglish ? "Select" : "Selecione")}
                            </span>
                            <ChevronDown className="size-4 text-muted-foreground" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          {(["Não recomendado", "Finger", "Claw", "Palm"]).map((opt) => {
                            const current: string = String(form.watch(field as any) ?? "")
                            const selected = current.split("/").map((s: string) => s.trim().toLowerCase()).filter(Boolean).includes(opt.toLowerCase())
                            const specialOptions = ["Não recomendado"]
                            const isSpecial = specialOptions.some((v) => v.toLowerCase() === opt.toLowerCase())
                            return (
                              <DropdownMenuCheckboxItem
                                key={opt}
                                checked={selected}
                                onCheckedChange={(checked) => {
                                  const isChecked = checked === true
                                  const currArr: string[] = String(form.getValues(field as any) ?? "").split("/").map((s: string) => s.trim()).filter(Boolean)
                                  if (isChecked && isSpecial) {
                                    form.setValue(field as any, opt)
                                    return
                                  }
                                  let next = currArr
                                  if (isChecked) {
                                    next = Array.from(new Set([
                                      ...currArr.filter((c: string) => !specialOptions.some((v) => v.toLowerCase() === c.toLowerCase())),
                                      opt,
                                    ]))
                                  } else {
                                    next = currArr.filter((c: string) => c.toLowerCase() !== opt.toLowerCase())
                                  }
                                  form.setValue(field as any, next.join(" / "))
                                }}
                              >
                                {opt}
                              </DropdownMenuCheckboxItem>
                            )
                          })}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </>
            )}

            {watchedCategory === "keyboard" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layout</label>
                  <Select value={form.watch("keyboardLayout") || ""} onValueChange={(v) => form.setValue("keyboardLayout", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select layout" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      {["60%", "65%", "75%", "TKL", "Full-size"].map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Connectivity" : "Conectividade"}</label>
                  <Select value={form.watch("connectivity") || ""} onValueChange={(v) => form.setValue("connectivity", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wired">{isEnglish ? "Wired" : "Com fio"}</SelectItem>
                      <SelectItem value="wireless">{isEnglish ? "Wireless" : "Sem fio"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trimode</label>
                  <Select value={form.watch("trimode") || ""} onValueChange={(v) => form.setValue("trimode", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{isEnglish ? "Yes" : "Sim"}</SelectItem>
                      <SelectItem value="no">{isEnglish ? "No" : "Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</label>
                  <Input className="border-border bg-background" placeholder="Rapid Trigger, Hall Effect" {...form.register("profile")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</label>
                  <Select value={form.watch("keyboardType") || ""} onValueChange={(v) => form.setValue("keyboardType", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mechanical">{isEnglish ? "Mechanical" : "Mecânico"}</SelectItem>
                      <SelectItem value="optical">{isEnglish ? "Optical" : "Óptico"}</SelectItem>
                      <SelectItem value="magnetic">{isEnglish ? "Magnetic" : "Magnético"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Switch</label>
                  <Input className="border-border bg-background" placeholder={isEnglish ? "Linear, Tactile, Clicky" : "Linear, Tátil, Clicky"} {...form.register("switchType")} />
                </div>
              </>
            )}

            {(watchedCategory === "mousepad" || watchedCategory === "glasspad") && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Surface</label>
                  <Select value={form.watch("surface") || ""} onValueChange={(v) => form.setValue("surface", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select surface" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloth">Cloth</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="glass">Glass</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Profile</label>
                  <Input className="border-border bg-background" placeholder="Control / Speed" {...form.register("profile")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Pad type</label>
                  <Select value={form.watch("padType") || ""} onValueChange={(v) => form.setValue("padType", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="speed">Speed</SelectItem>
                      <SelectItem value="control">Control</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Size" : "Tamanho"}</label>
                  <Input className="border-border bg-background" placeholder="480×400mm, XL" {...form.register("size")} />
                </div>
              </>
            )}

            {watchedCategory === "monitors" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Refresh rate (Hz)</label>
                  <Input className="border-border bg-background" placeholder="144" type="number" step="1" {...form.register("refreshRate", { valueAsNumber: true })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Panel</label>
                  <Select value={form.watch("panelType") || ""} onValueChange={(v) => form.setValue("panelType", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select panel" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ips">IPS</SelectItem>
                      <SelectItem value="tn">TN</SelectItem>
                      <SelectItem value="va">VA</SelectItem>
                      <SelectItem value="oled">OLED</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {watchedCategory === "dac_amp" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connectivity</label>
                  <Select value={form.watch("connectivity") || ""} onValueChange={(v) => form.setValue("connectivity", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wired">{isEnglish ? "Wired" : "Com fio"}</SelectItem>
                      <SelectItem value="wireless">{isEnglish ? "Wireless" : "Sem fio"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trimode</label>
                  <Select value={form.watch("trimode") || ""} onValueChange={(v) => form.setValue("trimode", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{isEnglish ? "Yes" : "Sim"}</SelectItem>
                      <SelectItem value="no">{isEnglish ? "No" : "Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {(watchedCategory === "iem" || watchedCategory === "headset") && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Connectivity" : "Conectividade"}</label>
                  <Select value={form.watch("connectivity") || ""} onValueChange={(v) => form.setValue("connectivity", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wired">{isEnglish ? "Wired" : "Com fio"}</SelectItem>
                      <SelectItem value="wireless">{isEnglish ? "Wireless" : "Sem fio"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trimode</label>
                  <Select value={form.watch("trimode") || ""} onValueChange={(v) => form.setValue("trimode", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={isEnglish ? "Select" : "Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{isEnglish ? "Yes" : "Sim"}</SelectItem>
                      <SelectItem value="no">{isEnglish ? "No" : "Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{isEnglish ? "Compatibility" : "Compatibilidade"}</label>
                  <Input className="border-border bg-background" placeholder="Windows, macOS, PS5" {...form.register("compatibility")} />
                </div>
              </>
            )}
          </div>
        </FormSection>

        {/* SECTION 7: Wiki / Conteúdo */}
        <FormSection title={isEnglish ? "Wiki Content" : "Conteúdo da Wiki"} icon={<FileText className="size-4" />} defaultOpen={false}>
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
              <label className="text-sm font-medium text-foreground">
                {isEnglish ? "External wiki URL (optional)" : "URL da wiki externa (opcional)"}
              </label>
              <Input
                className="border-border bg-background"
                placeholder="https://wiki.exemplo.com/produto"
                {...form.register("wikiUrl")}
              />
              <p className="text-[11px] text-muted-foreground">
                {isEnglish
                  ? "When filled, the public page shows a single link to this external wiki instead of the editorial content below."
                  : "Quando preenchido, a página pública mostra apenas um botão para a wiki externa, no lugar do conteúdo editorial abaixo."}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{isEnglish ? "Summary" : "Resumo"}</label>
                <Input className="border-border bg-background" placeholder={isEnglish ? "One-line description" : "Descrição em uma linha"} {...form.register("summary")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{isEnglish ? "Rank label" : "Label de rank"}</label>
                <Input className="border-border bg-background" placeholder="GOAT, Top S, Solid A" {...form.register("rankLabel")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{isEnglish ? "Price range" : "Faixa de preço"}</label>
                <Input className="border-border bg-background" placeholder="R$1050–1130" {...form.register("priceRange")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{isEnglish ? "Compatibility" : "Compatibilidade"}</label>
                <Input className="border-border bg-background" placeholder="Windows, macOS, PS5" {...form.register("compatibility")} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{isEnglish ? "Review URL" : "URL do Review"}</label>
                <Input className="border-border bg-background" placeholder="https://youtube.com/..." {...form.register("reviewUrl")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{isEnglish ? "Guide URL" : "URL do Guia"}</label>
                <Input className="border-border bg-background" placeholder="https://..." {...form.register("guideUrl")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{isEnglish ? "Review note" : "Nota do review"}</label>
              <Textarea className="border-border bg-background resize-none" placeholder={isEnglish ? "Short observation about the review" : "Observação curta sobre o review"} rows={2} {...form.register("reviewNote")} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { field: "highlights", label: isEnglish ? "Highlights" : "Destaques" },
                { field: "comparisons", label: isEnglish ? "Comparisons" : "Comparações" },
                { field: "pros", label: "Pros" },
                { field: "cons", label: "Cons" },
              ].map(({ field, label }) => (
                <div key={field} className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <Textarea
                    className="border-border bg-background resize-none"
                    placeholder={isEnglish ? "One per line" : "Um por linha"}
                    rows={4}
                    {...form.register(field as any)}
                  />
                  <p className="text-[10px] text-muted-foreground">{isEnglish ? "Each line becomes a separate item" : "Cada linha vira um item separado"}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{isEnglish ? "Gallery URLs" : "URLs da Galeria"}</label>
              <Textarea className="border-border bg-background resize-none" placeholder={isEnglish ? "One image URL per line" : "Uma URL de imagem por linha"} rows={4} {...form.register("gallery")} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{isEnglish ? "Notes (extended)" : "Notas (estendidas)"}</label>
              <Textarea className="border-border bg-background resize-none" placeholder={isEnglish ? "Main notes and context" : "Notas principais e contexto"} rows={5} {...form.register("notesLong")} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{isEnglish ? "Extra notes" : "Notas extras"}</label>
              <Textarea className="border-border bg-background resize-none" placeholder={isEnglish ? "Additional observations" : "Observações adicionais"} rows={3} {...form.register("notes")} />
            </div>
          </div>
        </FormSection>

        {/* SECTION: Produtos vinculados */}
        <FormSection title={isEnglish ? "Linked Products" : "Produtos Vinculados"} icon={<Link2 className="size-4" />} defaultOpen={false}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {isEnglish
                ? "Tie this peripheral to a Loja product and/or a Bazar item. The link is shown on the public peripheral page, and Loja/Bazar pages cross-reference each other via this peripheral."
                : "Vincule este periférico a um produto da Loja e/ou item do Bazar. O vínculo aparece na página do periférico, e as páginas da Loja e do Bazar mostram o item correspondente do outro lado."}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{isEnglish ? "Linked Loja product" : "Produto da Loja vinculado"}</label>
                <LinkedProductPicker
                  kind="store"
                  value={linkedStore}
                  onChange={setLinkedStore}
                  excludeId={linkedBazaar?.id ?? null}
                  isEnglish={isEnglish}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{isEnglish ? "Linked Bazar item" : "Item do Bazar vinculado"}</label>
                <LinkedProductPicker
                  kind="bazaar"
                  value={linkedBazaar}
                  onChange={setLinkedBazaar}
                  excludeId={linkedStore?.id ?? null}
                  isEnglish={isEnglish}
                />
              </div>
            </div>
          </div>
        </FormSection>

        {/* SECTION 8: Links de compra */}
        <FormSection title={isEnglish ? "Buy Links" : "Links de Compra"} icon={<ShoppingCart className="size-4" />} defaultOpen={false}>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              {isEnglish
                ? "Format: Label | https://... — one per line. Example: Amazon | https://amazon.com/..."
                : "Formato: Label | https://... — um por linha. Exemplo: Amazon | https://amazon.com/..."}
            </p>
            <Textarea
              className="border-border bg-background font-mono text-xs resize-none"
              placeholder={"Amazon | https://amazon.com/...\nMercado Livre | https://mercadolivre.com/..."}
              rows={5}
              {...form.register("buyLinks")}
            />
          </div>
        </FormSection>

        {/* Footer actions */}
        <div className="flex gap-3 justify-end pt-2">
          <Link href={backHref}>
            <Button variant="outline">{isEnglish ? "Cancel" : "Cancelar"}</Button>
          </Link>
          <Button disabled={uploading || form.formState.isSubmitting} type="submit" className="min-w-28">
            {uploading || form.formState.isSubmitting
              ? (isEnglish ? "Saving..." : "Salvando...")
              : peripheralId
                ? (isEnglish ? "Save changes" : "Salvar alterações")
                : (isEnglish ? "Create peripheral" : "Criar periférico")}
          </Button>
        </div>
      </form>
    </div>
  )
}
