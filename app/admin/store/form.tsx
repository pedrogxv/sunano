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
import { CheckCircle2, GripVertical, Loader2, Minus, Plus, Trash2, Upload, XCircle } from "lucide-react"
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
import { MultiCombobox, type ComboboxOption } from "@/components/ui/combobox"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { isValidYoutubeUrl } from "@/lib/youtube-url"
import { encodeFeature, featureLabel, isGoodFeature } from "@/lib/store-features"
import { compressImageFile } from "@/lib/client/compress-image"

interface StoreProductSpec {
  id?: string
  label: string
  value: string
}

interface StoreProductVariantInput {
  id?: string
  label: string
  price_cents_override: number | null
  stock: number
}

interface StoreProductVariantRow {
  id?: string
  label: string
  price_override_brl: string
  stock: string
}

interface StoreProduct {
  id: string
  slug: string
  name: string
  description: string | null
  price_cents: number
  stock: number
  images: string[]
  category: string | null
  brand: string | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  is_active: boolean
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
    stock: product?.stock?.toString() ?? "1",
    category: product?.category ?? "",
    brand: product?.brand ?? "",
    type: product?.type ?? defaultType,
    condition: product?.condition ?? (defaultType === "bazaar" ? "used" : "new"),
    condition_notes: product?.condition_notes ?? "",
    is_active: product?.is_active !== false,
    video_url: product?.video_url ?? "",
  })

  const [images, setImages] = useState<string[]>(product?.images ?? [])
  const [features, setFeatures] = useState<string[]>(product?.features ?? [])
  const [featureInput, setFeatureInput] = useState("")
  const [featureIsGood, setFeatureIsGood] = useState(true)
  const featureInputRef = useRef<HTMLInputElement>(null)
  const [specs, setSpecs] = useState<StoreProductSpec[]>(
    initialSpecs && initialSpecs.length > 0 ? initialSpecs : [{ label: "", value: "" }]
  )
  const [variants, setVariants] = useState<StoreProductVariantRow[]>(
    (initialVariants ?? []).map((v) => ({
      id: v.id,
      label: v.label,
      price_override_brl: v.price_cents_override != null ? (v.price_cents_override / 100).toFixed(2) : "",
      stock: v.stock.toString(),
    }))
  )
  const [peripheralIds, setPeripheralIds] = useState<string[]>(initialPeripheralIds ?? [])
  const [peripheralOptions, setPeripheralOptions] = useState<PeripheralOption[]>([])

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

  function updateVariant(index: number, field: "label" | "price_override_brl" | "stock", value: string) {
    setVariants((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  function addVariantRow() {
    setVariants((prev) => [...prev, { label: "", price_override_brl: "", stock: "0" }])
  }

  function removeVariantRow(index: number) {
    setVariants((prev) => prev.filter((_, i) => i !== index))
  }

  function bumpVariantStock(index: number, delta: number) {
    setVariants((prev) =>
      prev.map((v, i) => {
        if (i !== index) return v
        const current = parseInt(v.stock, 10)
        const base = isNaN(current) ? 0 : current
        const next = Math.min(MAX_STOCK, Math.max(0, base + delta))
        return { ...v, stock: next.toString() }
      })
    )
  }

  function set(field: string, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }))
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

      if (isNaN(priceCents) || priceCents <= 0) {
        throw new Error("Preço inválido. Use um valor maior que zero (ex: 159,90).")
      }
      const stockValue = parseInt(formData.stock, 10)
      if (isNaN(stockValue) || stockValue < 0 || stockValue > MAX_STOCK) {
        throw new Error(`Estoque inválido. Use um número inteiro entre 0 e ${MAX_STOCK.toLocaleString("pt-BR")}.`)
      }

      const videoUrl = formData.video_url.trim()
      if (videoUrl && !isValidYoutubeUrl(videoUrl)) {
        throw new Error("URL de vídeo precisa ser um link do YouTube.")
      }

      const cleanVariants: Array<{ id?: string; label: string; price_cents_override: number | null; stock: number }> = []
      for (const v of variants) {
        const label = v.label.trim()
        if (!label) continue
        const variantStock = parseInt(v.stock, 10)
        if (isNaN(variantStock) || variantStock < 0 || variantStock > MAX_STOCK) {
          throw new Error(`Estoque inválido na variante "${label}".`)
        }
        let priceOverride: number | null = null
        if (v.price_override_brl.trim()) {
          priceOverride = Math.round(parseFloat(v.price_override_brl.replace(",", ".")) * 100)
          if (isNaN(priceOverride) || priceOverride <= 0) {
            throw new Error(`Preço inválido na variante "${label}".`)
          }
        }
        cleanVariants.push({ id: v.id, label, price_cents_override: priceOverride, stock: variantStock })
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price_cents: priceCents,
        stock: stockValue,
        images,
        category: formData.category || null,
        brand: formData.brand.trim() || null,
        type: formData.type,
        condition: formData.condition,
        condition_notes: formData.condition_notes.trim() || null,
        is_active: formData.is_active,
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
  const pricePreview = formData.price_brl
    ? formatBRL(Math.round(parseFloat(formData.price_brl.replace(",", ".")) * 100) || 0)
    : null

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

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

      {/* Name + Category + Brand */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-2 md:col-span-2">
          <Label>Nome do produto *</Label>
          <Input
            required
            minLength={2}
            maxLength={200}
            value={formData.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex: Logitech G Pro X Superlight 2"
          />
          <p className="text-[10px] text-muted-foreground/60">Obrigatório. Use o nome completo do produto.</p>
        </div>

        <div className="space-y-2">
          <Label>Marca</Label>
          <Input
            maxLength={80}
            value={formData.brand}
            onChange={(e) => set("brand", e.target.value)}
            placeholder="Ex: Logitech"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label>Categoria</Label>
        <Select
          value={formData.category || NO_CATEGORY}
          onValueChange={(v) => set("category", v === NO_CATEGORY ? "" : v)}
        >
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
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

      {/* Periféricos vinculados */}
      <div className="space-y-2">
        <Label>Periféricos vinculados</Label>
        <p className="text-[10px] text-muted-foreground/60">
          Associe este produto a um ou mais periféricos do catálogo (ex: um kit com mouse + mousepad).
        </p>
        <MultiCombobox
          options={peripheralOptions.map<ComboboxOption>((p) => ({
            value: p.id,
            label: p.brand ? `${p.name} — ${p.brand}` : p.name,
          }))}
          values={peripheralIds}
          onValuesChange={setPeripheralIds}
          placeholder="Nenhum periférico vinculado"
          searchPlaceholder="Buscar periférico..."
          emptyText="Nenhum periférico encontrado."
          allLabel="Nenhum"
        />
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Descrição</Label>
        <textarea
          value={formData.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Descreva o produto, características, motivo da venda no bazar..."
          rows={4}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          )}
        />
      </div>

      {/* Price + Stock + Active */}
      <div className="grid gap-4 md:grid-cols-3">
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
          <p className="text-[10px] text-muted-foreground/60">Maior que zero. Use vírgula para centavos (ex: 159,90).</p>
          {pricePreview && (
            <p className="text-xs text-emerald-400">{pricePreview}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Estoque *</Label>
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
        </div>

        <div className="space-y-2">
          <Label>Status</Label>
          <Select
            value={formData.is_active ? "active" : "inactive"}
            onValueChange={(v) => set("is_active", v === "active")}
          >
            <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">✅ Ativo (visível)</SelectItem>
              <SelectItem value="inactive">🔒 Inativo (oculto)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Variantes */}
      <div className="space-y-2">
        <Label>Variantes (opcional)</Label>
        <p className="text-[10px] text-muted-foreground/60">
          Se o produto tem variações (cor, modelo, etc.), cadastre aqui — cada uma com seu próprio
          estoque e, se quiser, um preço diferente do preço base acima.
        </p>
        <div className="space-y-2">
          {variants.map((variant, idx) => (
            <div key={variant.id ?? idx} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/10 p-2">
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
              <div className="flex items-stretch gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 shrink-0"
                  onClick={() => bumpVariantStock(idx, -1)}
                  disabled={parseInt(variant.stock, 10) <= 0}
                  aria-label="Diminuir estoque da variante"
                >
                  <Minus className="size-3.5" />
                </Button>
                <Input
                  type="number"
                  min={0}
                  max={MAX_STOCK}
                  step={1}
                  value={variant.stock}
                  onChange={(e) => updateVariant(idx, "stock", e.target.value)}
                  className="no-spinner w-16 text-center text-sm"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 shrink-0"
                  onClick={() => bumpVariantStock(idx, 1)}
                  disabled={parseInt(variant.stock, 10) >= MAX_STOCK}
                  aria-label="Aumentar estoque da variante"
                >
                  <Plus className="size-3.5" />
                </Button>
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
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={addVariantRow}>
          <Plus className="size-3.5" />
          Adicionar variante
        </Button>
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
