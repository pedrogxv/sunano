"use client"

import { useState } from "react"
import { Loader2, Trash2, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { cn } from "@/lib/utils"
import type { AuraItemAdmin } from "@/lib/server/repositories/aura-store-repository"

interface AuraItemFormProps {
  item?: AuraItemAdmin
  onSuccess: (item: AuraItemAdmin) => void
  onCancel: () => void
}

export function AuraItemForm({ item, onSuccess, onCancel }: AuraItemFormProps) {
  const [loading, setLoading] = useState(false)
  const [uploadingPreview, setUploadingPreview] = useState(false)
  const [uploadingFrame, setUploadingFrame] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: item?.name ?? "",
    description: item?.description ?? "",
    auraCost: item?.auraCost?.toString() ?? "",
    sortOrder: item?.sortOrder?.toString() ?? "0",
    active: item?.active !== false,
  })

  const [imageUrl, setImageUrl] = useState<string | null>(item?.imageUrl ?? null)
  const [frameAssetUrl, setFrameAssetUrl] = useState<string | null>(item?.frameAssetUrl ?? null)

  function set<K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  async function uploadFile(file: File): Promise<string> {
    const fd = new FormData()
    fd.set("file", file)
    const res = await fetch("/api/admin/aura-itens/upload-image", { method: "POST", body: fd })
    const data = (await res.json()) as { ok?: boolean; publicUrl?: string; error?: string }
    if (!res.ok || !data.ok || !data.publicUrl) {
      throw new Error(data.error ?? "Erro ao enviar imagem")
    }
    return data.publicUrl
  }

  async function handlePreviewChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingPreview(true)
    setError(null)
    try {
      setImageUrl(await uploadFile(file))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploadingPreview(false)
      e.target.value = ""
    }
  }

  async function handleFrameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingFrame(true)
    setError(null)
    try {
      setFrameAssetUrl(await uploadFile(file))
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem"
      setError(message)
      toast.error("Erro ao enviar imagem", { description: message })
    } finally {
      setUploadingFrame(false)
      e.target.value = ""
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    try {
      if (!formData.name.trim()) {
        throw new Error("Informe o nome do item.")
      }

      const auraCost = parseInt(formData.auraCost, 10)
      if (isNaN(auraCost) || auraCost <= 0) {
        throw new Error("Custo em Aura inválido. Use um inteiro maior que zero.")
      }

      const sortOrder = parseInt(formData.sortOrder, 10)
      if (isNaN(sortOrder)) {
        throw new Error("Ordem inválida.")
      }

      if (!frameAssetUrl) {
        throw new Error("Envie a imagem da moldura (o PNG/SVG sobreposto ao avatar).")
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        imageUrl,
        frameAssetUrl,
        auraCost,
        sortOrder,
        ...(item ? { active: formData.active } : {}),
      }

      const url = item ? `/api/admin/aura-itens/${item.id}` : "/api/admin/aura-itens"
      const method = item ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = (await res.json()) as { item?: AuraItemAdmin; error?: string }

      if (!res.ok || !data.item) {
        throw new Error(data.error ?? "Erro ao salvar item")
      }

      toast.success(item ? "Item atualizado" : "Item criado", {
        description: data.item.name,
      })

      onSuccess(data.item)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar"
      setError(message)
      toast.error("Erro ao salvar item", { description: message })
    } finally {
      setLoading(false)
    }
  }

  const uploading = uploadingPreview || uploadingFrame

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {/* Nome + Custo */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Nome do item *</Label>
          <Input
            required
            minLength={2}
            maxLength={100}
            value={formData.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex: Moldura Dourada"
          />
        </div>

        <div className="space-y-2">
          <Label>Custo em Aura *</Label>
          <Input
            required
            type="number"
            min={1}
            step={1}
            value={formData.auraCost}
            onChange={(e) => set("auraCost", e.target.value)}
            placeholder="Ex: 250"
          />
        </div>
      </div>

      {/* Descrição */}
      <div className="space-y-2">
        <Label>Descrição (aparece no card da loja)</Label>
        <textarea
          value={formData.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Ex: Moldura exclusiva para os usuários mais ativos."
          rows={3}
          maxLength={500}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          )}
        />
      </div>

      {/* Ordem + Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Ordem de exibição</Label>
          <Input
            type="number"
            step={1}
            value={formData.sortOrder}
            onChange={(e) => set("sortOrder", e.target.value)}
          />
          <p className="text-[10px] text-muted-foreground/60">Menor número aparece primeiro na loja.</p>
        </div>

        {item && (
          <div className="space-y-2">
            <Label>Status</Label>
            <label className="flex h-9 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => set("active", e.target.checked)}
                className="size-4 rounded border-border"
              />
              Ativo (visível na loja)
            </label>
          </div>
        )}
      </div>

      {/* Imagens */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <Label>Preview do card (opcional)</Label>
          <div className="flex items-center gap-3">
            {imageUrl ? (
              <div className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={imageUrl} alt={formData.name} className="h-full w-full object-contain p-1" />
                <button
                  type="button"
                  onClick={() => setImageUrl(null)}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="size-2.5 text-white" />
                </button>
              </div>
            ) : (
              <label className={cn(
                "flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-border hover:text-foreground/80",
                uploadingPreview && "cursor-wait opacity-50"
              )}>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handlePreviewChange}
                  disabled={uploadingPreview}
                />
                {uploadingPreview ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                <span className="text-[9px]">PNG</span>
              </label>
            )}
            <p className="text-[10px] text-muted-foreground">
              Se vazio, mostra um ícone padrão no card da loja.
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Label>Moldura (asset sobreposto ao avatar) *</Label>
          <div className="flex items-center gap-3">
            {frameAssetUrl ? (
              <div className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={frameAssetUrl} alt="Moldura" className="h-full w-full object-contain p-1" />
                <button
                  type="button"
                  onClick={() => setFrameAssetUrl(null)}
                  className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-red-500/80 opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <Trash2 className="size-2.5 text-white" />
                </button>
              </div>
            ) : (
              <label className={cn(
                "flex size-20 shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-border hover:text-foreground/80",
                uploadingFrame && "cursor-wait opacity-50"
              )}>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFrameChange}
                  disabled={uploadingFrame}
                />
                {uploadingFrame ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
                <span className="text-[9px]">PNG</span>
              </label>
            )}
            <p className="text-[10px] text-muted-foreground">
              Fundo transparente, quadrada, sobreposta ao avatar do perfil.
            </p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || uploading}>
          {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
          {item ? "Salvar alterações" : "Criar item"}
        </Button>
      </div>
    </form>
  )
}
