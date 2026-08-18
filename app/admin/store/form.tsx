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
import { CheckCircle2, GripVertical, Loader2, Minus, Plus, Sparkles, Trash2, Upload, X, XCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { encodeFeature, featureLabel, isGoodFeature } from "@/lib/store-features"
import { compressImageFile } from "@/lib/client/compress-image"
import { VARIANT_ICONS, VARIANT_ICON_NAMES } from "@/lib/variant-icons"
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
}

interface StoreProductVariantRow {
  id?: string
  label: string
  price_override_brl: string
  promo_price_brl: string
  color: string | null
  icon: string | null
  image_url: string | null
  images: string[]
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
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  is_active: boolean
  is_sold_out: boolean
  features?: string[]
  video_url?: string | null
}

interface StoreProductFormProps {
  product?: StoreProduct
  initialSpecs?: StoreProductSpec[]
  initialVariants?: StoreProductVariantInput[]
  initialPeripheralIds?: string[]
  defaultType?: "store" | "bazaar"
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
  monitors: "monitors",
  switches: "switches",
  chairs: "chairs",
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
  features: string[]
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

  const features: string[] = [
    ...(details.pros ?? []).map((label) => encodeFeature(label, true)),
    ...(details.cons ?? []).map((label) => encodeFeature(label, false)),
  ]

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
    features,
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
  { value: "monitors", label: "Monitor" },
  { value: "switches", label: "Switches" },
  { value: "chairs", label: "Cadeira" },
  { value: "dac_amp", label: "DAC/AMP" },
  { value: "feet", label: "Feet" },
  { value: "acessorio", label: "Acessório" },
  { value: "outro", label: "Outro" },
]

const NO_CATEGORY = "__none__"
const MAX_STOCK = 999_999
const MAX_IMAGES = 8
const MAX_VARIANT_IMAGES = 3
const MAX_VARIANTS = 12
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
  initialPeripheralIds,
  defaultType = "store",
  onSuccess,
  onCancel,
}: StoreProductFormProps) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price_brl: product ? (product.price_cents / 100).toFixed(2) : "",
    promo_price_brl: product?.promo_price_cents != null ? (product.promo_price_cents / 100).toFixed(2) : "",
    stock: product?.stock != null ? product.stock.toString() : "1",
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    type: product?.type ?? defaultType,
    condition: product?.condition ?? (defaultType === "bazaar" ? "used" : "new"),
    condition_notes: product?.condition_notes ?? "",
    is_active: product?.is_active !== false,
    is_sold_out: product?.is_sold_out ?? false,
    video_url: product?.video_url ?? "",
  })

  const [hasStock, setHasStock] = useState(product ? product.stock != null : true)
  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const [features, setFeatures] = useState<string[]>(product?.features ?? [])
  const [featureInput, setFeatureInput] = useState("")
  const [featureIsGood, setFeatureIsGood] = useState(true)
  const featureInputRef = useRef<HTMLInputElement>(null)
  const descriptionTextareaRef = useRef<HTMLTextAreaElement>(null)
  const [specs, setSpecs] = useState<StoreProductSpec[]>(
    initialSpecs && initialSpecs.length > 0 ? initialSpecs : [{ label: "", value: "" }]
  )
  const [variants, setVariants] = useState<StoreProductVariantRow[]>(
    (initialVariants ?? []).map((v) => ({
      id: v.id,
      label: v.label,
      price_override_brl: v.price_cents_override != null ? (v.price_cents_override / 100).toFixed(2) : "",
      promo_price_brl: v.promo_price_cents != null ? (v.promo_price_cents / 100).toFixed(2) : "",
      color: v.color ?? null,
      icon: v.icon ?? null,
      image_url: v.image_url ?? null,
      images: v.images ?? [],
    }))
  )
  const [uploadingVariantImage, setUploadingVariantImage] = useState<number | null>(null)
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

  function addFeature() {
    const value = featureInput.trim()
    if (!value) return
    setFeatures((prev) => [...prev, encodeFeature(value, featureIsGood)])
    setFeatureInput("")
    featureInputRef.current?.focus()
  }

  function updateSpec(index: number, field: "label" | "value", value: string) {
    setSpecs((prev) => prev.map((s, i) => (i === index ? { ...s, [field]: value } : s)))
  }

  function addSpecRow() {
    setSpecs((prev) => [...prev, { label: "", value: "" }])
  }

  function removeSpecRow(index: number) {
    setSpecs((prev) => prev.filter((_, i) => i !== index))
  }

  function updateVariant(
    index: number,
    field: "label" | "price_override_brl" | "promo_price_brl",
    value: string
  ) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  function setVariantColor(index: number, color: string | null) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, color } : v)))
  }

  function setVariantIcon(index: number, icon: string | null) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, icon: v.icon === icon ? null : icon } : v)))
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
          label: "",
          price_override_brl: "",
          promo_price_brl: "",
          color: null,
          icon: null,
          image_url: null,
          images: [],
        },
      ]
    })
  }

  function removeVariantRow(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleVariantImageAdd(index: number, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingVariantImage(index)
    setError(null)
    try {
      const compressed = await compressImageFile(file, IMAGE_COMPRESS_OPTIONS)
      if (compressed.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        throw new Error(
          `Arquivo muito grande (máx. ${Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB mesmo após compressão).`
        )
      }
      const url = await uploadImage(compressed)
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
      const compressed = await compressImageFile(file, IMAGE_COMPRESS_OPTIONS)
      if (compressed.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        throw new Error(
          `Arquivo muito grande (máx. ${Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB mesmo após compressão).`
        )
      }
      const url = await uploadImage(compressed)
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

      if (filled.features.length > 0) {
        setFeatures((prev) => {
          const existing = new Set(prev)
          const additions = filled.features.filter((f) => !existing.has(f))
          return [...prev, ...additions]
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
      const compressed = await compressImageFile(file, IMAGE_COMPRESS_OPTIONS)
      if (compressed.size > MAX_IMAGE_FILE_SIZE_BYTES) {
        throw new Error(
          `Arquivo muito grande (máx. ${Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB mesmo após compressão).`
        )
      }
      const url = await uploadImage(compressed)
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
        label: string
        price_cents_override: number | null
        promo_price_cents: number | null
        stock: number | null
        color: string | null
        icon: string | null
        image_url: string | null
        images: string[]
      }> = []
      for (const v of variants) {
        const label = v.label.trim()
        if (!label) continue
        let priceOverride: number | null = null
        if (v.price_override_brl.trim()) {
          priceOverride = Math.round(parseFloat(v.price_override_brl.replace(",", ".")) * 100)
          if (isNaN(priceOverride) || priceOverride < MIN_PRICE_CENTS) {
            throw new Error(`Preço inválido na variante "${label}". Use pelo menos ${formatBRL(MIN_PRICE_CENTS)}.`)
          }
        }
        let variantPromoPrice: number | null = null
        if (v.promo_price_brl.trim()) {
          variantPromoPrice = Math.round(parseFloat(v.promo_price_brl.replace(",", ".")) * 100)
          const referencePrice = priceOverride ?? priceCents
          if (isNaN(variantPromoPrice) || variantPromoPrice <= 0) {
            throw new Error(`Preço promocional inválido na variante "${label}".`)
          }
          if (variantPromoPrice >= referencePrice) {
            throw new Error(`Preço promocional da variante "${label}" deve ser menor que o preço dela.`)
          }
        }
        if (v.images.length > MAX_VARIANT_IMAGES) {
          throw new Error(`Cada variante pode ter no máximo ${MAX_VARIANT_IMAGES} imagens ("${label}").`)
        }
        cleanVariants.push({
          id: v.id,
          label,
          price_cents_override: priceOverride,
          promo_price_cents: variantPromoPrice,
          stock: null,
          color: v.color,
          icon: v.icon,
          image_url: v.image_url,
          images: v.images,
        })
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
        type: formData.type,
        condition: formData.condition,
        condition_notes: formData.condition_notes.trim() || null,
        is_active: formData.is_active,
        is_sold_out: formData.is_sold_out,
        features,
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
      if (!variantsRes.ok) {
        const variantsData = (await variantsRes.json()) as { error?: string }
        toast.error("Produto salvo, mas houve erro nas variantes", {
          description: variantsData.error,
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

  const isBazaar = formData.type === "bazaar"
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

      {/* Type + Condition */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Tipo</Label>
          <Select value={formData.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="store">🛒 Loja (produto novo)</SelectItem>
              <SelectItem value="bazaar">♻️ Bazar (produto usado)</SelectItem>
            </SelectContent>
          </Select>
        </div>

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
      </div>

      {isBazaar && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-amber-300">
            ⚠️ Produto do Bazar — O comprador verá claramente que é usado/já aberto
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Notas sobre a condição (visível ao comprador)</Label>
            <Input
              placeholder="Ex: Mouse usado por 6 meses, sem defeitos, pés originais..."
              value={formData.condition_notes}
              onChange={(e) => set("condition_notes", e.target.value)}
              className="text-sm"
            />
          </div>
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
          placeholder="Descreva o produto, características, motivo da venda no bazar..."
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
              {isBazaar && parseInt(formData.stock) > 1 && (
                <p className="text-[10px] text-amber-400">Bazar normalmente tem estoque 1</p>
              )}
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

      {/* Variantes */}
      <div className="space-y-2">
        <Label>Variantes (opcional)</Label>
        <p className="text-[10px] text-muted-foreground/60">
          Se o produto tem variações (cor, modelo, etc.), cadastre aqui — cada uma com um preço
          próprio, se quiser, diferente do preço base acima. Para controlar estoque de uma
          variante específica, cadastre-a como um anúncio separado.
        </p>
        <div className="space-y-2">
          {variants.map((variant, idx) => (
            <div key={variant.id ?? idx} className="space-y-2 rounded-lg border border-border bg-muted/10 p-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={variant.label}
                  onChange={(e) => updateVariant(idx, "label", e.target.value)}
                  placeholder="Ex: Preto"
                  className="min-w-[140px] flex-1 text-sm"
                />
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={variant.price_override_brl}
                    onChange={(e) => updateVariant(idx, "price_override_brl", e.target.value)}
                    placeholder="Preço base"
                    className="pl-7 text-sm"
                  />
                </div>
                <div className="relative w-28 shrink-0">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">R$</span>
                  <Input
                    type="text"
                    inputMode="decimal"
                    value={variant.promo_price_brl}
                    onChange={(e) => updateVariant(idx, "promo_price_brl", e.target.value)}
                    placeholder="Promo"
                    className="pl-7 text-sm"
                  />
                </div>
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

              {(() => {
                const refCents = variant.price_override_brl.trim()
                  ? Math.round(parseFloat(variant.price_override_brl.replace(",", ".")) * 100) || 0
                  : priceCentsPreview
                const promoCents = variant.promo_price_brl.trim()
                  ? Math.round(parseFloat(variant.promo_price_brl.replace(",", ".")) * 100) || 0
                  : 0
                if (!promoCents || !refCents || promoCents >= refCents) return null
                const percent = Math.round((1 - promoCents / refCents) * 100)
                return (
                  <p className="flex items-center gap-1.5 pl-0.5 text-xs">
                    <span className="text-muted-foreground line-through">{formatBRL(refCents)}</span>
                    <span className="font-semibold text-emerald-400">{formatBRL(promoCents)}</span>
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                      -{percent}%
                    </span>
                  </p>
                )
              })()}

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
                <div className="flex items-center gap-1">
                  <span className="mr-0.5 text-[10px] text-muted-foreground">Ícone</span>
                  {VARIANT_ICON_NAMES.map((name) => {
                    const IconComp = VARIANT_ICONS[name]
                    const isSelected = variant.icon === name
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setVariantIcon(idx, name)}
                        aria-label={`Ícone ${name}`}
                        aria-pressed={isSelected}
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md border transition-colors",
                          isSelected
                            ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
                            : "border-border text-muted-foreground hover:border-foreground/20"
                        )}
                      >
                        <IconComp className="size-3.5" />
                      </button>
                    )
                  })}
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

      {/* Características */}
      <div className="space-y-2">
        <Label>Características</Label>
        <p className="text-[10px] text-muted-foreground/60">
          Lista de destaques do produto (ex: &quot;Sensor óptico de 26.000 DPI&quot;).
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className={cn(
              "shrink-0",
              featureIsGood ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400"
            )}
            onClick={() => setFeatureIsGood((prev) => !prev)}
            title={featureIsGood ? "Característica positiva (clique para marcar como negativa)" : "Característica negativa (clique para marcar como positiva)"}
          >
            {featureIsGood ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
          </Button>
          <Input
            ref={featureInputRef}
            value={featureInput}
            onChange={(e) => setFeatureInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addFeature()
              }
            }}
            placeholder="Ex: Bateria com 95h de duração"
            className="text-sm"
          />
          <Button type="button" variant="outline" size="icon" className="shrink-0" onClick={addFeature}>
            <Plus className="size-4" />
          </Button>
        </div>
        {features.length > 0 && (
          <ul className="space-y-1.5">
            {features.map((feature, idx) => (
              <li
                key={idx}
                className="flex items-center justify-between gap-2 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-sm"
              >
                <span className="flex items-center gap-2 text-foreground/90">
                  {isGoodFeature(feature) ? (
                    <CheckCircle2 className="size-3.5 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="size-3.5 shrink-0 text-red-400" />
                  )}
                  {featureLabel(feature)}
                </span>
                <button
                  type="button"
                  onClick={() => setFeatures((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Especificação Técnica */}
      <div className="space-y-2">
        <Label>Especificação Técnica</Label>
        <p className="text-[10px] text-muted-foreground/60">Tabela de campo/valor (ex: &quot;Sensor&quot; → &quot;PixArt PAW3395&quot;).</p>
        <div className="space-y-2">
          {specs.map((spec, idx) => (
            <div key={spec.id ?? idx} className="flex gap-2">
              <Input
                value={spec.label}
                onChange={(e) => updateSpec(idx, "label", e.target.value)}
                placeholder="Campo (ex: Sensor)"
                className="text-sm"
              />
              <Input
                value={spec.value}
                onChange={(e) => updateSpec(idx, "value", e.target.value)}
                placeholder="Valor (ex: PixArt PAW3395)"
                className="text-sm"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0 text-muted-foreground hover:text-red-400"
                onClick={() => removeSpecRow(idx)}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addSpecRow}>
          <Plus className="size-3.5" />
          Adicionar campo
        </Button>
      </div>

      {/* Vídeo de análise */}
      <div className="space-y-2">
        <Label>Vídeo de análise (YouTube)</Label>
        <Input
          value={formData.video_url}
          onChange={(e) => set("video_url", e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="text-sm"
        />
        <p className="text-[10px] text-muted-foreground/60">Opcional. Aparece embutido na página do produto.</p>
      </div>

      {/* Images */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <Label>Imagens</Label>
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
          Arraste pelo ícone no canto para reordenar. A primeira imagem é a principal. Até{" "}
          {MAX_IMAGES} imagens, {Math.floor(MAX_IMAGE_FILE_SIZE_BYTES / (1024 * 1024))}MB cada
          (comprimida automaticamente se maior). Recomendado: fundo branco ou transparente.
        </p>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || uploading}>
          {(loading || uploading) && <Loader2 className="mr-2 size-4 animate-spin" />}
          <Upload className="mr-2 size-4" />
          {product ? "Salvar alterações" : `Criar ${isBazaar ? "item do Bazar" : "produto"}`}
        </Button>
      </div>
    </form>
  )
}
