"use client"

import { useState } from "react"
import { Loader2, Trash2, Upload } from "lucide-react"
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
import { cn } from "@/lib/utils"
import type { EventCriteriaType, EventDisplay } from "@/lib/events"
import type { MedalRarity } from "@/lib/profile-showcase"

interface EventFormProps {
  event?: EventDisplay
  onSuccess: (event: EventDisplay) => void
  onCancel: () => void
}

const RARITY_OPTIONS: Array<{ value: MedalRarity; label: string }> = [
  { value: "common", label: "Comum" },
  { value: "rare", label: "Raro" },
  { value: "epic", label: "Épico" },
  { value: "legendary", label: "Lendário (dourado)" },
]

const CRITERIA_OPTIONS: Array<{ value: EventCriteriaType; label: string; hint: string }> = [
  {
    value: "first_n_signups",
    label: "Automático — primeiros N cadastros",
    hint: "A medalha é concedida sozinha no cadastro/login enquanto houver vagas. Ninguém precisa clicar em nada.",
  },
  {
    value: "manual_opt_in",
    label: "Manual — usuário clica em Resgatar",
    hint: "A medalha só é concedida quando o usuário logado clica em \"Resgatar\" em /eventos (Conquistas), enquanto houver vagas.",
  },
  {
    value: "aura_redeem",
    label: "Resgatável com Aura",
    hint: "O usuário clica em \"Resgatar\" e a medalha desconta Aura do saldo dele. Vagas são opcionais (em branco = ilimitado, enquanto tiver Aura suficiente).",
  },
]

export function EventForm({ event, onSuccess, onCancel }: EventFormProps) {
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [formData, setFormData] = useState({
    name: event?.name ?? "",
    description: event?.description ?? "",
    rarity: event?.rarity ?? ("legendary" as MedalRarity),
    maxParticipants: event?.maxParticipants?.toString() ?? "1000",
    auraCost: event?.auraCost?.toString() ?? "",
    active: event?.active !== false,
    criteriaType: event?.criteriaType ?? ("first_n_signups" as EventCriteriaType),
  })

  const criteriaType = event?.criteriaType ?? formData.criteriaType

  const [imageUrl, setImageUrl] = useState<string | null>(event?.imageUrl ?? null)

  function set<K extends keyof typeof formData>(field: K, value: (typeof formData)[K]) {
    setFormData((prev) => ({ ...prev, [field]: value }))
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)
    try {
      const fd = new FormData()
      fd.set("file", file)
      const res = await fetch("/api/admin/events/upload-image", { method: "POST", body: fd })
      const data = (await res.json()) as { ok?: boolean; publicUrl?: string; error?: string }
      if (!res.ok || !data.ok || !data.publicUrl) {
        throw new Error(data.error ?? "Erro ao enviar imagem")
      }
      setImageUrl(data.publicUrl)
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
        throw new Error("Informe o nome da conquista/medalha.")
      }

      let maxParticipants: number | null = null
      if (formData.maxParticipants.trim()) {
        maxParticipants = parseInt(formData.maxParticipants, 10)
        if (isNaN(maxParticipants) || maxParticipants <= 0) {
          throw new Error("Número de vagas inválido. Use um inteiro maior que zero ou deixe em branco.")
        }
      } else if (criteriaType !== "aura_redeem") {
        throw new Error("Informe o número de vagas.")
      }

      let auraCost: number | null = null
      if (criteriaType === "aura_redeem") {
        auraCost = parseInt(formData.auraCost, 10)
        if (isNaN(auraCost) || auraCost <= 0) {
          throw new Error("Custo em Aura inválido. Use um inteiro maior que zero.")
        }
      }

      const payload = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        imageUrl,
        rarity: formData.rarity,
        maxParticipants,
        auraCost,
        ...(event ? { active: formData.active } : { criteriaType }),
      }

      const url = event ? `/api/admin/events/${event.id}` : "/api/admin/events"
      const method = event ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = (await res.json()) as { event?: EventDisplay; error?: string }

      if (!res.ok || !data.event) {
        throw new Error(data.error ?? "Erro ao salvar conquista")
      }

      toast.success(event ? "Conquista atualizada" : "Conquista criada", {
        description: data.event.name,
      })

      onSuccess(data.event)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar"
      setError(message)
      toast.error("Erro ao salvar conquista", { description: message })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{error}</AlertDescription>
        </Alert>
      )}

      {event ? (
        <div className="rounded-xl border border-border bg-muted/20 px-4 py-3">
          <p className="text-xs font-semibold text-muted-foreground">
            Critério: {CRITERIA_OPTIONS.find((c) => c.value === event.criteriaType)?.label}
          </p>
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            O critério não pode ser alterado depois de criado.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <Label>Como a medalha é concedida *</Label>
          <Select
            value={formData.criteriaType}
            onValueChange={(v) => set("criteriaType", v as EventCriteriaType)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CRITERIA_OPTIONS.map((c) => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[10px] text-muted-foreground/60">
            {CRITERIA_OPTIONS.find((c) => c.value === formData.criteriaType)?.hint}
          </p>
        </div>
      )}

      {/* Nome + Raridade */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Nome da medalha *</Label>
          <Input
            required
            minLength={2}
            maxLength={100}
            value={formData.name}
            onChange={(e) => set("name", e.target.value)}
            placeholder="Ex: Pioneiro"
          />
        </div>

        <div className="space-y-2">
          <Label>Raridade</Label>
          <Select value={formData.rarity} onValueChange={(v) => set("rarity", v as MedalRarity)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RARITY_OPTIONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Descrição / tooltip */}
      <div className="space-y-2">
        <Label>Descrição (aparece no hover do card)</Label>
        <textarea
          value={formData.description}
          onChange={(e) => set("description", e.target.value)}
          placeholder="Ex: Medalha recebida pelos primeiros 1000 usuários do site."
          rows={3}
          maxLength={500}
          className={cn(
            "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2",
            "focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
          )}
        />
      </div>

      {/* Vagas + Custo em Aura */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label>Número de vagas {criteriaType === "aura_redeem" ? "" : "*"}</Label>
          <Input
            required={criteriaType !== "aura_redeem"}
            type="number"
            min={1}
            step={1}
            value={formData.maxParticipants}
            onChange={(e) => set("maxParticipants", e.target.value)}
            placeholder={criteriaType === "aura_redeem" ? "Deixe em branco para ilimitado" : "1000"}
          />
          {event && (
            <p className="text-[10px] text-muted-foreground/60">
              {event.currentCount} já resgataram
              {formData.maxParticipants.trim() ? ` de ${formData.maxParticipants}` : " (vagas ilimitadas)"}.
            </p>
          )}
        </div>

        {criteriaType === "aura_redeem" && (
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
        )}
      </div>

      {/* Status */}
      {event && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={formData.active ? "active" : "inactive"}
              onValueChange={(v) => set("active", v === "active")}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">✅ Ativo</SelectItem>
                <SelectItem value="inactive">🔒 Encerrado</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground/60">
              Encerrar manualmente impede novas conquistas mesmo com vagas restantes.
            </p>
          </div>
        </div>
      )}

      {/* Imagem */}
      <div className="space-y-3">
        <Label>Imagem da medalha (PNG)</Label>
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
              uploading && "cursor-wait opacity-50"
            )}>
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageChange}
                disabled={uploading}
              />
              {uploading ? <Loader2 className="size-5 animate-spin" /> : <Upload className="size-5" />}
              <span className="text-[9px]">PNG</span>
            </label>
          )}
          <p className="text-[10px] text-muted-foreground">
            Recomendado: fundo transparente, quadrada. Se vazio, mostra um ícone padrão.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
          Cancelar
        </Button>
        <Button type="submit" disabled={loading || uploading}>
          {loading && <Loader2 className="mr-2 size-4 animate-spin" />}
          {event ? "Salvar alterações" : "Criar conquista"}
        </Button>
      </div>
    </form>
  )
}
