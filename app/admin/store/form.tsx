"use client"

import { useState } from "react"
import { Loader2, Plus, Trash2, Upload } from "lucide-react"
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
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/stripe"

interface StoreProduct {
  id: string
  slug: string
  name: string
  description: string | null
  price_cents: number
  stock: number
  images: string[]
  category: string | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  condition_notes: string | null
  is_active: boolean
}

interface StoreProductFormProps {
  product?: StoreProduct
  defaultType?: "store" | "bazaar"
  onSuccess: (product: StoreProduct) => void
  onCancel: () => void
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

export function StoreProductForm({ product, defaultType = "store", onSuccess, onCancel }: StoreProductFormProps) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: product?.name ?? "",
    description: product?.description ?? "",
    price_brl: product ? (product.price_cents / 100).toFixed(2) : "",
    stock: product?.stock?.toString() ?? "1",
    category: product?.category ?? "",
    type: product?.type ?? defaultType,
    condition: product?.condition ?? (defaultType === "bazaar" ? "used" : "new"),
    condition_notes: product?.condition_notes ?? "",
    is_active: product?.is_active !== false,
  })

  const [images, setImages] = useState<string[]>(product?.images ?? [])

  function set(field: string, value: string | boolean) {
    setFormData((prev) => ({ ...prev, [field]: value }))
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

    setUploading(true)
    setError(null)
    try {
      const url = await uploadImage(file)
      setImages((prev) => [...prev, url])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao enviar imagem")
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
      const priceCents = Math.round(parseFloat(formData.price_brl.replace(",", ".")) * 100)

      if (isNaN(priceCents) || priceCents <= 0) {
        throw new Error("Preço inválido")
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        price_cents: priceCents,
        stock: parseInt(formData.stock, 10),
        images,
        category: formData.category || null,
        type: formData.type,
        condition: formData.condition,
        condition_notes: formData.condition_notes.trim() || null,
        is_active: formData.is_active,
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

      onSuccess(data.product)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar")
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
            <SelectTrigger>
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
            <SelectTrigger>
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

      {/* Name + Category */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Nome do produto *</Label>
          <Input
            required
            value={formData.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex: Logitech G Pro X Superlight 2"
          />
        </div>

        <div className="space-y-2">
          <Label>Categoria</Label>
          <Select
            value={formData.category || NO_CATEGORY}
            onValueChange={(v) => set("category", v === NO_CATEGORY ? "" : v)}
          >
            <SelectTrigger>
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
          {pricePreview && (
            <p className="text-xs text-emerald-400">{pricePreview}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Estoque *</Label>
          <Input
            required
            type="number"
            min={0}
            value={formData.stock}
            onChange={(e) => set("stock", e.target.value)}
            placeholder="1"
          />
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
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">✅ Ativo (visível)</SelectItem>
              <SelectItem value="inactive">🔒 Inativo (oculto)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Images */}
      <div className="space-y-3">
        <Label>Imagens</Label>
        <div className="flex flex-wrap gap-3">
          {images.map((url, idx) => (
            <div key={url} className="group relative size-24 overflow-hidden rounded-xl border border-white/[0.10] bg-white/[0.03]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Imagem ${idx + 1}`} className="h-full w-full object-contain p-1" />
              <button
                type="button"
                onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <Trash2 className="size-2.5 text-white" />
              </button>
              {idx === 0 && (
                <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 py-0.5 text-[8px] font-semibold text-white">
                  Principal
                </span>
              )}
            </div>
          ))}

          <label className={cn(
            "flex size-24 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-white/[0.12] text-slate-500 transition-colors hover:border-white/[0.25] hover:text-slate-300",
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
        </div>
        <p className="text-[10px] text-muted-foreground">
          A primeira imagem é a principal. Recomendado: fundo branco ou transparente.
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
