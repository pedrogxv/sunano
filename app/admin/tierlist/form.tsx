"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter, usePathname } from "next/navigation"
import Link from "next/link"
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement } from "@dnd-kit/modifiers"
import { arrayMove, rectSortingStrategy, SortableContext, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Upload, ChevronDown, ChevronUp, ImageIcon, Tag as TagIcon, Layers, FileText, ShoppingCart, Info, Link2, Search, X, GripVertical, Plus, Trash2, Loader2, Eye } from "lucide-react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import * as z from "zod"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { compressImageFile } from "@/lib/client/compress-image"
import { formatBRL } from "@/lib/format"
import { hasAdminPermission, type AdminProfile } from "@/lib/admin-permissions"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Combobox } from "@/components/ui/combobox"
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
import { parseWeightToGrams } from "@/lib/peripheral-weight"
import { RATING_LEVEL_COLORS } from "@/lib/tierlist-theme"
import { useT } from "@/lib/use-t"
import { removeBackground, fileToDataUrl } from "@/lib/client/remove-background"
import { SWITCH_PRICE_TIERS } from "@/lib/switch-price-tier"
import { PeripheralDetailView } from "@/components/peripherals/PeripheralDetailView"
import { getTagOptionsForCategory, sanitizeTagsForCategory, type Category, type Tag } from "@/lib/tag-options"

type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierField = Tier | "__none__"

/** Ordem numérica auxiliar de `tier`, espelha o CASE da migration
 * 20260917000001_peripherals_columns_and_indexes.sql — mantida em sincronia
 * pelo form sempre que `tier` for salvo. */
const TIER_RANK: Record<Tier, number> = { GOAT: 0, SS: 1, S: 2, A: 3, B: 4, C: 5, L: 6 }

const peripheralSchema = z.object({
  name: z
    .string()
    .min(1, "Informe o nome do periférico")
    .max(200, "Nome muito longo (máx. 200 caracteres)"),
  brand_id: z
    .string()
    .uuid("Selecione a marca"),
  category: z.enum(
    ["keyboard", "pcb", "mouse", "mousepad", "glasspad", "iem", "headset", "feet", "chairs", "monitors", "switches", "dac_amp"],
    { message: "Selecione uma das categorias disponíveis" }
  ),
  tier: z.union([z.enum(["GOAT", "SS", "S", "A", "B", "C", "L"]), z.literal("__none__")]),
  price: z
    .number({ message: "Preço inválido" })
    .nonnegative("Preço não pode ser negativo"),
  rankLabel: z.string().optional(),
  ranking: z.coerce.number().int().positive().optional(),
  score: z.preprocess(
    (value) => (value === "" || value === null || Number.isNaN(value) ? undefined : value),
    z.coerce.number().min(0).optional()
  ),
  reviewUrl: z.string().optional(),
  soundUrl: z.string().optional(),
  guideUrl: z.string().optional(),
  wikiUrl: z.string().optional(),
  summary: z.string().optional(),
  highlights: z.string().optional(),
  pros: z.string().optional(),
  cons: z.string().optional(),
  gallery: z.string().optional(),
  buyLinkAliexpress: z.string().optional(),
  buyLinkMercadoLivre: z.string().optional(),
  buyLinkAmazon: z.string().optional(),
  buyLinkShopee: z.string().optional(),
  compatibility: z.string().optional(),
  comparisons: z.string().optional(),
  weight: z.string().optional(),
  latency: z.string().optional(),
  switchType: z.string().optional(),
  coating: z.string().optional(),
  actuationForce: z.string().optional(),
  totalTravel: z.string().optional(),
  magneticFlux: z.string().optional(),
  housing: z.string().optional(),
  stemType: z.string().optional(),
  shape: z.string().optional(),
  pollingRate: z.string().optional(),
  battery: z.string().optional(),
  batteryLife: z.string().optional(),
  dimensions: z.string().optional(),
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
  softwareInfo: z.string().optional(),
  switchPeripheralId: z.string().optional(),
  priceTier: z.string().optional(),
  reviewCategory: z.enum(["performance", "store", "videoReview", "specsComments"]).nullable().optional(),
  reviewApproved: z.boolean().optional(),
  golpe: z.boolean().optional(),
  golpeMotivo: z.string().optional(),
}).superRefine((data, ctx) => {
  // Switches usam faixa de preço (priceTier) no lugar de valor exato, então o
  // preço numérico fica em 0. Nas demais categorias, o preço tem que ser > 0.
  if (data.category !== "switches" && !(data.price > 0)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["price"],
      message: "Preço deve ser maior que zero",
    })
  }
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
  { key: "pcb", label: "PCB", emoji: "🟩" },
  { key: "dac_amp", label: "DAC/AMP", emoji: "🎚️" },
]

// Modos de exibição da Tierlist pública, por categoria de dispositivo. Um periférico só
// aparece em uma aba da Tierlist (/tierlist) se o modo dela estiver na lista escolhida aqui;
// sem nenhum modo selecionado, o item continua salvo no banco mas some da Tierlist pública.
type TierlistMode = "oled" | "overall" | "value" | "recommended" | "soundTyping" | "mechanical" | "magnetic" | "pcb" | "ips_va" | "competitive"

const DEFAULT_TIERLIST_MODE_OPTIONS: { key: TierlistMode; label: string }[] = [
  { key: "overall", label: "Geral" },
  { key: "value", label: "Custo Benefício" },
]

const TIERLIST_MODE_OPTIONS: Record<Category, { key: TierlistMode; label: string }[]> = {
  keyboard: [
    { key: "magnetic", label: "Magnético" },
    { key: "value", label: "Custo Benefício" },
    { key: "mechanical", label: "Mecânico" },
  ],
  monitors: [
    { key: "oled", label: "OLED" },
    { key: "ips_va", label: "IPS / VA" },
    { key: "competitive", label: "Competitivo" },
    { key: "value", label: "Custo Benefício" },
  ],
  mouse: [
    { key: "overall", label: "Geral" },
    { key: "magnetic", label: "Magnético" },
    { key: "value", label: "Custo Benefício" },
  ],
  switches: [
    { key: "overall", label: "Geral" },
    { key: "value", label: "Custo Benefício" },
    { key: "soundTyping", label: "Som e Digitação" },
  ],
  mousepad: [
    { key: "overall", label: "Geral" },
    { key: "value", label: "Nacional" },
    { key: "recommended", label: "Custo Benefício" },
  ],
  glasspad: [
    { key: "overall", label: "Geral" },
    { key: "value", label: "Nacional" },
    { key: "recommended", label: "Custo Benefício" },
  ],
  iem: [
    { key: "overall", label: "Geral" },
    { key: "value", label: "Custo Benefício" },
    { key: "recommended", label: "Gamer" },
  ],
  headset: [
    { key: "overall", label: "Geral" },
    { key: "value", label: "Custo Benefício" },
    { key: "recommended", label: "Nacionais" },
  ],
  pcb: DEFAULT_TIERLIST_MODE_OPTIONS,
  feet: DEFAULT_TIERLIST_MODE_OPTIONS,
  chairs: DEFAULT_TIERLIST_MODE_OPTIONS,
  dac_amp: DEFAULT_TIERLIST_MODE_OPTIONS,
}

const TIER_OPTIONS: { key: Tier; color: string; textColor: string; bg: string }[] = [
  { key: "GOAT", color: "border-orange-400 bg-orange-500/20 text-orange-300", textColor: "text-orange-300", bg: "bg-orange-500/20" },
  { key: "SS", color: "border-yellow-400 bg-yellow-500/20 text-yellow-300", textColor: "text-yellow-300", bg: "bg-yellow-500/20" },
  { key: "S", color: "border-amber-400 bg-amber-500/20 text-amber-300", textColor: "text-amber-300", bg: "bg-amber-500/20" },
  { key: "A", color: "border-lime-400 bg-lime-500/20 text-lime-300", textColor: "text-lime-300", bg: "bg-lime-500/20" },
  { key: "B", color: "border-cyan-400 bg-cyan-500/20 text-cyan-300", textColor: "text-cyan-300", bg: "bg-cyan-500/20" },
  { key: "C", color: "border-blue-400 bg-blue-500/20 text-blue-300", textColor: "text-blue-300", bg: "bg-blue-500/20" },
  { key: "L", color: "border-border bg-muted/40 text-muted-foreground", textColor: "text-muted-foreground", bg: "bg-muted/40" },
]

const BUY_LINK_PLATFORMS: {
  field: "buyLinkAliexpress" | "buyLinkMercadoLivre" | "buyLinkAmazon" | "buyLinkShopee"
  label: string
  matches: string[]
  dot: string
  ring: string
}[] = [
  { field: "buyLinkAliexpress", label: "AliExpress", matches: ["aliexpress"], dot: "bg-red-500", ring: "focus-visible:ring-red-400/40" },
  { field: "buyLinkMercadoLivre", label: "Mercado Livre", matches: ["mercado livre", "mercadolivre"], dot: "bg-yellow-400", ring: "focus-visible:ring-yellow-400/40" },
  { field: "buyLinkAmazon", label: "Amazon", matches: ["amazon"], dot: "bg-blue-500", ring: "focus-visible:ring-blue-400/40" },
  { field: "buyLinkShopee", label: "Shopee", matches: ["shopee"], dot: "bg-orange-500", ring: "focus-visible:ring-orange-400/40" },
]

const MAX_IMAGES = 8
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024
// Primeira poda, ainda no navegador: economiza upload e mantém o corpo da
// requisição longe do teto de ~4.5MB da Vercel. O servidor recomprime de novo
// para WebP (ver lib/server/image-compression.ts) — este passo é sobre o que
// sai da máquina do admin, não sobre o que fica no bucket.
const IMAGE_COMPRESS_OPTIONS = {
  maxDimension: 1600,
  targetBytes: 400 * 1024,
  skipBelowBytes: 150 * 1024,
}

function SortableImageThumb({
  url,
  index,
  onRemove,
}: {
  url: string
  index: number
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: url,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "group relative size-24 overflow-hidden rounded-xl border border-border bg-muted/30",
        isDragging && "z-10 border-primary/40 shadow-lg"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={`Imagem ${index + 1}`} className="h-full w-full object-contain p-1" />
      <button
        type="button"
        aria-label="Reordenar imagem"
        className="absolute left-1 top-1 flex size-5 cursor-grab touch-none items-center justify-center rounded-full bg-black/70 text-white opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-3" />
      </button>
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity group-hover:opacity-100"
      >
        <Trash2 className="size-2.5 text-white" />
      </button>
      {index === 0 && (
        <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-semibold text-white">
          Principal
        </span>
      )}
    </div>
  )
}

function findBuyLinkUrl(buyLinks: unknown, needles: string[]): string {
  if (!Array.isArray(buyLinks)) return ""
  const found = buyLinks.find((l: { label?: string; url?: string }) => {
    const label = l?.label?.toLowerCase() ?? ""
    return needles.some((needle) => label.includes(needle))
  })
  return found?.url ?? ""
}

// Monta o objeto `specs` salvo no banco a partir dos valores do formulário. Fica fora
// do componente (função pura) para que o preview ao vivo use exatamente a mesma lógica
// de mapeamento do onSubmit — sem isso, preview e dado salvo podiam divergir com o tempo.
function buildSpecsPayload(
  data: PeripheralFormData,
  opts: { selectedTierlistCategories: TierlistMode[]; gallery: string[]; shapeImage?: string | null }
) {
  const splitLines = (value?: string) =>
    value ? value.split("\n").map((l) => l.trim()).filter(Boolean) : []

  const buyLinks = BUY_LINK_PLATFORMS
    .map((platform) => ({ label: platform.label, url: data[platform.field]?.trim() ?? "" }))
    .filter((link) => link.url)

  const ratings = {
    overall: data.ratingOverall, build: data.ratingBuild, software: data.ratingSoftware,
    battery: data.ratingBattery, performance: data.ratingPerformance, qc: data.ratingQc, value: data.ratingValue,
    maintenance: data.ratingMaintenance,
  }
  const cleanedRatings = Object.fromEntries(
    Object.entries(ratings).filter(([, v]) => typeof v === "number" && !Number.isNaN(v))
  )

  return {
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
    tierlistCategories: opts.selectedTierlistCategories,
    // GOLPE tem prioridade sobre a faixa de preço calculada (ver lib/price-band.ts) — se
    // desmarcado, o motivo é descartado junto pra não ficar "preso" num item não-golpe.
    golpe: data.golpe || undefined,
    golpeMotivo: data.golpe ? (data.golpeMotivo || undefined) : undefined,
    reviewCategory: data.reviewCategory ?? null,
    reviewApproved: data.reviewApproved ?? false,
    details: {
      rankLabel: data.rankLabel || undefined, ranking: data.ranking || undefined, score: data.score ?? undefined,
      reviewUrl: data.reviewUrl || undefined,
      soundUrl: data.soundUrl || undefined,
      guideUrl: data.guideUrl || undefined, wikiUrl: data.wikiUrl || undefined,
      summary: data.summary || undefined, highlights: splitLines(data.highlights),
      pros: splitLines(data.pros), cons: splitLines(data.cons), gallery: opts.gallery,
      buyLinks, compatibility: data.compatibility || undefined,
      comparisons: splitLines(data.comparisons),
      softwareInfo: data.softwareInfo || undefined,
      switchPeripheralId: data.switchPeripheralId || undefined,
      priceTier: data.priceTier || undefined,
      weight: data.weight || undefined, latency: data.latency || undefined,
      deadzone: data.deadzone || undefined, rtMin: data.rtMin || undefined,
      features: data.features || undefined,
      switchType: data.switchType || undefined, coating: data.coating || undefined,
      actuationForce: data.actuationForce || undefined, totalTravel: data.totalTravel || undefined,
      magneticFlux: data.magneticFlux || undefined, housing: data.housing || undefined,
      stemType: data.stemType || undefined,
      shape: data.shape || undefined, gripSmall: data.gripSmall || undefined,
      gripMedium: data.gripMedium || undefined, gripLarge: data.gripLarge || undefined,
      pollingRate: data.pollingRate || undefined, battery: data.battery || undefined,
      batteryLife: data.batteryLife || undefined, dimensions: data.dimensions || undefined,
      shapeImage: opts.shapeImage || undefined,
      ratings: Object.keys(cleanedRatings).length > 0 ? cleanedRatings : undefined,
    },
  }
}

/**
 * Campos migrados de `specs` para colunas reais (ver migration
 * 20260917000001_peripherals_columns_and_indexes.sql). Dual-write: estes
 * valores também continuam dentro do payload de `buildSpecsPayload` acima,
 * até os consumidores de `specs` migrarem por completo para ler daqui.
 */
function buildPeripheralColumnsPayload(data: PeripheralFormData) {
  const weightG = parseWeightToGrams(data.weight)
  return {
    weight_g: weightG ?? null,
    connectivity: data.connectivity || null,
    mouse_shape: data.mouseShape || null,
    keyboard_layout: data.keyboardLayout || null,
    surface: data.surface || null,
    profile: data.profile || null,
    panel_type: data.panelType || null,
    refresh_rate: typeof data.refreshRate === "number" && !Number.isNaN(data.refreshRate) ? data.refreshRate : null,
    tier_rank: data.tier !== "__none__" ? TIER_RANK[data.tier] : null,
  }
}

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

// Mapeia cada flag de revisão para a seção do formulário que deve abrir e
// receber o scroll quando se chega aqui via /admin/tierlist/{id}?focus=<flag>
// (link vindo dos chips da lista de revisão em /admin/tierlist/revisao).
const REVIEW_FOCUS_TARGETS: Record<string, { scrollTo: string; alsoOpen?: string[] }> = {
  performance: { scrollTo: "section-ratings" },
  store: { scrollTo: "section-linked-products", alsoOpen: ["section-buy-links"] },
  videoReview: { scrollTo: "section-wiki-content" },
  specsComments: { scrollTo: "section-technical-specs", alsoOpen: ["section-wiki-content"] },
}

interface SectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  defaultOpen?: boolean
  id?: string
  forceOpen?: boolean
}

function FormSection({ title, icon, children, defaultOpen = true, id, forceOpen }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen || Boolean(forceOpen))

  useEffect(() => {
    if (forceOpen) setOpen(true)
  }, [forceOpen])

  return (
    <Card
      id={id}
      className="scroll-mt-24 gap-0 overflow-hidden rounded-2xl border border-white/10 py-0 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_16px_32px_-16px_rgba(0,0,0,0.85)] transition-shadow"
      style={{ backgroundColor: "#141416" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group/section-header flex w-full items-center justify-between gap-3 p-5 text-left"
      >
        <div className="flex items-center gap-3 text-sm font-semibold text-foreground">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
            {icon}
          </span>
          {title}
        </div>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/5 text-muted-foreground transition-colors group-hover/section-header:bg-white/10 group-hover/section-header:text-foreground">
          {open ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </span>
      </button>
      {open && (
        <CardContent className="border-t border-white/10 px-5 pt-5 pb-6" style={{ backgroundColor: "#0e0e10" }}>
          {children}
        </CardContent>
      )}
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
  type: "store"
  price_cents: number
  images: string[]
}

function LinkedProductPicker({
  value,
  onChange,
  excludeId,
  t,
}: {
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
    fetch(`/api/admin/store/products`, { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json: { products?: LinkedProduct[] } | null) => {
        if (!cancelled) setResults(json?.products ?? [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  const filtered = query.trim()
    ? results.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : results
  const visible = filtered.filter((p) => p.id !== excludeId)

  const placeholderLabel = t.admin.tierlistForm.pickerSearchStore

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 p-2.5" style={{ backgroundColor: "#1c1c1f" }}>
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
            <p className="text-xs text-muted-foreground">{formatBRL(value.price_cents)}</p>
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
        <div className="space-y-2 rounded-lg border border-white/10 p-3" style={{ backgroundColor: "#1c1c1f" }}>
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder={t.admin.tierlistForm.pickerTypeToFilter}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]"
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
                        <p className="text-xs text-muted-foreground">{formatBRL(p.price_cents)}</p>
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

interface LinkedSwitch {
  id: string
  name: string
  image_url: string | null
}

// Seletor opcional para vincular o campo "Switch" de um teclado/mouse a um
// periférico da categoria "switches". Espelha o LinkedProductPicker, mas busca
// periféricos em vez de produtos da loja e guarda apenas o id.
function LinkedSwitchPicker({
  value,
  onChange,
}: {
  value: LinkedSwitch | null
  onChange: (peripheral: LinkedSwitch | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<LinkedSwitch[]>([])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    fetch("/api/admin/peripherals?category=switches&columns=id,name,image_url", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json: { peripherals?: LinkedSwitch[] } | null) => {
        if (!cancelled) setResults(json?.peripherals ?? [])
      })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open])

  const filtered = query.trim()
    ? results.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase()))
    : results

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border border-white/10 p-2.5" style={{ backgroundColor: "#1c1c1f" }}>
          <div className="size-10 shrink-0 overflow-hidden rounded-md bg-muted/40">
            {value.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.image_url} alt={value.name} className="h-full w-full object-contain p-0.5" />
            ) : (
              <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">{value.name.slice(0, 2).toUpperCase()}</div>
            )}
          </div>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{value.name}</p>
          <Button type="button" size="sm" variant="ghost" onClick={() => onChange(null)} className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </Button>
        </div>
      ) : (
        <Button type="button" variant="outline" onClick={() => setOpen(true)} className="w-full justify-start gap-2 text-muted-foreground">
          <Search className="size-4" />
          {"Vincular a um Switch cadastrado"}
        </Button>
      )}

      {open && (
        <div className="space-y-2 rounded-lg border border-white/10 p-3" style={{ backgroundColor: "#1c1c1f" }}>
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder={"Digite para filtrar"}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]"
            />
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              {"Fechar"}
            </Button>
          </div>
          <div className="max-h-56 overflow-auto rounded-md border border-border/60 bg-background/40">
            {loading ? (
              <p className="p-3 text-xs text-muted-foreground">{"Carregando..."}</p>
            ) : filtered.length === 0 ? (
              <p className="p-3 text-xs text-muted-foreground">{"Nenhum switch cadastrado"}</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {filtered.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => { onChange(p); setOpen(false) }}
                      className="flex w-full items-center gap-3 p-2 text-left transition hover:bg-muted/30"
                    >
                      <div className="size-9 shrink-0 overflow-hidden rounded-md bg-muted/40">
                        {p.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image_url} alt={p.name} className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[10px] text-muted-foreground">{p.name.slice(0, 2).toUpperCase()}</div>
                        )}
                      </div>
                      <p className="min-w-0 flex-1 truncate text-sm text-foreground">{p.name}</p>
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
  const [focusSection, setFocusSection] = useState<string | null>(null)
  useEffect(() => {
    setFocusSection(new URLSearchParams(window.location.search).get("focus"))
  }, [])
  const focusTarget = focusSection ? REVIEW_FOCUS_TARGETS[focusSection] : undefined
  const forceOpenIds = useMemo(
    () => new Set(focusTarget ? [focusTarget.scrollTo, ...(focusTarget.alsoOpen ?? [])] : []),
    [focusTarget]
  )
  const backHref = pathname?.startsWith("/admin/perifericos") ? "/admin/perifericos" : "/admin/tierlist"

  // A rota permite entrar com peripherals_read (ver proxy.ts), mas salvar exige
  // peripherals_write (ver PATCH em app/api/admin/peripherals/[id]/route.ts).
  // Sem essa checagem no client, quem só tem leitura preenche tudo e só
  // descobre que não pode salvar no fim, com um toast de erro genérico.
  const [canWrite, setCanWrite] = useState(true)
  useEffect(() => {
    let isMounted = true
    fetch("/api/admin/profile")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { profile?: AdminProfile } | null) => {
        if (!isMounted || !data?.profile) return
        setCanWrite(hasAdminPermission(data.profile, "peripherals_write"))
      })
      .catch(() => {})
    return () => {
      isMounted = false
    }
  }, [])
  const parentLabel = pathname?.startsWith("/admin/perifericos")
    ? t.admin.tierlistForm.parentPeripherals
    : t.admin.tierlistForm.parentTierlist
  const [uploading, setUploading] = useState(false)
  const [loadingPeripheral, setLoadingPeripheral] = useState(Boolean(peripheralId))

  useEffect(() => {
    if (loadingPeripheral || !focusTarget) return
    const el = document.getElementById(focusTarget.scrollTo)
    el?.scrollIntoView({ behavior: "smooth", block: "start" })
  }, [loadingPeripheral, focusTarget])

  // Fotos principais do anúncio: a primeira é a "Principal". Cada foto já sobe
  // com o fundo removido automaticamente (ver handleImageAdd).
  const [images, setImages] = useState<string[]>([])
  const [selectedTag, setSelectedTag] = useState<Tag[]>([])
  const [selectedTierlistCategories, setSelectedTierlistCategories] = useState<TierlistMode[]>([])
  const [error, setError] = useState<string | null>(null)
  const [usdToBrl, setUsdToBrl] = useState<number | null>(null)
  const [originalUsdPrice, setOriginalUsdPrice] = useState<number | null>(null)
  const [linkedStore, setLinkedStore] = useState<LinkedProduct | null>(null)
  const [linkedSwitch, setLinkedSwitch] = useState<LinkedSwitch | null>(null)
  const [rankedPeripherals, setRankedPeripherals] = useState<{ id: string; name: string; tier: string; ranking: number; score: number | null }[]>([])
  const [brands, setBrands] = useState<{ id: string; name: string }[]>([])
  const [loadingBrands, setLoadingBrands] = useState(true)
  const [creatingBrand, setCreatingBrand] = useState(false)
  // Tiers por modo (adminTier_value, adminTier_magnetic, ...) só existem depois que o item
  // é ranqueado no board de drag-and-drop da Tierlist — o form não tem campo para editá-los,
  // então precisam ser preservados à parte para o preview ao vivo continuar mostrando o
  // seletor de modo (o mesmo que aparece na página pública do periférico).
  const [existingModeTiers, setExistingModeTiers] = useState<Record<string, unknown>>({})
  // Foto 2D do mouse (fundo preto, estilo eloshapes) — usada no bloco "Shape" da página
  // pública. Upload único, sem remoção de fundo (o admin já sobe a foto pronta).
  const [shapeImageFile, setShapeImageFile] = useState<File | null>(null)
  const [shapeImagePreview, setShapeImagePreview] = useState<string | null>(null)

  const form = useForm<PeripheralFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(peripheralSchema) as any,
    defaultValues: {
      name: "",
      brand_id: "",
      category: "mouse",
      tier: "__none__",
      price: 0,
      reviewCategory: null,
      reviewApproved: false,
      golpe: false,
      golpeMotivo: "",
      rankLabel: "", ranking: undefined, score: undefined, reviewUrl: "", soundUrl: "", guideUrl: "", wikiUrl: "",
      summary: "", highlights: "", pros: "", cons: "", gallery: "",
      softwareInfo: "", switchPeripheralId: "", priceTier: "",
      buyLinkAliexpress: "", buyLinkMercadoLivre: "", buyLinkAmazon: "", buyLinkShopee: "",
      compatibility: "", comparisons: "",
      weight: "", latency: "", switchType: "", coating: "", shape: "",
      pollingRate: "", battery: "", batteryLife: "", dimensions: "",
      actuationForce: "", totalTravel: "", magneticFlux: "", housing: "", stemType: "",
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
  const watchedKeyboardType = form.watch("keyboardType")

  // Alimenta o preview ao vivo (ver JSX mais abaixo): espelha os mesmos dados que
  // seriam salvos, então campos ainda vazios aparecem no preview exatamente como
  // aparecerão para quem visitar a página pública (com os textos de "não cadastrado").
  const watchedAll = form.watch()
  const previewGallery = images.slice(1)
  const previewData = {
    id: peripheralId ?? "preview",
    name: watchedAll.name?.trim() || "Nome do periférico",
    brand: brands.find((b) => b.id === watchedAll.brand_id)?.name || "Marca",
    category: watchedAll.category,
    tier: watchedAll.tier === "__none__" ? null : watchedAll.tier,
    price: watchedAll.price ?? 0,
    tags: selectedTag,
    image_url: images[0] ?? null,
    specs: {
      ...existingModeTiers,
      ...buildSpecsPayload(watchedAll, { selectedTierlistCategories, gallery: previewGallery, shapeImage: shapeImagePreview }),
    },
  }

  useEffect(() => {
    const validKeys = (TIERLIST_MODE_OPTIONS[watchedCategory] ?? []).map((option) => option.key)
    setSelectedTierlistCategories((prev) => prev.filter((mode) => validKeys.includes(mode)))
  }, [watchedCategory])

  // Autolimpeza de tags órfãs: se uma tag foi removida da config de uma categoria (ver
  // lib/tag-options.ts) mas um item antigo ainda a carrega, ela nunca aparece como checkbox
  // marcável abaixo. Antes isso só filtrava a tag órfã pra fora — se era a única tag do
  // item, o campo (obrigatório) ficava vazio e travava o save até o admin escolher uma tag
  // manualmente. Agora usa o mesmo fallback do resto do sistema (sanitizeTagsForCategory):
  // cai pra primeira tag válida da categoria atual, já corrigida ao abrir o item.
  useEffect(() => {
    setSelectedTag((prev) => sanitizeTagsForCategory(watchedCategory, prev))
  }, [watchedCategory])

  // O tipo de switch já diz se o teclado é magnético ou mecânico — usa esse sinal para manter
  // a categoria da Tierlist coerente sem exigir que o admin marque isso de novo manualmente.
  useEffect(() => {
    if (watchedCategory !== "keyboard") return
    if (watchedKeyboardType === "magnetic") {
      setSelectedTierlistCategories((prev) => Array.from(new Set([...prev.filter((m) => m !== "mechanical"), "magnetic" as TierlistMode])))
    } else if (watchedKeyboardType === "mechanical") {
      setSelectedTierlistCategories((prev) => Array.from(new Set([...prev.filter((m) => m !== "magnetic"), "mechanical" as TierlistMode])))
    }
  }, [watchedCategory, watchedKeyboardType])

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

  useEffect(() => {
    let cancelled = false
    setLoadingBrands(true)
    fetch("/api/admin/brands", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json: { brands?: { id: string; name: string }[] } | null) => {
        if (cancelled) return
        setBrands(json?.brands ?? [])
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingBrands(false)
      })
    return () => { cancelled = true }
  }, [])

  const brandComboboxOptions = useMemo(
    () => brands.map((brand) => ({ value: brand.id, label: brand.name })),
    [brands]
  )

  async function handleCreateBrand(name: string) {
    setCreatingBrand(true)
    try {
      const res = await fetch("/api/admin/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = (await res.json().catch(() => null)) as { brand?: { id: string; name: string }; error?: string } | null
      if (!res.ok || !json?.brand) throw new Error(json?.error ?? "Falha ao criar marca")
      setBrands((prev) => [...prev, json.brand!].sort((a, b) => a.name.localeCompare(b.name)))
      form.setValue("brand_id", json.brand.id, { shouldValidate: true })
    } catch (err) {
      toast.error("Falha ao criar marca", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setCreatingBrand(false)
    }
  }

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
          name: data.name, brand_id: data.brand_id, category: data.category,
          tier: data.tier ? mapTier(data.tier) : "__none__",
          price: displayedPrice,
          rankLabel: data.specs?.details?.rankLabel ?? "",
          ranking: data.specs?.details?.ranking ? Number(data.specs.details.ranking) : undefined,
          score: data.specs?.details?.score != null ? Number(data.specs.details.score) : undefined,
          reviewUrl: data.specs?.details?.reviewUrl ?? "",
          soundUrl: data.specs?.details?.soundUrl ?? "",
          guideUrl: data.specs?.details?.guideUrl ?? "",
          wikiUrl: data.specs?.details?.wikiUrl ?? "",
          summary: data.specs?.details?.summary ?? "",
          softwareInfo: data.specs?.details?.softwareInfo ?? "",
          switchPeripheralId: data.specs?.details?.switchPeripheralId ?? "",
          priceTier: data.specs?.details?.priceTier ?? "",
          highlights: Array.isArray(data.specs?.details?.highlights) ? data.specs.details.highlights.join("\n") : data.specs?.details?.highlights ?? "",
          pros: Array.isArray(data.specs?.details?.pros) ? data.specs.details.pros.join("\n") : data.specs?.details?.pros ?? "",
          cons: Array.isArray(data.specs?.details?.cons) ? data.specs.details.cons.join("\n") : data.specs?.details?.cons ?? "",
          gallery: "",
          ...Object.fromEntries(
            BUY_LINK_PLATFORMS.map((platform) => [
              platform.field,
              findBuyLinkUrl(data.specs?.details?.buyLinks, platform.matches),
            ])
          ),
          compatibility: data.specs?.details?.compatibility ?? "",
          comparisons: Array.isArray(data.specs?.details?.comparisons) ? data.specs.details.comparisons.join("\n") : data.specs?.details?.comparisons ?? "",
          latency: data.specs?.details?.latency ?? "",
          deadzone: data.specs?.details?.deadzone ?? "",
          rtMin: data.specs?.details?.rtMin ?? "",
          features: data.specs?.details?.features ?? "",
          switchType: data.specs?.details?.switchType ?? "",
          coating: data.specs?.details?.coating ?? "",
          actuationForce: data.specs?.details?.actuationForce ?? "",
          totalTravel: data.specs?.details?.totalTravel ?? "",
          magneticFlux: data.specs?.details?.magneticFlux ?? "",
          housing: data.specs?.details?.housing ?? "",
          stemType: data.specs?.details?.stemType ?? "",
          shape: data.specs?.details?.shape ?? "",
          pollingRate: data.specs?.details?.pollingRate ?? "",
          battery: data.specs?.details?.battery ?? "",
          batteryLife: data.specs?.details?.batteryLife ?? "",
          dimensions: data.specs?.details?.dimensions ?? "",
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
          reviewCategory: (["performance", "store", "videoReview", "specsComments"] as const).includes(
            data.specs?.reviewCategory as "performance" | "store" | "videoReview" | "specsComments"
          )
            ? (data.specs?.reviewCategory as "performance" | "store" | "videoReview" | "specsComments")
            : null,
          reviewApproved: data.specs?.reviewApproved === true,
          // O spread de `specs` vem ANTES dos campos migrados abaixo: specs
          // ainda contém esses 8 campos (dual-write), mas a coluna real tem
          // prioridade — se viesse depois do spread, sobrescreveria o valor
          // já lido da coluna nova de volta pro legado.
          ...data.specs,
          weight: data.weight_g != null ? String(data.weight_g) : (data.specs?.details?.weight ?? ""),
          connectivity: data.connectivity ?? data.specs?.connectivity ?? "",
          mouseShape: data.mouse_shape ?? data.specs?.mouseShape ?? "",
          keyboardLayout: data.keyboard_layout ?? data.specs?.keyboardLayout ?? "",
          surface: data.surface ?? data.specs?.surface ?? "",
          profile: data.profile ?? data.specs?.profile ?? "",
          panelType: data.panel_type ?? data.specs?.panelType ?? "",
          refreshRate: data.refresh_rate ?? data.specs?.refreshRate ?? undefined,
        })
        setSelectedTag(data.tags ?? [])
        setExistingModeTiers(
          Object.fromEntries(
            Object.entries(data.specs ?? {}).filter(([key]) => key.startsWith("adminTier_")),
          ),
        )
        const validTierlistKeys = (TIERLIST_MODE_OPTIONS[data.category as Category] ?? []).map((option) => option.key)
        const storedTierlistCategories = Array.isArray(data.specs?.tierlistCategories)
          ? (data.specs.tierlistCategories as string[])
          : validTierlistKeys
        setSelectedTierlistCategories(
          storedTierlistCategories.filter((mode): mode is TierlistMode => validTierlistKeys.includes(mode as TierlistMode))
        )
        const galleryArr = Array.isArray(data.specs?.details?.gallery) ? data.specs.details.gallery : []
        setImages([data.image_url, ...galleryArr].filter(Boolean))
        setShapeImagePreview(data.specs?.details?.shapeImage ?? null)
        setShapeImageFile(null)

        const switchId = data.specs?.details?.switchPeripheralId
        if (switchId) {
          setLinkedSwitch({ id: switchId, name: "Switch", image_url: null })
          try {
            const swRes = await fetch(`/api/admin/peripherals/${switchId}`, { cache: "no-store" })
            const swJson = (await swRes.json().catch(() => null)) as { peripheral?: { id: string; name: string; image_url: string | null } } | null
            if (swRes.ok && swJson?.peripheral) {
              setLinkedSwitch({ id: swJson.peripheral.id, name: swJson.peripheral.name, image_url: swJson.peripheral.image_url ?? null })
            }
          } catch { /* ignore — mantém o placeholder */ }
        } else {
          setLinkedSwitch(null)
        }
      }

      try {
        const linksRes = await fetch(`/api/admin/peripherals/${peripheralId}/links`, { cache: "no-store" })
        const linksJson = (await linksRes.json().catch(() => null)) as { store?: LinkedProduct | null } | null
        if (linksRes.ok && linksJson) {
          setLinkedStore(linksJson.store ?? null)
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
      if (!canWrite) {
        toast.error(t.admin.tierlistForm.readOnlyNoPermission)
        return
      }
      if (!selectedTag || selectedTag.length === 0) {
        const msg = t.admin.tierlistForm.selectTag
        setError(msg)
        toast.error(msg)
        return
      }

      const imageUrl = images[0] ?? null
      const finalGallery = images.slice(1)

      let shapeImageUrl = shapeImagePreview
      if (shapeImageFile) {
        setUploading(true)
        const shapeForm = new FormData()
        shapeForm.set("file", shapeImageFile)
        const shapeRes = await fetch("/api/admin/peripherals/upload-image", {
          method: "POST",
          body: shapeForm,
        })
        const shapeData = (await shapeRes.json().catch(() => null)) as { publicUrl?: string; error?: string } | null
        if (!shapeRes.ok || !shapeData?.publicUrl) {
          throw new Error(shapeData?.error ?? "Falha ao enviar a foto do shape")
        }
        shapeImageUrl = shapeData.publicUrl
      }

      const specs = buildSpecsPayload(data, { selectedTierlistCategories, gallery: finalGallery, shapeImage: shapeImageUrl })

      // Switches usam faixa de preço (priceTier); o valor numérico fica em 0.
      let priceToSave = data.category === "switches" ? 0 : data.price
      if (data.category !== "switches" && locale === "pt-BR" && originalUsdPrice !== null && usdToBrl && usdToBrl > 0) {
        priceToSave = Number((data.price / usdToBrl).toFixed(2))
      }

      const peripheralData = {
        name: data.name, brand_id: data.brand_id, category: data.category,
        tier: data.tier === "__none__" ? null : data.tier,
        price: priceToSave, image_url: imageUrl, tags: selectedTag || [], specs,
        ...buildPeripheralColumnsPayload(data),
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

  const imageSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function handleImageDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    setImages((prev) => {
      const oldIndex = prev.indexOf(active.id as string)
      const newIndex = prev.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  async function handleImageAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (images.length >= MAX_IMAGES) {
      toast.error("Limite de imagens atingido", {
        description: `Cada periférico pode ter no máximo ${MAX_IMAGES} imagens.`,
      })
      e.target.value = ""
      return
    }

    setUploading(true)
    setError(null)
    try {
      // Remove o fundo automaticamente (mesmo comportamento em toda foto adicionada).
      let prepared: File
      try {
        prepared = await removeBackground(file)
      } catch (err) {
        console.error("Falha ao remover o fundo:", err)
        prepared = await compressImageFile(file, IMAGE_COMPRESS_OPTIONS)
      }

      if (prepared.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        throw new Error(
          `Arquivo muito grande (máx. ${Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB mesmo após remoção de fundo).`
        )
      }
      const uploadForm = new FormData()
      uploadForm.set("file", prepared)
      const uploadRes = await fetch("/api/admin/peripherals/upload-image", {
        method: "POST",
        body: uploadForm,
      })
      const uploadData = (await uploadRes.json().catch(() => null)) as { publicUrl?: string; error?: string; ok?: boolean } | null
      if (!uploadRes.ok || !uploadData?.publicUrl) {
        throw new Error(uploadData?.error ?? t.admin.tierlistForm.failedUploadImage)
      }
      setImages((prev) => [...prev, uploadData.publicUrl as string])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  const handleShapeImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    const preview = await fileToDataUrl(file)
    setShapeImageFile(file)
    setShapeImagePreview(preview)
  }

  const removeShapeImage = () => {
    setShapeImageFile(null)
    setShapeImagePreview(null)
  }

  const toggleTag = (tag: Tag) =>
    setSelectedTag((prev) => prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag])

  const toggleTierlistCategory = (mode: TierlistMode) =>
    setSelectedTierlistCategories((prev) => prev.includes(mode) ? prev.filter((m) => m !== mode) : [...prev, mode])

  const setRating = (field: keyof PeripheralFormData, value: number | undefined) => {
    form.setValue(field as any, value)
  }

  const handleLinkedSwitchChange = (peripheral: LinkedSwitch | null) => {
    setLinkedSwitch(peripheral)
    form.setValue("switchPeripheralId", peripheral?.id ?? "")
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

        <div
          className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 py-20 shadow-[0_1px_0_0_rgba(255,255,255,0.06)_inset,0_16px_32px_-16px_rgba(0,0,0,0.85)]"
          style={{ backgroundColor: "#141416" }}
        >
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
    // @container/pf: o preview ao vivo só entra quando sobra espaço de verdade para os
    // dois lados — medido pela largura real desta área de conteúdo (não pela viewport),
    // já que a sidebar do admin pode ser recolhida ou não.
    <div className="@container/pf">
    <div className="grid gap-6 @5xl/pf:grid-cols-[minmax(0,1fr)_420px] @5xl/pf:items-start">
    <div className="min-w-0 space-y-6 pb-10">
      <BackBreadcrumb href={backHref} parentLabel={parentLabel} currentLabel={currentLabel} />

      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-300 shadow-[0_8px_20px_-12px_rgba(239,68,68,0.4)]">{error}</div>
      )}

      {!canWrite && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300 shadow-[0_8px_20px_-12px_rgba(245,158,11,0.4)]">
          {t.admin.tierlistForm.readOnlyBanner}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)}>
        <fieldset disabled={!canWrite} className="grid gap-5">

        {/* SECTION 1: Imagem */}
        <FormSection title={t.admin.tierlistForm.sectionImage} icon={<ImageIcon className="size-4" />} defaultOpen>
          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label>Fotos Principais do Anúncio</Label>
              <span className="text-[10px] text-muted-foreground">{images.length}/{MAX_IMAGES}</span>
            </div>
            <div className="flex flex-wrap gap-3">
              <DndContext
                sensors={imageSensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToParentElement]}
                onDragEnd={handleImageDragEnd}
              >
                <SortableContext items={images} strategy={rectSortingStrategy}>
                  {images.map((url, idx) => (
                    <SortableImageThumb
                      key={url}
                      url={url}
                      index={idx}
                      onRemove={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                    />
                  ))}
                </SortableContext>
              </DndContext>

              {images.length < MAX_IMAGES && (
                <label className={cn(
                  "flex size-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-border hover:text-foreground/80",
                  uploading && "cursor-wait opacity-50"
                )}>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageAdd}
                    disabled={uploading}
                  />
                  {uploading ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <>
                      <Plus className="size-5" />
                      <span className="text-[9px]">Adicionar</span>
                    </>
                  )}
                </label>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              O fundo é removido automaticamente ao enviar. Arraste pelo ícone no canto para
              reordenar. A primeira imagem é a principal. Até {MAX_IMAGES} imagens,{" "}
              {Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB cada.
            </p>
          </div>
        </FormSection>

        {/* SECTION 2: Informações Básicas */}
        <FormSection title={t.admin.tierlistForm.sectionBasicInfo} icon={<Info className="size-4" />} defaultOpen>
          <div className="space-y-4">
            {/* Review category + approval */}
            <div className="space-y-2 rounded-xl border border-white/10 px-4 py-3" style={{ backgroundColor: "#1c1c1f" }}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{t.admin.tierlistForm.reviewCategoryLabel}</p>
                  <p className="text-xs text-muted-foreground">{t.admin.tierlistForm.reviewCategoryHint}</p>
                </div>
                <button
                  type="button"
                  onClick={() => form.setValue("reviewApproved", !form.watch("reviewApproved"), { shouldDirty: true })}
                  className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                    form.watch("reviewApproved")
                      ? "border-emerald-400/60 bg-emerald-500/15 text-emerald-300"
                      : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                  }`}
                >
                  {form.watch("reviewApproved") ? t.admin.tierlistForm.reviewApprovedLabel : t.admin.tierlistForm.reviewNotApprovedLabel}
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {([
                  ["performance", t.admin.tierlistReview.categoryPerformance],
                  ["store", t.admin.tierlistReview.categoryStore],
                  ["videoReview", t.admin.tierlistReview.categoryVideoReview],
                  ["specsComments", t.admin.tierlistReview.categorySpecsComments],
                ] as const).map(([key, label]) => {
                  const active = form.watch("reviewCategory") === key
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        form.setValue("reviewCategory", active ? null : key, { shouldDirty: true })
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        active
                          ? "border-amber-400/60 bg-amber-500/15 text-amber-300"
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  )
                })}
              </div>
            </div>

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
                        ? "border-primary bg-primary/10 text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]"
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

            {/* Tierlist categories picker */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Categorias na Tierlist
              </label>
              <p className="text-xs text-muted-foreground/80">
                Selecione em quais abas da Tierlist pública este periférico deve aparecer. Se nenhuma for selecionada, ele continua salvo no banco de dados, mas não aparece na Tierlist.
              </p>
              <div className="flex flex-wrap gap-2">
                {(TIERLIST_MODE_OPTIONS[watchedCategory] ?? []).map((mode) => {
                  const active = selectedTierlistCategories.includes(mode.key)
                  return (
                    <button
                      key={mode.key}
                      type="button"
                      onClick={() => toggleTierlistCategory(mode.key)}
                      className={`rounded-lg border px-3 py-2 text-sm font-medium transition-all ${
                        active
                          ? "border-primary bg-primary/10 text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset]"
                          : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                      }`}
                    >
                      {mode.label}
                      {active && " ✓"}
                    </button>
                  )
                })}
              </div>
              {selectedTierlistCategories.length === 0 && (
                <p className="text-xs text-amber-400">Nenhuma categoria selecionada — este periférico não aparecerá na Tierlist pública.</p>
              )}
            </div>

            {/* GOLPE — só faz sentido pra faixa de preço (Custo Benefício), e não existe
                nas categorias onde "value" significa "Nacional" (mousepad/glasspad). */}
            {selectedTierlistCategories.includes("value") && watchedCategory !== "mousepad" && watchedCategory !== "glasspad" && (
              <div className="space-y-2 rounded-xl border border-white/10 px-4 py-3" style={{ backgroundColor: "#1c1c1f" }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">GOLPE</p>
                    <p className="text-xs text-muted-foreground">
                      Periférico ruim/barato hypado por afiliados (youtubers/tiktokers) apesar de não valer a pena. Marcando, ele sai da faixa de preço normal na aba Custo Benefício e aparece só na faixa GOLPE, com o motivo abaixo.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => form.setValue("golpe", !form.watch("golpe"), { shouldDirty: true })}
                    className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      form.watch("golpe")
                        ? "border-red-500/60 bg-red-500/15 text-red-300"
                        : "border-border text-muted-foreground hover:border-border/80 hover:text-foreground"
                    }`}
                  >
                    {form.watch("golpe") ? "GOLPE" : "Normal"}
                  </button>
                </div>
                {form.watch("golpe") && (
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs font-medium text-foreground">
                      Motivo <span className="text-red-400">*</span>
                    </label>
                    <Textarea
                      className="border-white/10 bg-[#1a1a1d] text-sm shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]"
                      placeholder="Ex.: preço muito acima do que entrega, qualidade de construção ruim, promovido só por comissão de afiliado..."
                      rows={3}
                      {...form.register("golpeMotivo")}
                    />
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {t.admin.tierlistForm.name} <span className="text-red-400">*</span>
                </label>
                <Input
                  className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]"
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
                <Combobox
                  options={brandComboboxOptions}
                  value={form.watch("brand_id")}
                  onValueChange={(value) => form.setValue("brand_id", value, { shouldValidate: true })}
                  onCreateOption={handleCreateBrand}
                  creating={creatingBrand}
                  placeholder={loadingBrands ? "Carregando marcas..." : t.admin.tierlistForm.selectBrand}
                  searchPlaceholder={t.admin.tierlistForm.searchBrand}
                  className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]"
                  disabled={loadingBrands}
                  aria-invalid={!!form.formState.errors.brand_id}
                />
                <p className="text-[10px] text-muted-foreground/60">
                  {t.admin.tierlistForm.brandHint}
                </p>
                {form.formState.errors.brand_id && <p className="text-xs text-red-400">{form.formState.errors.brand_id.message}</p>}
              </div>
            </div>

            {watchedCategory === "switches" ? (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {"Faixa de preço"} <span className="text-red-400">*</span>
                </label>
                <Select value={form.watch("priceTier") || ""} onValueChange={(v) => form.setValue("priceTier", v)}>
                  <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
                    <SelectValue placeholder={"Selecione uma faixa"} />
                  </SelectTrigger>
                  <SelectContent>
                    {SWITCH_PRICE_TIERS.map((tier) => (
                      <SelectItem key={tier.key} value={tier.key}>{tier.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground/60">
                  {"Switches usam faixa em vez de valor exato."}
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">
                  {t.admin.tierlistForm.priceUsd} <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                  <Input
                    className="h-9 border-white/10 bg-[#1a1a1d] pl-7 shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]"
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
            )}
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
        <FormSection title="Tag" icon={<TagIcon className="size-4" />} defaultOpen>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              "Obrigatório — selecione ao menos uma tag que descreva este periférico."
            </p>
            <div className="flex flex-wrap gap-2">
              {getTagOptionsForCategory(watchedCategory).map((tag) => {
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
          id="section-ratings"
          forceOpen={forceOpenIds.has("section-ratings")}
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
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2">
              {RATING_FIELDS.map((field) => {
                let label = field.ptLabel
                if (field.key === "ratingBattery" && watchedCategory === "keyboard") {
                  label = "Digitação"
                }
                // PCB avulsa: quem monta o teclado define construção e digitação depois,
                // então essas duas notas não fazem sentido aqui.
                if (watchedCategory === "pcb" && (field.key === "ratingBuild" || field.key === "ratingBattery")) {
                  return null
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
                  if (field.key === "ratingQc") label = "QC"
                  if (field.key === "ratingMaintenance") return null
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
        <FormSection id="section-technical-specs" forceOpen={forceOpenIds.has("section-technical-specs")} title={t.admin.tierlistForm.sectionTechnicalSpecs} icon={<FileText className="size-4" />} defaultOpen>
          <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Pontuação"}</label>
              <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" type="number" min={0} step={0.25} placeholder="788.5" {...form.register("score", { valueAsNumber: true })} />
            </div>

            {watchedCategory === "mouse" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Formato"}</label>
                  <Select value={form.watch("mouseShape") || ""} onValueChange={(v) => form.setValue("mouseShape", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="HERO 2, PMW 3395" {...form.register("driver")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Peso"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="61g" {...form.register("weight")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Latência"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="0.62ms" {...form.register("latency")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Switch</label>
                  <Select value={form.watch("switchType") || ""} onValueChange={(v) => form.setValue("switchType", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="magnetic">{"Magnético"}</SelectItem>
                      <SelectItem value="optical">{"Óptico"}</SelectItem>
                      <SelectItem value="mechanical">{"Mecânico"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Vincular Switch (opcional)"}</label>
                  <LinkedSwitchPicker value={linkedSwitch} onChange={handleLinkedSwitchChange} />
                  <p className="text-[10px] text-muted-foreground/60">{"Aponta para um Switch cadastrado — vira link na página. Se vazio, mostra o texto acima."}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Coating</label>
                  <Select value={form.watch("coating") || ""} onValueChange={(v) => form.setValue("coating", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Polling Rate"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="8000Hz" {...form.register("pollingRate")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Bateria"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="500mAh" {...form.register("battery")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Autonomia"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="70h" {...form.register("batteryLife")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Dimensões (CxLxA)"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="125 x 63.5 x 40 mm" {...form.register("dimensions")} />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Foto do Shape (fundo preto)"}</label>
                  <p className="text-[10px] text-muted-foreground/60">{"Foto 2D do mouse visto de cima, em fundo preto — padrão estilo eloshapes, pensada para comparação entre mouses."}</p>
                  {shapeImagePreview ? (
                    <div className="relative group w-32 h-24 rounded-lg overflow-hidden border border-border bg-black">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={shapeImagePreview} alt="Shape" className="w-full h-full object-contain p-2" />
                      <button
                        type="button"
                        onClick={removeShapeImage}
                        className="absolute top-0.5 right-0.5 size-5 flex items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/15 bg-[#141416] p-3 transition hover:border-primary/40 hover:bg-primary/[0.06]">
                      <input accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleShapeImageSelect} type="file" />
                      <Upload className="size-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{"Enviar foto"}</span>
                    </label>
                  )}
                </div>
                <div className="md:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="800g" {...form.register("weight")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</label>
                  <Select value={form.watch("keyboardType") || ""} onValueChange={(v) => form.setValue("keyboardType", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder={"Linear, Tátil, Clicky"} {...form.register("switchType")} />
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Vincular Switch (opcional)"}</label>
                  <LinkedSwitchPicker value={linkedSwitch} onChange={handleLinkedSwitchChange} />
                  <p className="text-[10px] text-muted-foreground/60">{"Aponta para um Switch cadastrado — vira link na página. Se vazio, mostra o texto acima."}</p>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Latência"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="0.5ms" {...form.register("latency")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deadzone</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="0.1mm" {...form.register("deadzone")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RT Mínimo</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="0.1mm" {...form.register("rtMin")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plate</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" type="button" className="h-9 w-full justify-between border-white/10 bg-[#1a1a1d] px-3 font-normal shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 hover:bg-[#202024]">
                        <span className="line-clamp-1 text-sm">
                          {form.watch("keyboardPlate") || "Selecione"}
                        </span>
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48">
                      {(["FR4", "Carbono", "Alumínio", "Polipropileno", "PC"]).map((opt) => {
                        const current = form.watch("keyboardPlate") || ""
                        const selected = current.split("/").map((s) => s.trim()).includes(opt)
                        return (
                          <DropdownMenuCheckboxItem
                            key={opt}
                            checked={selected}
                            onCheckedChange={(checked) => {
                              const currArr = current.split("/").map((s) => s.trim()).filter(Boolean)
                              const next = checked
                                ? Array.from(new Set([...currArr, opt]))
                                : currArr.filter((c) => c !== opt)
                              form.setValue("keyboardPlate", next.join(" / "))
                            }}
                          >
                            {opt}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hot Swap</label>
                  <Select value={form.watch("hotSwap") || ""} onValueChange={(v) => form.setValue("hotSwap", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" type="button" className="h-9 w-full justify-between border-white/10 bg-[#1a1a1d] px-3 font-normal shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 hover:bg-[#202024]">
                        <span className="line-clamp-1 text-sm">
                          {form.watch("keyboardCase") || "Selecione"}
                        </span>
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48">
                      {(["Plástico", "Fibra de Carbono", "Alumínio", "Magnésio", "Acrílico", "Madeira"]).map((opt) => {
                        const current = form.watch("keyboardCase") || ""
                        const selected = current.split("/").map((s) => s.trim()).includes(opt)
                        return (
                          <DropdownMenuCheckboxItem
                            key={opt}
                            checked={selected}
                            onCheckedChange={(checked) => {
                              const currArr = current.split("/").map((s) => s.trim()).filter(Boolean)
                              const next = checked
                                ? Array.from(new Set([...currArr, opt]))
                                : currArr.filter((c) => c !== opt)
                              form.setValue("keyboardCase", next.join(" / "))
                            }}
                          >
                            {opt}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="Rapid Trigger, Hall Effect, RGB..." {...form.register("features")} />
                </div>
              </>
            )}

            {watchedCategory === "pcb" && (
              <>
                {/* PCB avulsa: mesmas specs do Teclado, exceto Switch — quem monta o
                    teclado depois escolhe e instala o switch. */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layout</label>
                  <Select value={form.watch("keyboardLayout") || ""} onValueChange={(v) => form.setValue("keyboardLayout", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="800g" {...form.register("weight")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Type</label>
                  <Select value={form.watch("keyboardType") || ""} onValueChange={(v) => form.setValue("keyboardType", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Latência"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="0.5ms" {...form.register("latency")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deadzone</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="0.1mm" {...form.register("deadzone")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">RT Mínimo</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="0.1mm" {...form.register("rtMin")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plate</label>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" type="button" className="h-9 w-full justify-between border-white/10 bg-[#1a1a1d] px-3 font-normal shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 hover:bg-[#202024]">
                        <span className="line-clamp-1 text-sm">
                          {form.watch("keyboardPlate") || "Selecione"}
                        </span>
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48">
                      {(["FR4", "Carbono", "Alumínio", "Polipropileno", "PC"]).map((opt) => {
                        const current = form.watch("keyboardPlate") || ""
                        const selected = current.split("/").map((s) => s.trim()).includes(opt)
                        return (
                          <DropdownMenuCheckboxItem
                            key={opt}
                            checked={selected}
                            onCheckedChange={(checked) => {
                              const currArr = current.split("/").map((s) => s.trim()).filter(Boolean)
                              const next = checked
                                ? Array.from(new Set([...currArr, opt]))
                                : currArr.filter((c) => c !== opt)
                              form.setValue("keyboardPlate", next.join(" / "))
                            }}
                          >
                            {opt}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Hot Swap</label>
                  <Select value={form.watch("hotSwap") || ""} onValueChange={(v) => form.setValue("hotSwap", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" type="button" className="h-9 w-full justify-between border-white/10 bg-[#1a1a1d] px-3 font-normal shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 hover:bg-[#202024]">
                        <span className="line-clamp-1 text-sm">
                          {form.watch("keyboardCase") || "Selecione"}
                        </span>
                        <ChevronDown className="size-4 text-muted-foreground shrink-0" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-48">
                      {(["Plástico", "Fibra de Carbono", "Alumínio", "Magnésio", "Acrílico", "Madeira"]).map((opt) => {
                        const current = form.watch("keyboardCase") || ""
                        const selected = current.split("/").map((s) => s.trim()).includes(opt)
                        return (
                          <DropdownMenuCheckboxItem
                            key={opt}
                            checked={selected}
                            onCheckedChange={(checked) => {
                              const currArr = current.split("/").map((s) => s.trim()).filter(Boolean)
                              const next = checked
                                ? Array.from(new Set([...currArr, opt]))
                                : currArr.filter((c) => c !== opt)
                              form.setValue("keyboardCase", next.join(" / "))
                            }}
                          >
                            {opt}
                          </DropdownMenuCheckboxItem>
                        )
                      })}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Features</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="Rapid Trigger, Hall Effect, RGB..." {...form.register("features")} />
                </div>
              </>
            )}

            {watchedCategory === "mousepad" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Surface</label>
                  <Select value={form.watch("surface") || ""} onValueChange={(v) => form.setValue("surface", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="144" type="number" step="1" {...form.register("refreshRate", { valueAsNumber: true })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Panel</label>
                  <Select value={form.watch("panelType") || ""} onValueChange={(v) => form.setValue("panelType", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
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
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="Windows, macOS, PS5" {...form.register("compatibility")} />
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

            {watchedCategory === "switches" && (
              <>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Tipo"}</label>
                  <Select value={form.watch("keyboardType") || ""} onValueChange={(v) => form.setValue("keyboardType", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="magnetic">{"Magnético"}</SelectItem>
                      <SelectItem value="mechanical">{"Mecânico"}</SelectItem>
                      <SelectItem value="optical">{"Óptico"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Força de atuação"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="37gf" {...form.register("actuationForce")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Curso total"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="3.5mm" {...form.register("totalTravel")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Fluxo magnético"}</label>
                  <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="Ex.: valor / curva magnética" {...form.register("magneticFlux")} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Carcaça"}</label>
                  <Select value={form.watch("housing") || ""} onValueChange={(v) => form.setValue("housing", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Opaca (Nylon)">{"Opaca (Nylon)"}</SelectItem>
                      <SelectItem value="Transparente (Policarbonato)">{"Transparente (Policarbonato)"}</SelectItem>
                      <SelectItem value="Mista (Híbrida)">{"Mista (Híbrida)"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{"Tipo do Stem"}</label>
                  <Select value={form.watch("stemType") || ""} onValueChange={(v) => form.setValue("stemType", v)}>
                    <SelectTrigger className="border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]">
                      <SelectValue placeholder={"Selecione"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="POM">{"POM"}</SelectItem>
                      <SelectItem value="MX">{"MX"}</SelectItem>
                      <SelectItem value="BOX">{"BOX"}</SelectItem>
                      <SelectItem value="Dustproof">{"Dustproof"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
        </FormSection>

        {/* SECTION 7: Wiki / Conteúdo */}
        <FormSection id="section-wiki-content" forceOpen={forceOpenIds.has("section-wiki-content")} title={t.admin.tierlistForm.sectionWikiContent} icon={<FileText className="size-4" />} defaultOpen={false}>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{"Review Completo"}</label>
              <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="https://youtube.com/..." {...form.register("reviewUrl")} />
            </div>

            {watchedCategory === "switches" && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{"Vídeo do Som"}</label>
                <Input className="h-9 border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder="https://youtube.com/... ou https://.../som.mp4" {...form.register("soundUrl")} />
                <p className="text-[10px] text-muted-foreground">{"Link do YouTube ou arquivo de vídeo direto (.mp4/.webm). Aparece ao lado das especificações na página do switch."}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{"Software"}</label>
              <Textarea className="resize-none border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder={"Plataformas, softwares e requisitos de compatibilidade"} rows={3} {...form.register("softwareInfo")} />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">{"Comentários"}</label>
              <Textarea className="resize-none border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]" placeholder={"Opinião geral e recomendação sobre o produto"} rows={3} {...form.register("summary")} />
            </div>

            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              {[
                { field: "pros", label: "Pros" },
                { field: "cons", label: "Cons" },
              ].map(({ field, label }) => (
                <div key={field} className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">{label}</label>
                  <Textarea
                    className="resize-none border-white/10 bg-[#1a1a1d] shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024]"
                    placeholder={"Um por linha"}
                    rows={4}
                    {...form.register(field as any)}
                  />
                  <p className="text-[10px] text-muted-foreground">{"Cada linha vira um item separado"}</p>
                </div>
              ))}
            </div>

          </div>
        </FormSection>

        {/* SECTION: Produtos vinculados */}
        <FormSection id="section-linked-products" forceOpen={forceOpenIds.has("section-linked-products")} title={t.admin.tierlistForm.sectionLinkedProducts} icon={<Link2 className="size-4" />} defaultOpen={false}>
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Vincule este periférico a um produto da Loja. O vínculo aparece na página do periférico, e a página do produto na Loja mostra o periférico correspondente.
            </p>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-foreground">{t.admin.tierlistForm.linkedStoreProduct}</label>
                <LinkedProductPicker
                  value={linkedStore}
                  onChange={setLinkedStore}
                  excludeId={null}
                  t={t}
                />
              </div>
            </div>
          </div>
        </FormSection>

        {/* SECTION 8: Links de compra */}
        <FormSection id="section-buy-links" forceOpen={forceOpenIds.has("section-buy-links")} title={t.admin.tierlistForm.sectionBuyLinks} icon={<ShoppingCart className="size-4" />} defaultOpen={false}>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Preencha o link de cada loja em que o produto está disponível. Lojas sem link não aparecem na página do periférico.
            </p>
            <div className="grid grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
              {BUY_LINK_PLATFORMS.map((platform) => (
                <div key={platform.field} className="space-y-1.5">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <span className={`size-2.5 rounded-full ${platform.dot}`} />
                    {platform.label}
                  </label>
                  <Input
                    className={`h-9 border-white/10 bg-[#1a1a1d] text-sm shadow-[0_1px_0_0_rgba(255,255,255,0.04)_inset] transition-colors hover:border-white/20 focus-visible:bg-[#202024] ${platform.ring}`}
                    placeholder="https://..."
                    {...form.register(platform.field)}
                  />
                </div>
              ))}
            </div>
          </div>
        </FormSection>
        </fieldset>

        {/* Footer actions */}
        <div className="sticky bottom-4 z-10 mt-5 flex justify-end gap-3 rounded-xl border border-white/10 p-3 shadow-[0_12px_28px_-14px_rgba(0,0,0,0.85)] backdrop-blur" style={{ backgroundColor: "rgba(20,20,22,0.9)" }}>
          <Link href={backHref}>
            <Button variant="outline">{t.admin.tierlistForm.cancel}</Button>
          </Link>
          <Button disabled={!canWrite || uploading || form.formState.isSubmitting} type="submit" className="min-w-28">
            {uploading || form.formState.isSubmitting
              ? t.admin.tierlistForm.saving
              : peripheralId
                ? t.admin.tierlistForm.saveChanges
                : t.admin.tierlistForm.createPeripheral}
          </Button>
        </div>
      </form>
    </div>

    <aside className="hidden @5xl/pf:block">
      <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-auto rounded-2xl border border-white/10 p-4 shadow-[0_16px_32px_-16px_rgba(0,0,0,0.85)]" style={{ backgroundColor: "#141416" }}>
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/15">
            <Eye className="size-3.5" />
          </span>
          Pré-visualização
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          É assim que a página pública vai ficar com o que já foi preenchido até agora.
        </p>
        <PeripheralDetailView
          data={previewData}
          linkedStore={linkedStore}
          linkedSwitch={linkedSwitch}
          rankingHref="/admin/ranking"
        />
      </div>
    </aside>
    </div>
    </div>
  )
}
