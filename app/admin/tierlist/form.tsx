"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import { Upload, ChevronDown, ChevronUp, ImageIcon, Tag, Layers, FileText, ShoppingCart, Info, Link2, Search, X, Scissors, RotateCcw, Loader2 } from "lucide-react"
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
import { useT } from "@/lib/use-t"
import { removeBackground, fileToDataUrl } from "@/lib/client/remove-background"

type Category = "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierField = Tier | "__none__"
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado"

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
  ranking: z.coerce.number().int().positive().optional(),
  score: z.coerce.number().min(0).optional(),
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
  ratingMaintenance: z.number().min(0).max(6).optional(),
  mouseShape: z.string().optional(),
  keyboardLayout: z.string().optional(),
  keyboardPlate: z.string().optional(),
  keyboardCase: z.string().optional(),
  hotSwap: z.string().optional(),
  connectivity: z.string().optional(),
  size: z.string().optional(),
  surface: z.string().optional(),
  padType: z.string().optional(),
  driver: z.string().optional(),
  profile: z.string().optional(),
  keyboardType: z.string().optional(),
  trimode: z.string().optional(),
  deadzone: z.string().optional(),
  rtMin: z.string().optional(),
  features: z.string().optional(),
  refreshRate: z.preprocess(
    (value) => (value === "" || value === null || Number.isNaN(value) ? undefined : value),
    z.number().positive().optional()
  ),
  panelType: z.string().optional(),
  glide: z.string().optional(),
  padSpeed: z.string().optional(),
  stoppingPower: z.string().optional(),
  thickness: z.string().optional(),
  surfaceMaterial: z.string().optional(),
  hasBattery: z.boolean().optional(),
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
  { key: "stable", en: "Stable", pt: "Estável", color: "border-teal-400/50 bg-teal-500/10 text-teal-300 data-[active=true]:bg-teal-500/30 data-[active=true]:border-teal-400" },
  { key: "unstable", en: "Unstable", pt: "Instável", color: "border-orange-400/50 bg-orange-500/10 text-orange-300 data-[active=true]:bg-orange-500/30 data-[active=true]:border-orange-400" },
  { key: "8_80", en: "8 80", pt: "8 80", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400" },
  { key: "poron", en: "Poron", pt: "Poron", color: "border-purple-400/50 bg-purple-500/10 text-purple-300 data-[active=true]:bg-purple-500/30 data-[active=true]:border-purple-400" },
  { key: "borracha", en: "Rubber", pt: "Borracha", color: "border-zinc-400/50 bg-zinc-500/10 text-zinc-300 data-[active=true]:bg-zinc-500/30 data-[active=true]:border-zinc-400" },
  { key: "grosso", en: "Thick", pt: "Grosso", color: "border-amber-400/50 bg-amber-500/10 text-amber-300 data-[active=true]:bg-amber-500/30 data-[active=true]:border-amber-400" },
  { key: "fino", en: "Thin", pt: "Fino", color: "border-cyan-400/50 bg-cyan-500/10 text-cyan-300 data-[active=true]:bg-cyan-500/30 data-[active=true]:border-cyan-400" },
  { key: "rapido", en: "Fast", pt: "Rápido", color: "border-green-400/50 bg-green-500/10 text-green-300 data-[active=true]:bg-green-500/30 data-[active=true]:border-green-400" },
  { key: "devagar", en: "Slow", pt: "Devagar", color: "border-sky-400/50 bg-sky-500/10 text-sky-300 data-[active=true]:bg-sky-500/30 data-[active=true]:border-sky-400" },
  { key: "hibrido", en: "Hybrid", pt: "Híbrido", color: "border-teal-400/50 bg-teal-500/10 text-teal-300 data-[active=true]:bg-teal-500/30 data-[active=true]:border-teal-400" },
  { key: "aspero", en: "Rough", pt: "Áspero", color: "border-stone-400/50 bg-stone-500/10 text-stone-300 data-[active=true]:bg-stone-500/30 data-[active=true]:border-stone-400" },
  { key: "liso", en: "Smooth", pt: "Liso", color: "border-sky-400/50 bg-sky-500/10 text-sky-300 data-[active=true]:bg-sky-500/30 data-[active=true]:border-sky-400" },
  { key: "mug", en: "Mug", pt: "Mug", color: "border-amber-400/50 bg-amber-500/10 text-amber-300 data-[active=true]:bg-amber-500/30 data-[active=true]:border-amber-400" },
  { key: "macio", en: "Soft", pt: "Macio", color: "border-pink-400/50 bg-pink-500/10 text-pink-300 data-[active=true]:bg-pink-500/30 data-[active=true]:border-pink-400" },
  { key: "afetado_umidade", en: "Moisture affected", pt: "Afetado por umidade", color: "border-blue-400/50 bg-blue-500/10 text-blue-300 data-[active=true]:bg-blue-500/30 data-[active=true]:border-blue-400" },
  { key: "ultrapassado", en: "Outdated", pt: "Ultrapassado", color: "border-gray-400/50 bg-gray-500/10 text-gray-300 data-[active=true]:bg-gray-500/30 data-[active=true]:border-gray-400" },
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
  "Epomaker",
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
  "Madlions",
  "MCHOSE",
  "Mechlands",
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
  "WLMouse",
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
  { key: "ratingMaintenance", label: "Maintenance", ptLabel: "Manutenção" },
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
  t,
}: {
  kind: "store" | "bazaar"
  value: LinkedProduct | null
  onChange: (product: LinkedProduct | null) => void
  excludeId: string | null
  t: ReturnType<typeof useT>
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
    ? t.admin.tierlistForm.pickerSearchStore
    : t.admin.tierlistForm.pickerSearchBazaar

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
              placeholder={t.admin.tierlistForm.pickerTypeToFilter}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="border-border bg-background"
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {t.admin.tierlistForm.pickerClose}
            </Button>
          </div>
          <div className="max-h-56 overflow-auto rounded-md border border-border/60 bg-background/40">
            {loading ? (
              <p className="p-3 text-xs text-muted-foreground">{t.admin.tierlistForm.pickerLoading}</p>
            ) : visible.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{t.admin.tierlistForm.pickerNoItems}</p>
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
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const backHref = pathname?.startsWith("/admin/perifericos") ? "/admin/perifericos" : "/admin/tierlist"
  const parentLabel = pathname?.startsWith("/admin/perifericos")
    ? t.admin.tierlistForm.parentPeripherals
    : t.admin.tierlistForm.parentTierlist
  const [uploading, setUploading] = useState(false)
  const [loadingPeripheral, setLoadingPeripheral] = useState(Boolean(peripheralId))
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  // Guarda o original e o recorte para permitir alternar entre eles.
  const [originalImage, setOriginalImage] = useState<{ file: File; preview: string } | null>(null)
  const [processedImage, setProcessedImage] = useState<{ file: File; preview: string } | null>(null)
  const [bgRemoved, setBgRemoved] = useState(false)
  const [removingBg, setRemovingBg] = useState(false)
  const [selectedTag, setSelectedTag] = useState<Tag[]>([])
  const [error, setError] = useState<string | null>(null)
  const [usdToBrl, setUsdToBrl] = useState<number | null>(null)
  const [originalUsdPrice, setOriginalUsdPrice] = useState<number | null>(null)
  const [linkedStore, setLinkedStore] = useState<LinkedProduct | null>(null)
  const [linkedBazaar, setLinkedBazaar] = useState<LinkedProduct | null>(null)
  const [rankedPeripherals, setRankedPeripherals] = useState<{ id: string; name: string; tier: string; ranking: number; score: number | null }[]>([])

  const form = useForm<PeripheralFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(peripheralSchema) as any,
    defaultValues: {
      name: "",
      brand: "",
      category: "mouse",
      tier: "__none__",
      price: 0,
      rankLabel: "", ranking: undefined, score: undefined, priceRange: "", reviewUrl: "", reviewNote: "", guideUrl: "", wikiUrl: "",
      notesLong: "", summary: "", highlights: "", pros: "", cons: "", gallery: "",
      buyLinks: "", compatibility: "", notes: "", comparisons: "",
      weight: "", latency: "", switchType: "", coating: "", shape: "",
      gripSmall: "", gripMedium: "", gripLarge: "",
      ratingOverall: undefined, ratingBuild: undefined, ratingSoftware: undefined,
      ratingBattery: undefined, ratingPerformance: undefined, ratingQc: undefined, ratingValue: undefined, ratingMaintenance: undefined,
      hasBattery: undefined,
      keyboardType: "", keyboardPlate: "", keyboardCase: "", hotSwap: "",
      trimode: "",
      deadzone: "",
      rtMin: "",
      features: "",
      padType: "",
      refreshRate: undefined,
      panelType: "",
      glide: "",
      padSpeed: "",
      stoppingPower: "",
      thickness: "",
    },
  })

  const watchedTier = form.watch("tier")
  const watchedCategory = form.watch("category")

  usePageHeader(
    peripheralId ? t.admin.tierlistForm.headerEdit : t.admin.tierlistForm.headerNew,
    peripheralId
      ? t.admin.tierlistForm.headerEditDesc
      : t.admin.tierlistForm.headerNewDesc
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

  useEffect(() => {
    if (!watchedCategory) return
    fetch(`/api/admin/peripherals?category=${watchedCategory}`)
      .then((r) => r.json())
      .then((json) => {
        const list = (json.peripherals ?? json.data ?? json ?? []) as { id: string; name: string; tier?: string; specs?: Record<string, any> }[]
        const all = list.map((p) => ({
          id: p.id,
          name: p.name,
          tier: p.tier ?? "",
          ranking: Number(p.specs?.details?.ranking) || 0,
          score: p.specs?.details?.score != null ? Number(p.specs.details.score) : null,
        }))
        all.sort((a, b) => {
          if (a.ranking > 0 && b.ranking > 0) return a.ranking - b.ranking
          if (a.ranking > 0) return -1
          if (b.ranking > 0) return 1
          return a.name.localeCompare(b.name)
        })
        setRankedPeripherals(all)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedCategory])

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
      if (!res.ok || !json?.peripheral) throw new Error(json?.error ?? t.admin.tierlistForm.failedLoadPeripheral)
      const data = json.peripheral
      if (data) {
        setOriginalUsdPrice(data.price)
        const displayedPrice = locale === "pt-BR" && usdToBrl ? Number((data.price * usdToBrl).toFixed(2)) : data.price
        form.reset({
          name: data.name, brand: data.brand, category: data.category,
          tier: data.tier ? mapTier(data.tier) : "__none__",
          price: displayedPrice,
          rankLabel: data.specs?.details?.rankLabel ?? "",
          ranking: data.specs?.details?.ranking ? Number(data.specs.details.ranking) : undefined,
          score: data.specs?.details?.score != null ? Number(data.specs.details.score) : undefined,
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
          deadzone: data.specs?.details?.deadzone ?? "",
          rtMin: data.specs?.details?.rtMin ?? "",
          features: data.specs?.details?.features ?? "",
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
          ratingMaintenance: data.specs?.details?.ratings?.maintenance,
          hasBattery: data.specs?.hasBattery ?? undefined,
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
      const message = err instanceof Error ? err.message : t.admin.tierlistForm.failedLoadPeripheral
      setError(message)
      toast.error(t.admin.tierlistForm.failedLoadPeripheral, {
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
        const msg = t.admin.tierlistForm.selectTag
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
          throw new Error(uploadData?.error ?? t.admin.tierlistForm.failedUploadImage)
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
        maintenance: data.ratingMaintenance,
      }
      const cleanedRatings = Object.fromEntries(
        Object.entries(ratings).filter(([, v]) => typeof v === "number" && !Number.isNaN(v))
      )

      const specs = {
        mouseShape: data.mouseShape, keyboardLayout: data.keyboardLayout, keyboardType: data.keyboardType,
        keyboardPlate: data.keyboardPlate || undefined, keyboardCase: data.keyboardCase || undefined, hotSwap: data.hotSwap || undefined,
        connectivity: data.connectivity,
        trimode: data.trimode || undefined,
        size: data.size, surface: data.surface, padType: data.padType, driver: data.driver, profile: data.profile,
        glide: data.glide || undefined, padSpeed: data.padSpeed || undefined,
        stoppingPower: data.stoppingPower || undefined, thickness: data.thickness || undefined,
        surfaceMaterial: data.surfaceMaterial || undefined,
        hasBattery: data.hasBattery ?? undefined,
        refreshRate: typeof data.refreshRate === "number" && !Number.isNaN(data.refreshRate) ? data.refreshRate : undefined,
        panelType: data.panelType || undefined,
        details: {
          rankLabel: data.rankLabel || undefined, ranking: data.ranking || undefined, score: data.score ?? undefined, priceRange: data.priceRange || undefined,
          reviewUrl: data.reviewUrl || undefined, reviewNote: data.reviewNote || undefined,
          guideUrl: data.guideUrl || undefined, wikiUrl: data.wikiUrl || undefined,
          notesLong: data.notesLong || undefined,
          summary: data.summary || undefined, highlights: splitLines(data.highlights),
          pros: splitLines(data.pros), cons: splitLines(data.cons), gallery: splitLines(data.gallery),
          buyLinks: parseBuyLinks(data.buyLinks), compatibility: data.compatibility || undefined,
          notes: data.notes || undefined, comparisons: splitLines(data.comparisons),
          weight: data.weight || undefined, latency: data.latency || undefined,
          deadzone: data.deadzone || undefined, rtMin: data.rtMin || undefined,
          features: data.features || undefined,
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
          throw new Error(json?.error ?? t.admin.tierlistForm.failedSave)
        }
        savedId = json?.peripheral?.id ?? peripheralId
        toast.success(t.admin.tierlistForm.updated, {
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
          throw new Error(json?.error ?? t.admin.tierlistForm.failedSave)
        }
        savedId = json?.peripheral?.id ?? null
        toast.success(t.admin.tierlistForm.created, {
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
          throw new Error(linkJson?.error ?? t.admin.tierlistForm.failedSaveLinked)
        }
      }

      router.replace(backHref)
      router.refresh()
    } catch (err) {
      const message = err instanceof Error ? err.message : t.admin.tierlistForm.failedSave
      setError(message)
      toast.error(t.admin.tierlistForm.failedSavePeripheral, {
        description: message,
      })
    } finally {
      setUploading(false)
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reseta o input para permitir reenviar o mesmo arquivo.
    e.target.value = ""
    if (!file) return

    // Mostra o original imediatamente.
    const originalPreview = await fileToDataUrl(file)
    setOriginalImage({ file, preview: originalPreview })
    setProcessedImage(null)
    setImageFile(file)
    setImagePreview(originalPreview)
    setBgRemoved(false)

    // Tenta remover o fundo automaticamente.
    setRemovingBg(true)
    try {
      const result = await removeBackground(file)
      const resultPreview = await fileToDataUrl(result)
      setProcessedImage({ file: result, preview: resultPreview })
      setImageFile(result)
      setImagePreview(resultPreview)
      setBgRemoved(true)
    } catch (err) {
      console.error("Falha ao remover o fundo:", err)
      toast.error(t.admin.tierlistForm.failedRemoveBg)
    } finally {
      setRemovingBg(false)
    }
  }

  const toggleBackground = async () => {
    if (!originalImage || removingBg) return

    if (bgRemoved) {
      // Volta para a imagem original.
      setImageFile(originalImage.file)
      setImagePreview(originalImage.preview)
      setBgRemoved(false)
      return
    }

    // Reaplica o recorte (reaproveita se já foi calculado).
    if (processedImage) {
      setImageFile(processedImage.file)
      setImagePreview(processedImage.preview)
      setBgRemoved(true)
      return
    }

    setRemovingBg(true)
    try {
      const result = await removeBackground(originalImage.file)
      const resultPreview = await fileToDataUrl(result)
      setProcessedImage({ file: result, preview: resultPreview })
      setImageFile(result)
      setImagePreview(resultPreview)
      setBgRemoved(true)
    } catch (err) {
      console.error("Falha ao remover o fundo:", err)
      toast.error(t.admin.tierlistForm.failedRemoveBg)
    } finally {
      setRemovingBg(false)
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
        ? t.admin.tierlistForm.currentLoading
        : watchedName || t.admin.tierlistForm.currentEdit)
    : t.admin.tierlistForm.currentNew

  if (loadingPeripheral) {
    return (
      <div className="space-y-6 pb-10">
        <BackBreadcrumb href={backHref} parentLabel={parentLabel} currentLabel={currentLabel} />

        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card/40 py-20">
          <BoxLoader />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              {t.admin.tierlistForm.loadingPeripheral}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t.admin.tierlistForm.loadingPeripheralDesc}
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
        <FormSection title={t.admin.tierlistForm.sectionImage} icon={<ImageIcon className="size-4" />} defaultOpen>
          <div className="flex flex-col gap-3">
            <div className="flex gap-4 items-start">
              {imagePreview && (
                <div
                  className="relative w-28 h-28 rounded-xl border border-border overflow-hidden shrink-0"
                  style={{
                    backgroundImage:
                      "conic-gradient(#0000 90deg, #80808022 0 180deg, #0000 0 270deg, #80808022 0)",
                    backgroundSize: "16px 16px",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Preview" className="w-full h-full object-contain" src={imagePreview} />
                  {removingBg && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                      <Loader2 className="size-5 animate-spin text-foreground" />
                    </div>
                  )}
                </div>
              )}
              <label className="flex-1 border-2 border-dashed border-border rounded-xl p-6 cursor-pointer hover:border-primary/40 hover:bg-muted/10 transition group">
                <input accept="image/*" className="hidden" onChange={handleImageSelect} type="file" />
                <div className="flex flex-col items-center gap-2 text-center">
                  <Upload className="size-6 text-muted-foreground group-hover:text-foreground transition-colors" />
                  <p className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">
                    {imagePreview
                      ? t.admin.tierlistForm.clickChangeImage
                      : t.admin.tierlistForm.clickUploadImage}
                  </p>
                  <p className="text-xs text-muted-foreground/60">PNG, JPG, WebP</p>
                </div>
              </label>
            </div>

            {originalImage && (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={removingBg}
                  onClick={toggleBackground}
                  className="gap-1.5"
                >
                  {removingBg ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : bgRemoved ? (
                    <RotateCcw className="size-3.5" />
                  ) : (
                    <Scissors className="size-3.5" />
                  )}
                  {removingBg
                    ? t.admin.tierlistForm.removingBg
                    : bgRemoved
                      ? t.admin.tierlistForm.restoreOriginalBg
                      : t.admin.tierlistForm.removeBg}
                </Button>
                <p className="text-xs text-muted-foreground/70">
                  {bgRemoved
                    ? t.admin.tierlistForm.bgRemovedAuto
                    : t.admin.tierlistForm.bgBestWithSolid}
                </p>
              </div>
            )}
          </div>
        </FormSection>

        {/* SECTION 2: Informações Básicas */}
        <FormSection title={t.admin.tierlistForm.sectionBasicInfo} icon={<Info className="size-4" />} defaultOpen>
          <div className="space-y-4">
            {/* Category picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                  {t.admin.tierlistForm.category} <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-muted-foreground/80">
                "Obrigatório. Escolha uma das categorias abaixo — os valores são validados pelo banco."
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
                  {t.admin.tierlistForm.name} <span className="text-red-400">*</span>
                </label>
                <Input
                  className="border-border bg-background"
                  placeholder="G Pro X Superlight 2"
                  maxLength={200}
                  aria-invalid={!!form.formState.errors.name}
                  {...form.register("name")}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  {t.admin.tierlistForm.charsHint}
                </p>
                {form.formState.errors.name && <p className="text-xs text-red-400">{form.formState.errors.name.message}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {t.admin.tierlistForm.brand} <span className="text-red-400">*</span>
                </label>
                <Select value={form.watch("brand")} onValueChange={(value) => form.setValue("brand", value, { shouldValidate: true })}>
                  <SelectTrigger className="border-border bg-background" aria-invalid={!!form.formState.errors.brand}>
                    <SelectValue placeholder={t.admin.tierlistForm.selectBrand} />
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
                  {t.admin.tierlistForm.brandHint}
                </p>
                {form.formState.errors.brand && <p className="text-xs text-red-400">{form.formState.errors.brand.message}</p>}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                {t.admin.tierlistForm.priceUsd} <span className="text-red-400">*</span>
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
                "Use um valor positivo em dólares (ex: 159.00). A conversão é feita automaticamente."
              </p>
              {form.formState.errors.price && <p className="text-xs text-red-400">{form.formState.errors.price.message}</p>}
            </div>
          </div>
        </FormSection>

        {/* SECTION 3: Tier */}
        <FormSection title="Tier" icon={<Layers className="size-4" />} defaultOpen>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">{t.admin.tierlistForm.tierHint}</p>
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
                {t.admin.tierlistForm.underReview}
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
              "Obrigatório — selecione ao menos uma tag que descreva este periférico."
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
                      {tag.pt}
                    {active && " ✓"}
                  </button>
                )
              })}
            </div>
            {selectedTag.length === 0 && (
              <p className="text-xs text-red-400">{t.admin.tierlistForm.selectAtLeastOneTag}</p>
            )}
          </div>
        </FormSection>

        {/* SECTION 5: Ratings */}
        <FormSection
          title={t.admin.tierlistForm.sectionRatings}
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
              "Avalie cada aspecto de 1 (pior) a 6 (melhor). Clique × para limpar."
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {RATING_FIELDS.map((field) => {
                let label = field.ptLabel
                if (field.key === "ratingBattery" && watchedCategory === "keyboard") {
                  label = "Digitação"
                }
                if (watchedCategory === "mousepad") {
                  if (field.key === "ratingSoftware") label = "Base"
                  if (field.key === "ratingBuild") label = "Superfície"
                  if (field.key === "ratingBattery") label = "Costura"
                }
                if (watchedCategory === "iem" || watchedCategory === "headset") {
                  if (field.key === "ratingSoftware") label = "Equalização"
                  if (field.key === "ratingBattery" && watchedCategory === "iem") return null
                  if (field.key === "ratingBattery" && watchedCategory === "headset" && !form.watch("hasBattery")) return null
                }
                if (watchedCategory === "feet") {
                  if (field.key === "ratingBuild") label = "Material"
                  if (field.key === "ratingSoftware") label = "Velocidade"
                  if (field.key === "ratingBattery" || field.key === "ratingQc") return null
                }
                if (watchedCategory === "glasspad") {
                  if (field.key === "ratingSoftware") label = "Base"
                  if (field.key === "ratingBuild") label = "Superfície"
                  if (field.key === "ratingBattery") label = "Velocidade"
                }
                if (watchedCategory === "chairs") {
                  if (field.key === "ratingPerformance") label = "Conforto"
                  if (field.key === "ratingBattery") label = "Garantia"
                  if (field.key === "ratingSoftware") label = "Recursos"
                }
                if (watchedCategory === "monitors") {
                  if (field.key === "ratingBuild") label = "Painel"
                  if (field.key === "ratingSoftware") label = "Menu de Configuração"
                  if (field.key === "ratingBattery") label = "Garantia"
                  if (field.key === "ratingMaintenance") label = "Construção"
                }
                if (watchedCategory === "switches") {
                  if (field.key === "ratingSoftware") label = "Som"
                  if (field.key === "ratingBattery") label = "Digitação"
                  if (field.key === "ratingQc" || field.key === "ratingMaintenance") return null
                }
                if (watchedCategory === "dac_amp") {
                  if (field.key === "ratingSoftware") label = "Recursos"
                  if (field.key === "ratingBattery") label = "Potência"
                  if (field.key === "ratingMaintenance") return null
                }
                if (watchedCategory !== "chairs" && watchedCategory !== "monitors" && field.key === "ratingMaintenance") return null
                return (
                  <RatingInput
                    key={field.key}
                    label={label}
                    value={form.watch(field.key) as number | undefined}
                    onChange={(v) => setRating(field.key, v)}
                  />
                )
              })}
            </div>
          </div>
        </FormSection>

        {/* SECTION 6: Specs por categoria */}
        <FormSection title={t.admin.tierlistForm.sectionTechnicalSpecs} icon={<FileText className="size-4" />} defaultOpen>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {watchedCategory === "mouse" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Formato"}</label>
                  <Select value={form.watch("mouseShape") || ""} onValueChange={(v) => form.setValue("mouseShape", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="symmetrical">Symmetrical</SelectItem>
                      <SelectItem value="ergonomic">Ergonomic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Conectividade"}</label>
                  <Select value={form.watch("connectivity") || ""} onValueChange={(v) => form.setValue("connectivity", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wired">{"Com fio"}</SelectItem>
                      <SelectItem value="wireless">{"Sem fio"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trimode</label>
                  <Select value={form.watch("trimode") || ""} onValueChange={(v) => form.setValue("trimode", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{"Sim"}</SelectItem>
                      <SelectItem value="no">{"Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Tamanho"}</label>
                  <Select value={form.watch("size") || ""} onValueChange={(v) => form.setValue("size", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fingertip">Fingertip</SelectItem>
                      <SelectItem value="small">{"Pequeno"}</SelectItem>
                      <SelectItem value="medium">{"Médio"}</SelectItem>
                      <SelectItem value="large">{"Grande"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sensor</label>
                  <Input className="border-border bg-background" placeholder="HERO 2, PMW 3395" {...form.register("driver")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Peso"}</label>
                  <Input className="border-border bg-background" placeholder="61g" {...form.register("weight")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Latência"}</label>
                  <Input className="border-border bg-background" placeholder="0.62ms" {...form.register("latency")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Switch</label>
                  <Select value={form.watch("switchType") || ""} onValueChange={(v) => form.setValue("switchType", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="magnetic">{"Magnético"}</SelectItem>
                      <SelectItem value="optical">{"Óptico"}</SelectItem>
                      <SelectItem value="mechanical">{"Mecânico"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coating</label>
                  <Select value={form.watch("coating") || ""} onValueChange={(v) => form.setValue("coating", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
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
                    { field: "gripSmall", label: "Grip · Mão pequena" },
                    { field: "gripMedium", label: "Grip · Mão média" },
                    { field: "gripLarge", label: "Grip · Mão grande" },
                  ].map(({ field, label }) => (
                    <div key={field} className="space-y-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" type="button" className="w-full justify-between">
                            <span className="line-clamp-1">
                              {(form.watch(field as any) || "") || ("Selecione")}
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
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      {["60%", "65%", "75%", "TKL", "Full-size"].map((l) => (
                        <SelectItem key={l} value={l}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Conectividade"}</label>
                  <Select value={form.watch("connectivity") || ""} onValueChange={(v) => form.setValue("connectivity", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wired">{"Com fio"}</SelectItem>
                      <SelectItem value="wireless">{"Sem fio"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trimode</label>
                  <Select value={form.watch("trimode") || ""} onValueChange={(v) => form.setValue("trimode", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{"Sim"}</SelectItem>
                      <SelectItem value="no">{"Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Peso"}</label>
                  <Input className="border-border bg-background" placeholder="800g" {...form.register("weight")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</label>
                  <Select value={form.watch("keyboardType") || ""} onValueChange={(v) => form.setValue("keyboardType", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="mechanical">{"Mecânico"}</SelectItem>
                      <SelectItem value="optical">{"Óptico"}</SelectItem>
                      <SelectItem value="magnetic">{"Magnético"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Switch</label>
                  <Input className="border-border bg-background" placeholder={"Linear, Tátil, Clicky"} {...form.register("switchType")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Latência"}</label>
                  <Input className="border-border bg-background" placeholder="0.5ms" {...form.register("latency")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deadzone</label>
                  <Input className="border-border bg-background" placeholder="0.1mm" {...form.register("deadzone")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RT Mínimo</label>
                  <Input className="border-border bg-background" placeholder="0.1mm" {...form.register("rtMin")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plate</label>
                  <Select value={form.watch("keyboardPlate") || ""} onValueChange={(v) => form.setValue("keyboardPlate", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="FR4">FR4</SelectItem>
                      <SelectItem value="Carbono">Carbono</SelectItem>
                      <SelectItem value="Alumínio">Alumínio</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hot Swap</label>
                  <Select value={form.watch("hotSwap") || ""} onValueChange={(v) => form.setValue("hotSwap", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{"Sim"}</SelectItem>
                      <SelectItem value="no">{"Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Case</label>
                  <Select value={form.watch("keyboardCase") || ""} onValueChange={(v) => form.setValue("keyboardCase", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Plástico">Plástico</SelectItem>
                      <SelectItem value="Fibra de Carbono">Fibra de Carbono</SelectItem>
                      <SelectItem value="Alumínio">Alumínio</SelectItem>
                      <SelectItem value="Magnésio">Magnésio</SelectItem>
                      <SelectItem value="Acrílico">Acrílico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features</label>
                  <Input className="border-border bg-background" placeholder="Rapid Trigger, Hall Effect, RGB..." {...form.register("features")} />
                </div>
              </>
            )}

            {watchedCategory === "mousepad" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Surface</label>
                  <Select value={form.watch("surface") || ""} onValueChange={(v) => form.setValue("surface", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cloth">Cloth</SelectItem>
                      <SelectItem value="hybrid">Hybrid</SelectItem>
                      <SelectItem value="glass">Glass</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perfil</label>
                  <Select value={form.watch("profile") || ""} onValueChange={(v) => form.setValue("profile", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Speed">Speed</SelectItem>
                      <SelectItem value="Control">Control</SelectItem>
                      <SelectItem value="Híbrido">Híbrido</SelectItem>
                      <SelectItem value="Híbrido + Speed">Híbrido + Speed</SelectItem>
                      <SelectItem value="Híbrido + Control">Híbrido + Control</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deslize</label>
                  <Select value={form.watch("glide") || ""} onValueChange={(v) => form.setValue("glide", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Rápido">Rápido</SelectItem>
                      <SelectItem value="Devagar">Devagar</SelectItem>
                      <SelectItem value="Equilibrado">Equilibrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Velocidade</label>
                  <Select value={form.watch("padSpeed") || ""} onValueChange={(v) => form.setValue("padSpeed", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Alta">Alta</SelectItem>
                      <SelectItem value="Média">Média</SelectItem>
                      <SelectItem value="Baixa">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Poder de Parada</label>
                  <Select value={form.watch("stoppingPower") || ""} onValueChange={(v) => form.setValue("stoppingPower", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Baixo">Baixo</SelectItem>
                      <SelectItem value="Médio">Médio</SelectItem>
                      <SelectItem value="Alto">Alto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base</label>
                  <Select value={form.watch("padType") || ""} onValueChange={(v) => form.setValue("padType", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Poron">Poron</SelectItem>
                      <SelectItem value="Borracha">Borracha</SelectItem>
                      <SelectItem value="Fibra de Carbono">Fibra de Carbono</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espessura</label>
                  <Select value={form.watch("thickness") || ""} onValueChange={(v) => form.setValue("thickness", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1mm">1mm</SelectItem>
                      <SelectItem value="2mm">2mm</SelectItem>
                      <SelectItem value="3mm">3mm</SelectItem>
                      <SelectItem value="4mm">4mm</SelectItem>
                      <SelectItem value="5mm">5mm</SelectItem>
                      <SelectItem value="6mm">6mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tamanho</label>
                  <Select value={form.watch("size") || ""} onValueChange={(v) => form.setValue("size", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="S">S</SelectItem>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                      <SelectItem value="XL">XL</SelectItem>
                      <SelectItem value="XXL">XXL</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {watchedCategory === "glasspad" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perfil</label>
                  <Select value={form.watch("profile") || ""} onValueChange={(v) => form.setValue("profile", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Speed">Speed</SelectItem>
                      <SelectItem value="Control">Control</SelectItem>
                      <SelectItem value="Híbrido">Híbrido</SelectItem>
                      <SelectItem value="Híbrido + Speed">Híbrido + Speed</SelectItem>
                      <SelectItem value="Híbrido + Control">Híbrido + Control</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deslize</label>
                  <Select value={form.watch("glide") || ""} onValueChange={(v) => form.setValue("glide", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Rápido">Rápido</SelectItem>
                      <SelectItem value="Devagar">Devagar</SelectItem>
                      <SelectItem value="Equilibrado">Equilibrado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Velocidade</label>
                  <Select value={form.watch("padSpeed") || ""} onValueChange={(v) => form.setValue("padSpeed", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Alta">Alta</SelectItem>
                      <SelectItem value="Média">Média</SelectItem>
                      <SelectItem value="Baixa">Baixa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Poder de Parada</label>
                  <Select value={form.watch("stoppingPower") || ""} onValueChange={(v) => form.setValue("stoppingPower", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Baixo">Baixo</SelectItem>
                      <SelectItem value="Médio">Médio</SelectItem>
                      <SelectItem value="Alto">Alto</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Base</label>
                  <Select value={form.watch("padType") || ""} onValueChange={(v) => form.setValue("padType", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Borracha">Borracha</SelectItem>
                      <SelectItem value="Silicone">Silicone</SelectItem>
                      <SelectItem value="Anti-slip Feets">Anti-slip Feets</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Espessura</label>
                  <Select value={form.watch("thickness") || ""} onValueChange={(v) => form.setValue("thickness", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1mm">1mm</SelectItem>
                      <SelectItem value="2mm">2mm</SelectItem>
                      <SelectItem value="3mm">3mm</SelectItem>
                      <SelectItem value="4mm">4mm</SelectItem>
                      <SelectItem value="5mm">5mm</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tamanho</label>
                  <Select value={form.watch("size") || ""} onValueChange={(v) => form.setValue("size", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder="Selecione" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="S">S</SelectItem>
                      <SelectItem value="M">M</SelectItem>
                      <SelectItem value="L">L</SelectItem>
                      <SelectItem value="XL">XL</SelectItem>
                      <SelectItem value="XXL">XXL</SelectItem>
                    </SelectContent>
                  </Select>
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
                      <SelectValue placeholder={"Selecione"} />
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
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wired">{"Com fio"}</SelectItem>
                      <SelectItem value="wireless">{"Sem fio"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trimode</label>
                  <Select value={form.watch("trimode") || ""} onValueChange={(v) => form.setValue("trimode", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{"Sim"}</SelectItem>
                      <SelectItem value="no">{"Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}

            {(watchedCategory === "iem" || watchedCategory === "headset") && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Conectividade"}</label>
                  <Select value={form.watch("connectivity") || ""} onValueChange={(v) => form.setValue("connectivity", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wired">{"Com fio"}</SelectItem>
                      <SelectItem value="wireless">{"Sem fio"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Trimode</label>
                  <Select value={form.watch("trimode") || ""} onValueChange={(v) => form.setValue("trimode", v)}>
                    <SelectTrigger className="border-border bg-background">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">{"Sim"}</SelectItem>
                      <SelectItem value="no">{"Não"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Compatibilidade"}</label>
                  <Input className="border-border bg-background" placeholder="Windows, macOS, PS5" {...form.register("compatibility")} />
                </div>
                {watchedCategory === "headset" && (
                  <div className="flex items-center gap-2 col-span-full">
                    <input
                      type="checkbox"
                      id="hasBattery"
                      checked={!!form.watch("hasBattery")}
                      onChange={(e) => form.setValue("hasBattery", e.target.checked)}
                      className="h-4 w-4 rounded border-border accent-primary"
                    />
                    <label htmlFor="hasBattery" className="text-sm text-muted-foreground cursor-pointer">
                      {"Tem bateria"}
                    </label>
                  </div>
                )}
              </>
            )}
          </div>
        </FormSection>

        {/* SECTION 7: Wiki / Conteúdo */}
        <FormSection title={t.admin.tierlistForm.sectionWikiContent} icon={<FileText className="size-4" />} defaultOpen={false}>
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-lg border border-border bg-muted/20 p-3">
              <label className="text-sm font-medium text-foreground">
                {"URL da wiki externa (opcional)"}
              </label>
              <Input
                className="border-border bg-background"
                placeholder="https://wiki.exemplo.com/produto"
                {...form.register("wikiUrl")}
              />
              <p className="text-[11px] text-muted-foreground">
                "Quando preenchido, a página pública mostra apenas um botão para a wiki externa, no lugar do conteúdo editorial abaixo."
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{"Resumo"}</label>
                <Input className="border-border bg-background" placeholder={"Descrição em uma linha"} {...form.register("summary")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{"Label de rank"}</label>
                <Input className="border-border bg-background" placeholder="GOAT, Top S, Solid A" {...form.register("rankLabel")} />
              </div>
              <div className="space-y-1.5 md:col-span-2">
                <div className="flex gap-3">
                  <div className="flex-1 space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{"Ranking (posição #)"}</label>
                    <Input className="border-border bg-background" type="number" min={1} placeholder="1" {...form.register("ranking", { valueAsNumber: true })} />
                  </div>
                  <div className="flex-1 space-y-1.5">
                    <label className="text-sm font-medium text-foreground">{"Pontuação"}</label>
                    <Input className="border-border bg-background" type="number" min={0} step={0.25} placeholder="788.5" {...form.register("score", { valueAsNumber: true })} />
                  </div>
                </div>
                {rankedPeripherals.filter(p => p.ranking > 0).length > 0 && (
                  <div className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-border bg-muted/30 divide-y divide-border">
                    <p className="sticky top-0 z-10 bg-muted/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground backdrop-blur">
                      {rankedPeripherals.filter(p => p.ranking > 0).length} {"com ranking"} — {watchedCategory}
                    </p>
                    {rankedPeripherals.filter(p => p.ranking > 0).map((p) => (
                      <div key={p.id} className={`flex items-center gap-2 px-3 py-2 text-xs ${p.id === peripheralId ? "bg-primary/10" : ""}`}>
                        <span className="w-6 shrink-0 text-center font-bold text-muted-foreground/60">#{p.ranking}</span>
                        <span className={`flex-1 truncate ${p.id === peripheralId ? "font-semibold text-primary" : "text-foreground"}`}>{p.name}</span>
                        {p.score != null && (
                          <span className="shrink-0 tabular-nums text-muted-foreground">{p.score}</span>
                        )}
                        {p.id === peripheralId && <span className="shrink-0 text-[10px] text-primary font-semibold">←</span>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{"Faixa de preço"}</label>
                <Input className="border-border bg-background" placeholder="R$1050–1130" {...form.register("priceRange")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{"Compatibilidade"}</label>
                <Input className="border-border bg-background" placeholder="Windows, macOS, PS5" {...form.register("compatibility")} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{"URL do Review"}</label>
                <Input className="border-border bg-background" placeholder="https://youtube.com/..." {...form.register("reviewUrl")} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{"URL do Guia"}</label>
                <Input className="border-border bg-background" placeholder="https://..." {...form.register("guideUrl")} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{"Nota do review"}</label>
              <Textarea className="border-border bg-background resize-none" placeholder={"Observação curta sobre o review"} rows={2} {...form.register("reviewNote")} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { field: "highlights", label: "Destaques" },
                { field: "comparisons", label: "Comparações" },
                { field: "pros", label: "Pros" },
                { field: "cons", label: "Cons" },
              ].map(({ field, label }) => (
                <div key={field} className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <Textarea
                    className="border-border bg-background resize-none"
                    placeholder={"Um por linha"}
                    rows={4}
                    {...form.register(field as any)}
                  />
                  <p className="text-[10px] text-muted-foreground">{"Cada linha vira um item separado"}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{"URLs da Galeria"}</label>
              <Textarea className="border-border bg-background resize-none" placeholder={"Uma URL de imagem por linha"} rows={4} {...form.register("gallery")} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{"Notas (estendidas)"}</label>
              <Textarea className="border-border bg-background resize-none" placeholder={"Notas principais e contexto"} rows={5} {...form.register("notesLong")} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{"Notas extras"}</label>
              <Textarea className="border-border bg-background resize-none" placeholder={"Observações adicionais"} rows={3} {...form.register("notes")} />
            </div>
          </div>
        </FormSection>

        {/* SECTION: Produtos vinculados */}
        <FormSection title={t.admin.tierlistForm.sectionLinkedProducts} icon={<Link2 className="size-4" />} defaultOpen={false}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              "Vincule este periférico a um produto da Loja e/ou item do Bazar. O vínculo aparece na página do periférico, e as páginas da Loja e do Bazar mostram o item correspondente do outro lado."
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t.admin.tierlistForm.linkedStoreProduct}</label>
                <LinkedProductPicker
                  kind="store"
                  value={linkedStore}
                  onChange={setLinkedStore}
                  excludeId={linkedBazaar?.id ?? null}
                  t={t}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t.admin.tierlistForm.linkedBazaarItem}</label>
                <LinkedProductPicker
                  kind="bazaar"
                  value={linkedBazaar}
                  onChange={setLinkedBazaar}
                  excludeId={linkedStore?.id ?? null}
                  t={t}
                />
              </div>
            </div>
          </div>
        </FormSection>

        {/* SECTION 8: Links de compra */}
        <FormSection title={t.admin.tierlistForm.sectionBuyLinks} icon={<ShoppingCart className="size-4" />} defaultOpen={false}>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              "Formato: Label | https://... — um por linha. Exemplo: Amazon | https://amazon.com/..."
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
            <Button variant="outline">{t.admin.tierlistForm.cancel}</Button>
          </Link>
          <Button disabled={uploading || removingBg || form.formState.isSubmitting} type="submit" className="min-w-28">
            {uploading || form.formState.isSubmitting
              ? t.admin.tierlistForm.saving
              : peripheralId
                ? t.admin.tierlistForm.saveChanges
                : t.admin.tierlistForm.createPeripheral}
          </Button>
        </div>
      </form>
    </div>
  )
}
