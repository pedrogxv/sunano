"use client"

import { useEffect, useRef, useState } from "react"
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
import { Ban, GripVertical, Loader2, Minus, Plus, Sparkles, Trash2, Upload, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Combobox, MultiCombobox, type ComboboxOption } from "@/components/ui/combobox"
import { TextFormatToolbar } from "@/components/forum/TextFormatToolbar"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { isValidYoutubeUrl } from "@/lib/youtube-url"
import { removeBackground } from "@/lib/client/remove-background"
import { compressImageFile } from "@/lib/client/compress-image"
import { EmojiPicker } from "@/components/ui/emoji-picker"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"

interface StoreProductSpec {
  id?: string
  label: string
  value: string
}

interface StoreProductVariantInput {
  id?: string
  label: string
  price_cents_override: number | null
  promo_price_cents: number | null
  stock: number | null
  color: string | null
  icon: string | null
  image_url: string | null
  images?: string[]
  is_sold_out?: boolean
}

interface StoreProductVariantRow {
  id?: string
  /** Chave estável no client (== `id` quando já persistida, gerada localmente quando nova)
   *  usada só para amarrar a matriz de combinações Cor × Variante antes do id real existir. */
  clientKey: string
  label: string
  color: string | null
  icon: string | null
  image_url: string | null
  images: string[]
  is_sold_out: boolean
}

interface StoreProductVariantGroupOptionInput {
  id?: string
  label: string
  price_cents_override: number | null
  is_sold_out: boolean
}

interface StoreProductVariantGroupInput {
  id?: string
  name: string
  options: StoreProductVariantGroupOptionInput[]
}

interface VariantGroupOptionRow {
  id?: string
  /** Mesma ideia de `StoreProductVariantRow.clientKey`. */
  clientKey: string
  label: string
  price_brl: string
  is_sold_out: boolean
}

interface VariantGroupRow {
  id?: string
  name: string
  options: VariantGroupOptionRow[]
}

interface StoreProduct {
  id: string
  slug: string
  name: string
  description: string | null
  price_cents: number
  promo_price_cents?: number | null
  stock: number | null
  images: string[]
  category: string | null
  brand: string | null
  type: "store"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  sale_type: "pre_order" | "ready_stock" | "normal"
  is_active: boolean
  is_sold_out: boolean
  features?: string[]
  video_url?: string | null
}

interface StoreProductFormProps {
  product?: StoreProduct
  initialSpecs?: StoreProductSpec[]
  initialVariants?: StoreProductVariantInput[]
  initialVariantGroups?: StoreProductVariantGroupInput[]
  initialCombinations?: Array<{ variant_id: string; option_id: string }>
  initialPeripheralIds?: string[]
  onSuccess: (product: StoreProduct) => void
  onCancel: () => void
}

interface PeripheralOption {
  id: string
  name: string
  brand: string
}

/** Formato retornado por `GET /api/peripherals?full=1` — ver `PeripheralSummary`
 * em lib/server/repositories/peripherals-repository.ts. Só os campos usados
 * pelo autofill estão listados aqui. */
interface PeripheralFullData {
  id: string
  name: string
  brand: string
  category: string
  price?: number
  image_url: string | null
  tags?: string[]
  weightG?: number | null
  connectivity?: string | null
  mouseShape?: string | null
  keyboardLayout?: string | null
  surface?: string | null
  profile?: string | null
  panelType?: string | null
  refreshRate?: number | null
  specs?: {
    details?: {
      summary?: string
      highlights?: string[]
      pros?: string[]
      cons?: string[]
      gallery?: string[]
      weight?: string
      latency?: string
      switchType?: string
      coating?: string
      actuationForce?: string
      totalTravel?: string
      magneticFlux?: string
      housing?: string
      stemType?: string
      pollingRate?: string
      battery?: string
      batteryLife?: string
      dimensions?: string
      deadzone?: string
      rtMin?: string
      features?: string
    }
  }
}

/** Categoria do periférico -> categoria da loja. Os valores coincidem na maior
 * parte (ver CATEGORIES abaixo); "pcb" não tem equivalente direto na loja. */
const PERIPHERAL_TO_STORE_CATEGORY: Record<string, string> = {
  mouse: "mouse",
  keyboard: "keyboard",
  mousepad: "mousepad",
  glasspad: "glasspad",
  headset: "headset",
  iem: "iem",
  switches: "switches",
  dac_amp: "dac_amp",
  feet: "feet",
}

type PeripheralDetails = NonNullable<NonNullable<PeripheralFullData["specs"]>["details"]>

/** Rótulos em pt-BR pros mesmos campos exibidos na página pública do periférico
 * (ver components/peripherals/PeripheralDetailView.tsx) — reaproveitados aqui
 * pra montar a tabela de Especificação Técnica do produto da loja. */
const PERIPHERAL_SPEC_LABELS: Array<{ key: keyof PeripheralDetails; label: string }> = [
  { key: "weight", label: "Peso" },
  { key: "latency", label: "Latência" },
  { key: "switchType", label: "Switch" },
  { key: "coating", label: "Coating" },
  { key: "actuationForce", label: "Força de atuação" },
  { key: "totalTravel", label: "Curso total" },
  { key: "magneticFlux", label: "Fluxo magnético" },
  { key: "housing", label: "Carcaça" },
  { key: "stemType", label: "Tipo do Stem" },
  { key: "pollingRate", label: "Polling Rate" },
  { key: "battery", label: "Bateria" },
  { key: "batteryLife", label: "Autonomia" },
  { key: "dimensions", label: "Dimensões (CxLxA)" },
  { key: "deadzone", label: "Deadzone" },
  { key: "rtMin", label: "RT Mínimo" },
  { key: "features", label: "Features" },
]

function buildAutofillFromPeripheral(p: PeripheralFullData): {
  category: string | null
  brand: string
  specs: StoreProductSpec[]
  description: string
  images: string[]
} {
  const details = p.specs?.details ?? {}

  const specs: StoreProductSpec[] = []
  const pushSpec = (label: string, value: string | null | undefined) => {
    if (value != null && String(value).trim()) specs.push({ label, value: String(value).trim() })
  }

  // Colunas reais têm prioridade sobre `specs.details` (dual-write legado) — mesma
  // regra de leitura usada na página pública do periférico.
  pushSpec("Peso", p.weightG != null ? `${p.weightG}g` : details.weight)
  pushSpec("Conectividade", p.connectivity)
  pushSpec("Shape", p.mouseShape)
  pushSpec("Layout", p.keyboardLayout)
  pushSpec("Superfície", p.surface)
  pushSpec("Perfil", p.profile)
  pushSpec("Tipo de Painel", p.panelType)
  pushSpec("Taxa de Atualização", p.refreshRate != null ? `${p.refreshRate}Hz` : undefined)
  for (const { key, label } of PERIPHERAL_SPEC_LABELS) {
    pushSpec(label, details[key] as string | undefined)
  }

  const descriptionParts: string[] = []
  if (details.summary) descriptionParts.push(details.summary)
  if (details.highlights && details.highlights.length > 0) {
    descriptionParts.push(details.highlights.map((h) => `• ${h}`).join("\n"))
  }
  const description = descriptionParts.join("\n\n")

  const images = [p.image_url, ...(details.gallery ?? [])].filter((url): url is string => !!url)

  return {
    category: PERIPHERAL_TO_STORE_CATEGORY[p.category] ?? null,
    brand: p.brand,
    specs,
    description,
    images,
  }
}

const CATEGORIES = [
  { value: "mouse", label: "Mouse" },
  { value: "keyboard", label: "Teclado" },
  { value: "mousepad", label: "Mousepad" },
  { value: "glasspad", label: "Glasspad" },
  { value: "headset", label: "Headset" },
  { value: "iem", label: "IEM" },
  { value: "switches", label: "Switches" },
  { value: "dac_amp", label: "DAC/AMP" },
  { value: "feet", label: "Feet" },
  { value: "acessorio", label: "Acessório" },
  { value: "services", label: "Serviços" },
  { value: "outro", label: "Outro" },
]

const NO_CATEGORY = "__none__"
const MAX_STOCK = 999_999
const MAX_IMAGES = 8
const MAX_VARIANT_IMAGES = 3
const MAX_VARIANTS = 12
const MAX_VARIANT_GROUPS = 6
const VARIANT_COLOR_PRESETS: { label: string; color: string }[] = [
  { label: "Preto", color: "#000000" },
  { label: "Branco", color: "#ffffff" },
  { label: "Prata", color: "#c0c0c0" },
  { label: "Roxo", color: "#8b5cf6" },
  { label: "Verde", color: "#22c55e" },
  { label: "Vermelho", color: "#ef4444" },
  { label: "Azul", color: "#3b82f6" },
]
const MAX_OPTIONS_PER_VARIANT_GROUP = 12
const MIN_PRICE_CENTS = 600
const MAX_IMAGE_FILE_SIZE_BYTES = 5 * 1024 * 1024
const IMAGE_COMPRESS_OPTIONS = {
  maxDimension: 2000,
  targetBytes: 1.5 * 1024 * 1024,
  skipBelowBytes: 800 * 1024,
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

export function StoreProductForm({
  product,
  initialSpecs,
  initialVariants,
  initialVariantGroups,
  initialCombinations,
  initialPeripheralIds,
  onSuccess,
  onCancel,
}: StoreProductFormProps) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [disableBackgroundRemoval, setDisableBackgroundRemoval] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price_brl: product ? (product.price_cents / 100).toFixed(2) : "",
    promo_price_brl: product?.promo_price_cents != null ? (product.promo_price_cents / 100).toFixed(2) : "",
    stock: product?.stock != null ? product.stock.toString() : "1",
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    condition: product?.condition ?? "new",
    condition_notes: product?.condition_notes ?? "",
    sale_type: product?.sale_type ?? "normal",
    is_active: product?.is_active !== false,
    is_sold_out: product?.is_sold_out ?? false,
    video_url: product?.video_url ?? "",
  })

  const [hasStock, setHasStock] = useState(product ? product.stock != null : true)
  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [specs, setSpecs] = useState<StoreProductSpec[]>(
    initialSpecs && initialSpecs.length > 0 ? initialSpecs : [{ label: "", value: "" }]
  )
  const [variants, setVariants] = useState<StoreProductVariantRow[]>(
    (initialVariants ?? []).map((v) => ({
      id: v.id,
      clientKey: v.id ?? crypto.randomUUID(),
      label: v.label,
      color: v.color ?? null,
      icon: v.icon ?? null,
      image_url: v.image_url ?? null,
      images: v.images ?? [],
      is_sold_out: v.is_sold_out ?? false,
    }))
  )
  const [uploadingVariantImage, setUploadingVariantImage] = useState<number | null>(null)
  const [variantGroups, setVariantGroups] = useState<VariantGroupRow[]>(
    (initialVariantGroups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      options: g.options.map((o) => ({
        id: o.id,
        clientKey: o.id ?? crypto.randomUUID(),
        label: o.label,
        price_brl: o.price_cents_override != null ? (o.price_cents_override / 100).toFixed(2) : "",
        is_sold_out: o.is_sold_out,
      })),
    }))
  )
  // Chave `${variantClientKey}|${optionClientKey}` -> esgotado. Só usada quando
  // o produto tem Cor E Variante juntos (ver seção "Estoque por combinação" no
  // render). Pra linhas já existentes clientKey == id, então os pares de
  // initialCombinations (que vêm por id do banco) já batem direto.
  const [combinations, setCombinations] = useState<Set<string>>(() => {
    const variantIds = new Set((initialVariants ?? []).map((v) => v.id).filter((id): id is string => Boolean(id)))
    const optionIds = new Set(
      (initialVariantGroups ?? []).flatMap((g) => g.options.map((o) => o.id).filter((id): id is string => Boolean(id)))
    )
    return new Set(
      (initialCombinations ?? [])
        .filter((c) => variantIds.has(c.variant_id) && optionIds.has(c.option_id))
        .map((c) => `${c.variant_id}|${c.option_id}`)
    )
  })
  const [peripheralIds, setPeripheralIds] = useState<string[]>(initialPeripheralIds ?? [])
  const [peripheralOptions, setPeripheralOptions] = useState<PeripheralOption[]>([])
  const [autofilling, setAutofilling] = useState(false)

  useEffect(() => {
    let mounted = true
    fetch("/api/peripherals?limit=1000", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { peripherals?: PeripheralOption[] }) => {
        if (mounted) setPeripheralOptions(data.peripherals ?? [])
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  const BRAND_PAGE_SIZE = 20
  const [brandOptions, setBrandOptions] = useState<{ id: string; name: string }[]>([])
  const [brandSearch, setBrandSearch] = useState("")
  const debouncedBrandSearch = useDebouncedValue(brandSearch, 300)
  const [brandPage, setBrandPage] = useState(1)
  const [loadingBrands, setLoadingBrands] = useState(false)
  const [loadingMoreBrands, setLoadingMoreBrands] = useState(false)
  const [brandTotal, setBrandTotal] = useState(0)
  const brandRequestId = useRef(0)

  useEffect(() => {
    setBrandPage(1)
    setLoadingBrands(true)
    const currentRequest = ++brandRequestId.current
    const params = new URLSearchParams({ page: "1", pageSize: String(BRAND_PAGE_SIZE) })
    if (debouncedBrandSearch.trim()) params.set("search", debouncedBrandSearch.trim())

    fetch(`/api/admin/brands?${params}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { brands?: { id: string; name: string }[]; total?: number }) => {
        if (currentRequest !== brandRequestId.current) return
        setBrandOptions(data.brands ?? [])
        setBrandTotal(data.total ?? 0)
      })
      .catch(() => {
        if (currentRequest === brandRequestId.current) setBrandOptions([])
      })
      .finally(() => {
        if (currentRequest === brandRequestId.current) setLoadingBrands(false)
      })
  }, [debouncedBrandSearch])

  function handleLoadMoreBrands() {
    const nextPage = brandPage + 1
    setLoadingMoreBrands(true)
    const currentRequest = brandRequestId.current
    const params = new URLSearchParams({ page: String(nextPage), pageSize: String(BRAND_PAGE_SIZE) })
    if (debouncedBrandSearch.trim()) params.set("search", debouncedBrandSearch.trim())

    fetch(`/api/admin/brands?${params}`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { brands?: { id: string; name: string }[]; total?: number }) => {
        if (currentRequest !== brandRequestId.current) return
        setBrandOptions((prev) => [...prev, ...(data.brands ?? [])])
        setBrandTotal(data.total ?? 0)
        setBrandPage(nextPage)
      })
      .catch(() => {})
      .finally(() => setLoadingMoreBrands(false))
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

  function updateVariant(index: number, field: "label", value: string) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  function setVariantColor(index: number, color: string | null) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, color } : v)))
  }

  function setVariantIcon(index: number, icon: string | null) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, icon: v.icon === icon ? null : icon } : v)))
  }

  function toggleVariantSoldOut(index: number) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, is_sold_out: !v.is_sold_out } : v)))
  }

  function addVariantRow() {
    setVariants((prev) => {
      if (prev.length >= MAX_VARIANTS) {
        toast.error("Limite de variantes atingido", {
          description: `Cada produto pode ter no máximo ${MAX_VARIANTS} variantes.`,
        })
        return prev
      }
      return [
        ...prev,
        {
          clientKey: crypto.randomUUID(),
          label: "",
          color: null,
          icon: null,
          image_url: null,
          images: [],
          is_sold_out: false,
        },
      ]
    })
  }

  function addVariantColorPreset(label: string, color: string) {
    setVariants((prev) => {
      const isDuplicate = prev.some(
        (v) => v.label.trim().toLowerCase() === label.toLowerCase() || v.color === color
      )
      if (isDuplicate) {
        toast.error("Cor já cadastrada", {
          description: `Este produto já tem uma variante "${label}" ou com essa cor.`,
        })
        return prev
      }
      if (prev.length >= MAX_VARIANTS) {
        toast.error("Limite de variantes atingido", {
          description: `Cada produto pode ter no máximo ${MAX_VARIANTS} variantes.`,
        })
        return prev
      }
      return [
        ...prev,
        {
          clientKey: crypto.randomUUID(),
          label,
          color,
          icon: null,
          image_url: null,
          images: [],
          is_sold_out: false,
        },
      ]
    })
  }

  function removeVariantRow(index: number) {
    const removedKey = variants[index]?.clientKey
    setVariants((prev) => prev.filter((_, i) => i !== index))
    if (removedKey) {
      setCombinations((prev) => {
        const next = new Set(prev)
        for (const key of next) {
          if (key.startsWith(`${removedKey}|`)) next.delete(key)
        }
        return next
      })
    }
  }

  function addVariantGroup() {
    setVariantGroups((prev) => {
      if (prev.length >= MAX_VARIANT_GROUPS) {
        toast.error("Limite de grupos atingido", {
          description: `Cada produto pode ter no máximo ${MAX_VARIANT_GROUPS} grupos de variantes.`,
        })
        return prev
      }
      return [
        ...prev,
        { name: "", options: [{ clientKey: crypto.randomUUID(), label: "", price_brl: "", is_sold_out: false }] },
      ]
    })
  }

  function removeVariantGroup(groupIndex: number) {
    const removedKeys = new Set(variantGroups[groupIndex]?.options.map((o) => o.clientKey) ?? [])
    setVariantGroups((prev) => prev.filter((_, i) => i !== groupIndex))
    if (removedKeys.size > 0) {
      setCombinations((prev) => {
        const next = new Set(prev)
        for (const key of next) {
          if (removedKeys.has(key.split("|")[1])) next.delete(key)
        }
        return next
      })
    }
  }

  function updateVariantGroupName(groupIndex: number, name: string) {
    setVariantGroups((prev) => prev.map((g, i) => (i === groupIndex ? { ...g, name } : g)))
  }

  function addVariantGroupOption(groupIndex: number) {
    setVariantGroups((prev) =>
      prev.map((g, i) => {
        if (i !== groupIndex) return g
        if (g.options.length >= MAX_OPTIONS_PER_VARIANT_GROUP) {
          toast.error("Limite de variantes atingido", {
            description: `Cada grupo pode ter no máximo ${MAX_OPTIONS_PER_VARIANT_GROUP} variantes.`,
          })
          return g
        }
        return {
          ...g,
          options: [...g.options, { clientKey: crypto.randomUUID(), label: "", price_brl: "", is_sold_out: false }],
        }
      })
    )
  }

  function removeVariantGroupOption(groupIndex: number, optionIndex: number) {
    const removedKey = variantGroups[groupIndex]?.options[optionIndex]?.clientKey
    setVariantGroups((prev) =>
      prev.map((g, i) => (i === groupIndex ? { ...g, options: g.options.filter((_, oi) => oi !== optionIndex) } : g))
    )
    if (removedKey) {
      setCombinations((prev) => {
        const next = new Set(prev)
        for (const key of next) {
          if (key.split("|")[1] === removedKey) next.delete(key)
        }
        return next
      })
    }
  }

  function toggleCombination(variantClientKey: string, optionClientKey: string) {
    setCombinations((prev) => {
      const key = `${variantClientKey}|${optionClientKey}`
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  function updateVariantGroupOption(
    groupIndex: number,
    optionIndex: number,
    field: "label" | "price_brl",
    value: string
  ) {
    setVariantGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex
          ? { ...g, options: g.options.map((o, oi) => (oi === optionIndex ? { ...o, [field]: value } : o)) }
          : g
      )
    )
  }

  function toggleVariantGroupOptionSoldOut(groupIndex: number, optionIndex: number) {
    setVariantGroups((prev) =>
      prev.map((g, i) =>
        i === groupIndex
          ? {
              ...g,
              options: g.options.map((o, oi) => (oi === optionIndex ? { ...o, is_sold_out: !o.is_sold_out } : o)),
            }
          : g
      )
    )
  }

  async function handleVariantImageAdd(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingVariantImage(index)
    setError(null)
    try {
      const url = await uploadImage(await prepareProductImage(file, { removeBg: false }))
      setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, image_url: url } : v)))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploadingVariantImage(null)
      e.target.value = ""
    }
  }

  function removeVariantImage(index: number) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, image_url: null } : v)))
  }

  async function handleVariantGalleryImageAdd(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if ((variants[index]?.images.length ?? 0) >= MAX_VARIANT_IMAGES) {
      toast.error("Limite de imagens atingido", {
        description: `Cada variante pode ter no máximo ${MAX_VARIANT_IMAGES} imagens.`,
      })
      e.target.value = ""
      return
    }

    setUploadingVariantImage(index)
    setError(null)
    try {
      const url = await uploadImage(await prepareProductImage(file, { removeBg: false }))
      setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, images: [...v.images, url] } : v)))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploadingVariantImage(null)
      e.target.value = ""
    }
  }

  function removeVariantGalleryImage(index: number, imageIndex: number) {
    setVariants((prev) =>
      prev.map((v, i) => (i === index ? { ...v, images: v.images.filter((_, ii) => ii !== imageIndex) } : v))
    )
  }

  function set(field: string, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  function setStatus(status: "active" | "sold_out" | "inactive") {
    setFormData((prev) => ({
      ...prev,
      is_active: status !== "inactive",
      is_sold_out: status === "sold_out",
    }))
  }

  async function handleAutofillFromPeripheral() {
    if (peripheralIds.length === 0) return
    setAutofilling(true)
    try {
      const res = await fetch(`/api/peripherals?ids=${peripheralIds[0]}&full=1`, { cache: "no-store" })
      const data = (await res.json()) as { peripherals?: PeripheralFullData[]; error?: string }
      const peripheral = data.peripherals?.[0]
      if (!res.ok || !peripheral) {
        throw new Error(data.error ?? "Periférico não encontrado.")
      }

      const filled = buildAutofillFromPeripheral(peripheral)

      setFormData((prev) => ({
        ...prev,
        name: peripheral.name,
        description: prev.description.trim() ? prev.description : filled.description,
        brand: filled.brand,
        category: filled.category ?? prev.category,
      }))

      if (filled.specs.length > 0) {
        setSpecs((prev) => {
          const existingLabels = new Set(prev.map((s) => s.label.trim().toLowerCase()).filter(Boolean))
          const merged = [...prev.filter((s) => s.label.trim() || s.value.trim())]
          for (const spec of filled.specs) {
            if (!existingLabels.has(spec.label.toLowerCase())) merged.push(spec)
          }
          return merged.length > 0 ? merged : [{ label: "", value: "" }]
        })
      }

      if (filled.images.length > 0) {
        setImages((prev) => {
          const existing = new Set(prev)
          const additions = filled.images.filter((url) => !existing.has(url))
          return [...prev, ...additions].slice(0, MAX_IMAGES)
        })
      }

      toast.success("Dados preenchidos a partir do periférico", { description: peripheral.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao buscar dados do periférico"
      toast.error("Erro ao preencher automaticamente", { description: message })
    } finally {
      setAutofilling(false)
    }
  }

  function bumpStock(delta: number) {
    setFormData((prev) => {
      const current = parseInt(prev.stock, 10)
      const base = isNaN(current) ? 0 : current
      const next = Math.min(MAX_STOCK, Math.max(0, base + delta))
      return { ...prev, stock: next.toString() }
    })
  }

  async function uploadImage(file: File): Promise<string> {
    const fd = new FormData()
    fd.set("file", file)
    const res = await fetch("/api/admin/store/upload-image", { method: "POST", body: fd })
    const data = (await res.json()) as { ok?: boolean; publicUrl?: string; error?: string }
    if (!res.ok || !data.ok || !data.publicUrl) {
      throw new Error(data.error ?? "Erro ao enviar imagem")
    }
    return data.publicUrl
  }

  /**
   * Prepara a foto antes de subir. Só as fotos principais do anúncio passam
   * pela remoção de fundo (`removeBackground`); capa e galeria da variante de
   * cor usam sempre a compressão normal (`removeBg: false`), sem remoção de
   * fundo. Sem fallback: se a etapa falhar, o upload falha com o erro à
   * mostra, em vez de subir a foto crua e parecer que o tratamento simplesmente
   * não foi aplicado.
   */
  async function prepareProductImage(file: File, options?: { removeBg?: boolean }): Promise<File> {
    const removeBg = options?.removeBg ?? true
    if (!removeBg || disableBackgroundRemoval) {
      const compressed = await compressImageFile(file, IMAGE_COMPRESS_OPTIONS)
      if (compressed.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        throw new Error(
          `Arquivo muito grande (máx. ${Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB).`
        )
      }
      return compressed
    }
    const prepared = await removeBackground(file)
    if (prepared.size > MAX_IMAGE_FILE_SIZE_BYTES) {
      throw new Error(
        `Arquivo muito grande (máx. ${Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB mesmo após remoção de fundo).`
      )
    }
    return prepared
  }

  async function handleImageAdd(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (images.length >= MAX_IMAGES) {
      toast.error("Limite de imagens atingido", {
        description: `Cada produto pode ter no máximo ${MAX_IMAGES} imagens.`,
      })
      e.target.value = ""
      return
    }

    setUploading(true)
    setError(null)
    try {
      const url = await uploadImage(await prepareProductImage(file))
      setImages((prev) => [...prev, url])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploading(false)
      e.target.value = ""
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!formData.name.trim()) {
        throw new Error("Informe o nome do produto.")
      }
      const priceCents = Math.round(parseFloat(formData.price_brl.replace(",", ".")) * 100)

      if (isNaN(priceCents) || priceCents < MIN_PRICE_CENTS) {
        throw new Error(`Preço inválido. Use um valor de pelo menos ${formatBRL(MIN_PRICE_CENTS)} (ex: 159,90).`)
      }

      let promoPriceCents: number | null = null
      if (formData.promo_price_brl.trim()) {
        promoPriceCents = Math.round(parseFloat(formData.promo_price_brl.replace(",", ".")) * 100)
        if (isNaN(promoPriceCents) || promoPriceCents <= 0) {
          throw new Error("Preço promocional inválido.")
        }
        if (promoPriceCents >= priceCents) {
          throw new Error("Preço promocional deve ser menor que o preço base.")
        }
      }

      let stockValue: number | null = null
      if (hasStock) {
        stockValue = parseInt(formData.stock, 10)
        if (isNaN(stockValue) || stockValue < 0 || stockValue > MAX_STOCK) {
          throw new Error(`Estoque inválido. Use um número inteiro entre 0 e ${MAX_STOCK.toLocaleString("pt-BR")}.`)
        }
      }

      const videoUrl = formData.video_url.trim()
      if (videoUrl && !isValidYoutubeUrl(videoUrl)) {
        throw new Error("URL de vídeo precisa ser um link do YouTube.")
      }

      if (variants.filter((v) => v.label.trim()).length > MAX_VARIANTS) {
        throw new Error(`Cada produto pode ter no máximo ${MAX_VARIANTS} variantes.`)
      }

      const cleanVariants: Array<{
        id?: string
        clientKey: string
        label: string
        price_cents_override: number | null
        promo_price_cents: number | null
        stock: number | null
        color: string | null
        icon: string | null
        image_url: string | null
        images: string[]
        is_sold_out: boolean
      }> = []
      for (const v of variants) {
        const label = v.label.trim()
        if (!label) continue
        if (v.images.length > MAX_VARIANT_IMAGES) {
          throw new Error(`Cada variante pode ter no máximo ${MAX_VARIANT_IMAGES} imagens ("${label}").`)
        }
        cleanVariants.push({
          id: v.id,
          clientKey: v.clientKey,
          label,
          price_cents_override: null,
          promo_price_cents: null,
          stock: null,
          color: v.color,
          icon: v.icon,
          image_url: v.image_url,
          images: v.images,
          is_sold_out: v.is_sold_out,
        })
      }

      if (variantGroups.length > MAX_VARIANT_GROUPS) {
        throw new Error(`Cada produto pode ter no máximo ${MAX_VARIANT_GROUPS} grupos de variantes.`)
      }

      const cleanVariantGroups: Array<{
        id?: string
        name: string
        options: Array<{
          id?: string
          clientKey: string
          label: string
          price_cents_override: number | null
          is_sold_out: boolean
        }>
      }> = []
      for (const g of variantGroups) {
        const name = g.name.trim()
        const options = g.options.filter((o) => o.label.trim())
        if (!name || options.length === 0) continue
        if (options.length > MAX_OPTIONS_PER_VARIANT_GROUP) {
          throw new Error(`Cada grupo pode ter no máximo ${MAX_OPTIONS_PER_VARIANT_GROUP} variantes ("${name}").`)
        }
        const cleanOptions: Array<{
          id?: string
          clientKey: string
          label: string
          price_cents_override: number | null
          is_sold_out: boolean
        }> = []
        for (const o of options) {
          const label = o.label.trim()
          let priceCentsOverride: number | null = null
          if (o.price_brl.trim()) {
            priceCentsOverride = Math.round(parseFloat(o.price_brl.replace(",", ".")) * 100)
            if (isNaN(priceCentsOverride) || priceCentsOverride < MIN_PRICE_CENTS) {
              throw new Error(
                `Preço inválido em "${name} — ${label}". Use um valor de pelo menos ${formatBRL(MIN_PRICE_CENTS)}.`
              )
            }
          }
          cleanOptions.push({
            id: o.id,
            clientKey: o.clientKey,
            label,
            price_cents_override: priceCentsOverride,
            is_sold_out: o.is_sold_out,
          })
        }
        cleanVariantGroups.push({ id: g.id, name, options: cleanOptions })
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price_cents: priceCents,
        promo_price_cents: promoPriceCents,
        stock: stockValue,
        images,
        category: formData.category || null,
        brand: formData.brand.trim() || null,
        type: "store" as const,
        condition: formData.condition,
        condition_notes: formData.condition_notes.trim() || null,
        sale_type: formData.sale_type,
        is_active: formData.is_active,
        is_sold_out: formData.is_sold_out,
        video_url: videoUrl || null,
      }

      const url = product
        ? `/api/admin/store/products/${product.id}`
        : "/api/admin/store/products"
      const method = product ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = (await res.json()) as { product?: StoreProduct; error?: string }

      if (!res.ok || !data.product) {
        throw new Error(data.error ?? "Erro ao salvar produto")
      }

      const cleanSpecs = specs
        .map((s) => ({ label: s.label.trim(), value: s.value.trim() }))
        .filter((s) => s.label && s.value)

      const specsRes = await fetch(`/api/admin/store/products/${data.product.id}/specs`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ specs: cleanSpecs }),
      })
      if (!specsRes.ok) {
        const specsData = (await specsRes.json()) as { error?: string }
        toast.error("Produto salvo, mas houve erro nas especificações", {
          description: specsData.error,
        })
      }

      const variantsRes = await fetch(`/api/admin/store/products/${data.product.id}/variants`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variants: cleanVariants }),
      })
      let variantIdByClientKey: Map<string, string> | null = null
      if (!variantsRes.ok) {
        const variantsData = (await variantsRes.json()) as { error?: string }
        toast.error("Produto salvo, mas houve erro nas variantes", {
          description: variantsData.error,
        })
      } else {
        const variantsData = (await variantsRes.json()) as { variants?: Array<{ id: string; position: number }> }
        variantIdByClientKey = new Map(
          (variantsData.variants ?? [])
            .filter((v) => cleanVariants[v.position])
            .map((v) => [cleanVariants[v.position].clientKey, v.id])
        )
      }

      const variantGroupsRes = await fetch(`/api/admin/store/products/${data.product.id}/variant-groups`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups: cleanVariantGroups }),
      })
      let optionIdByClientKey: Map<string, string> | null = null
      if (!variantGroupsRes.ok) {
        const variantGroupsData = (await variantGroupsRes.json()) as { error?: string }
        toast.error("Produto salvo, mas houve erro nas variantes", {
          description: variantGroupsData.error,
        })
      } else {
        const variantGroupsData = (await variantGroupsRes.json()) as {
          groups?: Array<{ id: string; position: number; options: Array<{ id: string; position: number }> }>
        }
        optionIdByClientKey = new Map()
        for (const g of variantGroupsData.groups ?? []) {
          const cleanGroup = cleanVariantGroups[g.position]
          if (!cleanGroup) continue
          for (const o of g.options) {
            const cleanOption = cleanGroup.options[o.position]
            if (cleanOption) optionIdByClientKey.set(cleanOption.clientKey, o.id)
          }
        }
      }

      if (variantIdByClientKey && optionIdByClientKey) {
        const idByClientKey = variantIdByClientKey
        const optionIdMap = optionIdByClientKey
        const combinationPairs = [...combinations]
          .map((key) => {
            const [variantClientKey, optionClientKey] = key.split("|")
            const variantId = idByClientKey.get(variantClientKey)
            const optionId = optionIdMap.get(optionClientKey)
            return variantId && optionId ? { variant_id: variantId, option_id: optionId } : null
          })
          .filter((p): p is { variant_id: string; option_id: string } => p != null)

        const combinationsRes = await fetch(`/api/admin/store/products/${data.product.id}/variant-combinations`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ combinations: combinationPairs }),
        })
        if (!combinationsRes.ok) {
          const combinationsData = (await combinationsRes.json()) as { error?: string }
          toast.error("Produto salvo, mas houve erro nas combinações de estoque", {
            description: combinationsData.error,
          })
        }
      } else if (combinations.size > 0) {
        toast.error("Combinações de estoque não foram salvas", {
          description: "Corrija o erro em Cor ou Variantes acima e salve novamente.",
        })
      }

      const peripheralsRes = await fetch(`/api/admin/store/products/${data.product.id}/peripherals`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ peripheral_ids: peripheralIds }),
      })
      if (!peripheralsRes.ok) {
        const peripheralsData = (await peripheralsRes.json()) as { error?: string }
        toast.error("Produto salvo, mas houve erro nos periféricos vinculados", {
          description: peripheralsData.error,
        })
      }

      toast.success(product ? "Produto atualizado" : "Produto criado", {
        description: data.product.name,
      })

      onSuccess(data.product)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar"
      setError(message)
      toast.error("Erro ao salvar produto", { description: message })
    } finally {
      setLoading(false)
    }
  }

  const isNewStoreListing = !product
  const priceCentsPreview = formData.price_brl
    ? Math.round(parseFloat(formData.price_brl.replace(",", ".")) * 100) || 0
    : 0
  const pricePreview = formData.price_brl ? formatBRL(priceCentsPreview) : null
  const promoPriceCentsPreview = formData.promo_price_brl
    ? Math.round(parseFloat(formData.promo_price_brl.replace(",", ".")) * 100) || 0
    : 0
  const promoDiscountPercent =
    promoPriceCentsPreview > 0 && priceCentsPreview > 0 && promoPriceCentsPreview < priceCentsPreview
      ? Math.round((1 - promoPriceCentsPreview / priceCentsPreview) * 100)
      : null

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Painel de identificação do produto */}
      <div className="relative overflow-hidden rounded-2xl border border-primary/20 p-5 shadow-[0_0_40px_-20px_rgba(255,138,0,0.5)]">
        <div
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background:
              "radial-gradient(ellipse 80% 60% at 10% 0%, oklch(0.65 0.19 45 / 0.16), transparent 60%), radial-gradient(ellipse 70% 50% at 100% 100%, oklch(0.6 0.16 300 / 0.12), transparent 60%), linear-gradient(160deg, oklch(0.16 0.01 40) 0%, oklch(0.1 0.005 40) 100%)",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(oklch(1 0 0) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />

        <div className="mb-4 flex items-center gap-2">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <Sparkles className="size-3.5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">Identificação do produto</p>
            <p className="text-[10px] text-muted-foreground/70">
              Vincule um periférico do catálogo para preencher tudo de uma vez, ou preencha manualmente abaixo.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <MultiCombobox
            options={peripheralOptions.map<ComboboxOption>((p) => ({
              value: p.id,
              label: p.brand ? `${p.name} — ${p.brand}` : p.name,
            }))}
            values={peripheralIds}
            onValuesChange={setPeripheralIds}
            placeholder="Vincular periférico do catálogo..."
            searchPlaceholder="Buscar periférico..."
            emptyText="Nenhum periférico encontrado."
            allLabel="Nenhum"
          />
          {peripheralIds.length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 border-primary/30 bg-primary/5 hover:bg-primary/10"
              onClick={handleAutofillFromPeripheral}
              disabled={autofilling}
            >
              {autofilling ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              Preencher automaticamente com dados do periférico
            </Button>
          )}
        </div>

        <div className="my-4 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Nome do produto *</Label>
            <Input
              required
              minLength={2}
              maxLength={200}
              value={formData.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Ex: Logitech G Pro X Superlight 2"
              className="bg-background/40"
            />
            <p className="text-[10px] text-muted-foreground/60">Obrigatório. Use o nome completo do produto.</p>
          </div>

          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select
              value={formData.category || NO_CATEGORY}
              onValueChange={(v) => set("category", v === NO_CATEGORY ? "" : v)}
            >
              <SelectTrigger className="h-9 w-full border-border bg-background/40 text-sm">
                <SelectValue placeholder="Selecionar..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_CATEGORY}>Sem categoria</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Marca</Label>
            <Combobox
              options={(() => {
                const opts: ComboboxOption[] = brandOptions.map((b) => ({ value: b.name, label: b.name }))
                if (formData.brand && !opts.some((o) => o.value === formData.brand)) {
                  opts.unshift({ value: formData.brand, label: formData.brand })
                }
                return opts
              })()}
              value={formData.brand}
              onValueChange={(value) => set("brand", value)}
              onSearchChange={setBrandSearch}
              loading={loadingBrands}
              onLoadMore={handleLoadMoreBrands}
              loadingMore={loadingMoreBrands}
              hasMore={brandOptions.length < brandTotal}
              onCreateOption={(label) => set("brand", label.trim())}
              createOptionLabel={(label) => `Usar "${label}"`}
              placeholder="Selecionar marca..."
              searchPlaceholder="Buscar marca..."
              emptyText="Nenhuma marca encontrada."
            />
          </div>
        </div>
      </div>

      {/* Fotos Principais do Anúncio */}
      {!isNewStoreListing && (
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
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <Checkbox
              checked={disableBackgroundRemoval}
              onCheckedChange={(checked) => setDisableBackgroundRemoval(checked === true)}
            />
            Desativar remoção automática de fundo
          </label>
        </div>
      )}

      {/* Type + Condition + Sale type */}
      {isNewStoreListing ? (
        <div className="space-y-2 md:max-w-xs">
          <Label>Tipo de Venda</Label>
          <Select value={formData.sale_type} onValueChange={(v) => set("sale_type", v)}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="normal">Normal</SelectItem>
              <SelectItem value="pre_order">🚀 Pré-venda</SelectItem>
              <SelectItem value="ready_stock">📦 Pronta Entrega</SelectItem>
            </SelectContent>
          </Select>
          {formData.sale_type === "pre_order" && (
            <p className="text-[10px] text-amber-400">
              Produto ainda sem estoque físico. Volte aqui e troque para &ldquo;Normal&rdquo; ou
              &ldquo;Pronta Entrega&rdquo; quando o período de pré-venda acabar — o anúncio, reviews
              e vendas já feitas continuam os mesmos.
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Condição</Label>
            <Select value={formData.condition} onValueChange={(v) => set("condition", v)}>
              <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="new">Novo</SelectItem>
                <SelectItem value="opened">Embalagem aberta</SelectItem>
                <SelectItem value="used">Usado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Tipo de Venda</Label>
            <Select value={formData.sale_type} onValueChange={(v) => set("sale_type", v)}>
              <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="pre_order">🚀 Pré-venda</SelectItem>
                <SelectItem value="ready_stock">📦 Pronta Entrega</SelectItem>
              </SelectContent>
            </Select>
            {formData.sale_type === "pre_order" && (
              <p className="text-[10px] text-amber-400">
                Produto ainda sem estoque físico. Volte aqui e troque para &ldquo;Normal&rdquo; ou
                &ldquo;Pronta Entrega&rdquo; quando o período de pré-venda acabar — o anúncio, reviews
                e vendas já feitas continuam os mesmos.
              </p>
            )}
          </div>
        </div>
      )}

      {!isNewStoreListing && formData.condition !== "new" && (
        <div className="space-y-1.5">
          <Label className="text-xs">Notas sobre a condição (visível ao comprador)</Label>
          <Input
            placeholder="Ex: Embalagem aberta para teste, sem uso, acompanha todos os acessórios..."
            value={formData.condition_notes}
            onChange={(e) => set("condition_notes", e.target.value)}
            className="text-sm"
          />
        </div>
      )}

      {/* Description */}
      <div className="space-y-2">
        <Label>Descrição</Label>
        <TextFormatToolbar
          textareaRef={descriptionTextareaRef}
          value={formData.description}
          onChange={(value) => set("description", value)}
        />
        <textarea
          ref={descriptionTextareaRef}
          value={formData.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Descreva o produto, características, diferenciais... (evite repetir specs como Plate, Keycaps, Layout, Carcaça — isso já vai na tabela de Especificação Técnica)"
          rows={8}
          className={cn(
            "flex min-h-[200px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2 resize-y"
          )}
        />
        <p className="text-[10px] text-muted-foreground/60">
          Suporta **negrito**, *itálico*, __sublinhado__, ==destaque== e [texto](url) para link.
        </p>
        <p className="text-[10px] text-amber-600 dark:text-amber-500">
          Não repita aqui specs como Plate, Keycaps, Layout, Carcaça etc. — esses dados já aparecem na tabela de "Especificação Técnica".
        </p>
      </div>

      {/* Price + Promo + Stock + Active */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-2">
          <Label>Preço (R$) *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <Input
              required
              type="text"
              inputMode="decimal"
              value={formData.price_brl}
              onChange={(e) => set("price_brl", e.target.value)}
              placeholder="0,00"
              className="pl-9"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60">
            Mínimo de {formatBRL(MIN_PRICE_CENTS)}. Use vírgula para centavos (ex: 159,90).
          </p>
          {pricePreview && (
            <p className="text-xs text-emerald-400">{pricePreview}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Preço promocional (R$)</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">R$</span>
            <Input
              type="text"
              inputMode="decimal"
              value={formData.promo_price_brl}
              onChange={(e) => set("promo_price_brl", e.target.value)}
              placeholder="Opcional"
              className="pl-9"
            />
          </div>
          <p className="text-[10px] text-muted-foreground/60">Preço final &ldquo;De/Por&rdquo;. Deve ser menor que o preço base.</p>
          {promoDiscountPercent != null && (
            <p className="flex items-center gap-1.5 text-xs">
              <span className="text-muted-foreground line-through">{formatBRL(priceCentsPreview)}</span>
              <span className="font-semibold text-emerald-400">{formatBRL(promoPriceCentsPreview)}</span>
              <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                -{promoDiscountPercent}%
              </span>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Estoque {hasStock && "*"}</Label>
            <button
              type="button"
              onClick={() => setHasStock((prev) => !prev)}
              className="text-[10px] font-medium text-primary hover:underline"
            >
              {hasStock ? "Remover controle" : "Controlar estoque"}
            </button>
          </div>
          {hasStock ? (
            <>
              <div className="flex items-stretch gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 shrink-0"
                  onClick={() => bumpStock(-1)}
                  disabled={parseInt(formData.stock, 10) <= 0}
                  aria-label="Diminuir estoque"
                >
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  required
                  type="number"
                  min={0}
                  max={MAX_STOCK}
                  step={1}
                  value={formData.stock}
                  onChange={(e) => set("stock", e.target.value)}
                  placeholder="1"
                  className="no-spinner text-center"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 shrink-0"
                  onClick={() => bumpStock(1)}
                  disabled={parseInt(formData.stock, 10) >= MAX_STOCK}
                  aria-label="Aumentar estoque"
                >
                  <Plus className="size-3.5" />
                </Button>
              </div>
            </>
          ) : (
            <p className="rounded-md border border-dashed border-border bg-muted/20 px-3 py-2 text-[10px] text-muted-foreground">
              Sem controle de estoque — nunca esgota. Limite de {" "}
              <span className="font-semibold text-foreground">15 unidades/dia por comprador</span>.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={!formData.is_active ? "inactive" : formData.is_sold_out ? "sold_out" : "active"}
            onValueChange={(v) => setStatus(v as "active" | "sold_out" | "inactive")}
          >
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">✅ Ativo (visível)</SelectItem>
              <SelectItem value="sold_out">⚠️ Esgotado (visível, não compra)</SelectItem>
              <SelectItem value="inactive">🔒 Inativo (oculto)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Cor */}
      <div className="space-y-2">
        <Label>Cor (Opcional)</Label>
        <p className="text-[10px] text-muted-foreground/60">
          Se o produto tem variações visuais (cor, modelo, etc.), cadastre aqui. Para um produto
          com preço ou estoque diferente, cadastre-o como um anúncio separado.
        </p>
        <div className="space-y-2">
          {variants.map((variant, idx) => (
            <div key={variant.clientKey} className="space-y-2 rounded-lg border border-border bg-muted/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={variant.label}
                  onChange={(e) => updateVariant(idx, "label", e.target.value)}
                  placeholder="Ex: Preto"
                  className="min-w-[140px] flex-1 text-sm"
                />
                <Button
                  type="button"
                  variant={variant.is_sold_out ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "h-8 shrink-0 gap-1.5 text-[11px]",
                    variant.is_sold_out && "bg-red-500/90 text-white hover:bg-red-500"
                  )}
                  onClick={() => toggleVariantSoldOut(idx)}
                >
                  <Ban className="size-3.5" />
                  Esgotado
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-red-400"
                  onClick={() => removeVariantRow(idx)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-border/60 pt-2">
                {/* Cor */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Cor</span>
                  <input
                    type="color"
                    value={variant.color ?? "#22c55e"}
                    onChange={(e) => setVariantColor(idx, e.target.value)}
                    aria-label="Cor da variante"
                    className="size-7 shrink-0 cursor-pointer rounded-md border border-border bg-transparent p-0.5"
                  />
                  {variant.color && (
                    <button
                      type="button"
                      onClick={() => setVariantColor(idx, null)}
                      aria-label="Remover cor"
                      className="text-muted-foreground/60 hover:text-red-400"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {/* Ícone */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Ícone</span>
                  <EmojiPicker
                    value={variant.icon}
                    onChange={(emoji) => setVariantIcon(idx, emoji)}
                    aria-label="Ícone da variante"
                  />
                </div>

                {/* Imagem de capa da variante */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">Capa</span>
                  {variant.image_url ? (
                    <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={variant.image_url} alt="" className="h-full w-full object-contain p-0.5" />
                      <button
                        type="button"
                        onClick={() => removeVariantImage(idx)}
                        aria-label="Remover imagem de capa da variante"
                        className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-white"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground">
                      {uploadingVariantImage === idx ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingVariantImage !== null}
                        onChange={(e) => handleVariantImageAdd(idx, e)}
                      />
                    </label>
                  )}
                </div>

                {/* Galeria exclusiva da variante (até MAX_VARIANT_IMAGES) */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">
                    Galeria {variant.images.length}/{MAX_VARIANT_IMAGES}
                  </span>
                  {variant.images.map((url, imageIdx) => (
                    <div
                      key={url}
                      className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border bg-muted"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt="" className="h-full w-full object-contain p-0.5" />
                      <button
                        type="button"
                        onClick={() => removeVariantGalleryImage(idx, imageIdx)}
                        aria-label="Remover imagem da galeria"
                        className="absolute -right-1 -top-1 flex size-4 items-center justify-center rounded-full bg-red-500 text-white"
                      >
                        <X className="size-2.5" />
                      </button>
                    </div>
                  ))}
                  {variant.images.length < MAX_VARIANT_IMAGES && (
                    <label className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground">
                      {uploadingVariantImage === idx ? (
                        <Loader2 className="size-3.5 animate-spin" />
                      ) : (
                        <Upload className="size-3.5" />
                      )}
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        disabled={uploadingVariantImage !== null}
                        onChange={(e) => handleVariantGalleryImageAdd(idx, e)}
                      />
                    </label>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Atalhos:</span>
          {VARIANT_COLOR_PRESETS.map((preset) => {
            const isDuplicate = variants.some(
              (v) => v.label.trim().toLowerCase() === preset.label.toLowerCase() || v.color === preset.color
            )
            const disabled = isDuplicate || variants.length >= MAX_VARIANTS
            return (
              <button
                key={`${preset.label}-${preset.color}`}
                type="button"
                onClick={() => addVariantColorPreset(preset.label, preset.color)}
                disabled={disabled}
                title={isDuplicate ? `"${preset.label}" já cadastrada` : undefined}
                className="flex items-center gap-1.5 rounded-full border border-border bg-muted/20 px-2 py-1 text-[11px] text-foreground/80 transition-colors hover:border-foreground/30 hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span
                  className="size-3 shrink-0 rounded-full border border-border/60"
                  style={{ backgroundColor: preset.color }}
                />
                {preset.label}
              </button>
            )
          })}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={addVariantRow}
            disabled={variants.length >= MAX_VARIANTS}
          >
            <Plus className="size-3.5" />
            Adicionar variante
          </Button>
          <span className="text-[10px] text-muted-foreground">{variants.length}/{MAX_VARIANTS}</span>
        </div>
      </div>

      {/* Variantes */}
      <div className="space-y-2">
        <Label>Variantes (Opcional)</Label>
        <p className="text-[10px] text-muted-foreground/60">
          Outros tipos de opção do produto (Switch, Voltagem, Tamanho...). Cada opção é só um
          botão de texto, e pode ter um preço diferente do preço base.
        </p>
        <div className="space-y-3">
          {variantGroups.map((group, groupIdx) => (
            <div key={group.id ?? groupIdx} className="space-y-2 rounded-lg border border-border bg-muted/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={group.name}
                  onChange={(e) => updateVariantGroupName(groupIdx, e.target.value)}
                  placeholder="Ex: Switch, Voltagem, Tamanho..."
                  className="min-w-[140px] flex-1 text-sm font-medium"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-red-400"
                  onClick={() => removeVariantGroup(groupIdx)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>

              <div className="space-y-1.5 border-t border-border/60 pt-2">
                {group.options.map((option, optionIdx) => (
                  <div key={option.clientKey} className="flex flex-wrap items-center gap-1.5">
                    <Input
                      value={option.label}
                      onChange={(e) => updateVariantGroupOption(groupIdx, optionIdx, "label", e.target.value)}
                      placeholder="Ex: WUKONG PRO"
                      className="min-w-[120px] flex-1 text-sm"
                    />
                    <div className="relative w-[110px] shrink-0">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">
                        R$
                      </span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={option.price_brl}
                        onChange={(e) => updateVariantGroupOption(groupIdx, optionIdx, "price_brl", e.target.value)}
                        placeholder="Opcional"
                        className="pl-7 text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      variant={option.is_sold_out ? "default" : "outline"}
                      size="sm"
                      className={cn(
                        "h-8 shrink-0 gap-1.5 text-[11px]",
                        option.is_sold_out && "bg-red-500/90 text-white hover:bg-red-500"
                      )}
                      onClick={() => toggleVariantGroupOptionSoldOut(groupIdx, optionIdx)}
                    >
                      <Ban className="size-3.5" />
                      Esgotado
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-muted-foreground hover:text-red-400"
                      onClick={() => removeVariantGroupOption(groupIdx, optionIdx)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => addVariantGroupOption(groupIdx)}
                  disabled={group.options.length >= MAX_OPTIONS_PER_VARIANT_GROUP}
                >
                  <Plus className="size-3.5" />
                  Adicionar variante
                </Button>
                <span className="text-[10px] text-muted-foreground">
                  {group.options.length}/{MAX_OPTIONS_PER_VARIANT_GROUP}
                </span>
              </div>

              {(() => {
                const activeColors = variants.filter((v) => v.label.trim())
                const activeOptions = group.options.filter((o) => o.label.trim())
                if (activeColors.length === 0 || activeOptions.length === 0) return null
                return (
                  <div className="space-y-1.5 border-t border-border/60 pt-2">
                    <p className="text-[10px] font-medium text-muted-foreground">
                      Estoque por combinação (Cor × {group.name.trim() || "Variante"})
                    </p>
                    <p className="text-[10px] text-muted-foreground/60">
                      Clique numa célula pra esgotar só aquela combinação de cor + variante.
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-[11px]">
                        <thead>
                          <tr>
                            <th className="p-1 text-left font-normal text-muted-foreground" />
                            {activeOptions.map((option) => (
                              <th key={option.clientKey} className="p-1 text-center font-medium text-muted-foreground">
                                {option.label}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {activeColors.map((variant) => (
                            <tr key={variant.clientKey}>
                              <td className="whitespace-nowrap p-1 text-muted-foreground">
                                <span className="flex items-center gap-1.5">
                                  {variant.color && (
                                    <span
                                      className="inline-block size-2.5 shrink-0 rounded-full border border-border"
                                      style={{ backgroundColor: variant.color }}
                                    />
                                  )}
                                  {variant.label}
                                </span>
                              </td>
                              {activeOptions.map((option) => {
                                const soldOut = combinations.has(`${variant.clientKey}|${option.clientKey}`)
                                return (
                                  <td key={option.clientKey} className="p-1 text-center">
                                    <button
                                      type="button"
                                      onClick={() => toggleCombination(variant.clientKey, option.clientKey)}
                                      aria-pressed={soldOut}
                                      aria-label={`${variant.label} + ${option.label}: ${soldOut ? "esgotado" : "disponível"}`}
                                      className={cn(
                                        "inline-flex size-6 items-center justify-center rounded-md border transition-colors",
                                        soldOut
                                          ? "border-red-500/60 bg-red-500/90 text-white hover:bg-red-500"
                                          : "border-border text-muted-foreground hover:border-foreground/30"
                                      )}
                                    >
                                      {soldOut ? (
                                        <Ban className="size-3.5" />
                                      ) : (
                                        <span className="size-1.5 rounded-full bg-current" />
                                      )}
                                    </button>
                                  </td>
                                )
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={addVariantGroup}
            disabled={variantGroups.length >= MAX_VARIANT_GROUPS}
          >
            <Plus className="size-3.5" />
            Adicionar grupo de variantes
          </Button>
          <span className="text-[10px] text-muted-foreground">{variantGroups.length}/{MAX_VARIANT_GROUPS}</span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || uploading}>
          {(loading || uploading) && <Loader2 className="mr-2 size-4 animate-spin" />}
          <Upload className="mr-2 size-4" />
          {product ? "Salvar alterações" : "Criar produto"}
        </Button>
      </div>
    </form>
  )
}
