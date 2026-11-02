"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  AlertCircle,
  Dices,
  ImagePlus,
  Loader2,
  Package,
  Pencil,
  Plus,
  ToggleRight,
  Trash2,
  Trophy,
  Users,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { GiveawayCard } from "@/components/home/GiveawaysShowcase"
import { PeripheralPicker } from "@/components/account/PeripheralPicker"
import { SunanoLoader } from "@/components/ui/SunanoLoader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RouteLink } from "@/components/ui/route-link"
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
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FEATURE_FLAG_MODE_META, type FeatureFlagMode } from "@/lib/feature-flags"
import {
  GIVEAWAY_CATEGORY_LABELS,
  GIVEAWAY_RARITIES,
  GIVEAWAY_RARITY_META,
  giveawayCategoryLabel,
  type GiveawayRarity,
  type GiveawayStatus,
  type PublicGiveaway,
} from "@/lib/giveaways"
import type { AdminGiveaway } from "@/lib/server/repositories/giveaways-repository"
import { storageImgProps } from "@/lib/storage-thumb"
import { ALL_CATEGORIES } from "@/lib/tag-options"
import { cn } from "@/lib/utils"

const STATUS_META: Record<GiveawayStatus, { label: string; className: string }> = {
  draft: { label: "Rascunho", className: "bg-muted text-muted-foreground" },
  open: { label: "Aberto", className: "bg-emerald-500/15 text-emerald-300" },
  closed: { label: "Encerrado", className: "bg-amber-500/15 text-amber-300" },
  drawn: { label: "Sorteado", className: "bg-violet-500/15 text-violet-300" },
}

type PrizeSource = "catalog" | "upload"

type FormState = {
  id: string | null
  source: PrizeSource
  title: string
  category: string
  rarity: GiveawayRarity
  peripheral: { id: string; name: string; imageUrl: string | null } | null
  imageUrl: string | null
  maxParticipants: string
  status: Exclude<GiveawayStatus, "drawn">
  /** `datetime-local` (horário local, sem fuso). */
  endsAt: string
  sortOrder: string
}

const EMPTY_FORM: FormState = {
  id: null,
  source: "catalog",
  title: "",
  category: "mouse",
  rarity: "rare",
  peripheral: null,
  imageUrl: null,
  maxParticipants: "300",
  status: "draft",
  endsAt: "",
  sortOrder: "0",
}

function toLocalInput(iso: string | null) {
  if (!iso) return ""
  const date = new Date(iso)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function formFromGiveaway(giveaway: AdminGiveaway): FormState {
  return {
    id: giveaway.id,
    source: giveaway.imageUrl ? "upload" : "catalog",
    title: giveaway.title,
    category: giveaway.category,
    rarity: giveaway.rarity,
    peripheral: giveaway.peripheral,
    imageUrl: giveaway.imageUrl,
    maxParticipants: String(giveaway.maxParticipants),
    status: giveaway.status === "drawn" ? "closed" : giveaway.status,
    endsAt: toLocalInput(giveaway.endsAt),
    sortOrder: String(giveaway.sortOrder),
  }
}

export default function AdminGiveawaysPage() {
  usePageHeader("Sorteios", "Monte os sorteios da Home: Raro, Especial e Lendário")

  const [giveaways, setGiveaways] = useState<AdminGiveaway[] | null>(null)
  const [flagMode, setFlagMode] = useState<FeatureFlagMode | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState<FormState | null>(null)
  const [drawTarget, setDrawTarget] = useState<AdminGiveaway | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<AdminGiveaway | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const [listRes, flagsRes] = await Promise.all([
        fetch("/api/admin/giveaways", { cache: "no-store" }),
        fetch("/api/admin/feature-flags", { cache: "no-store" }),
      ])
      const list = (await listRes.json()) as { giveaways?: AdminGiveaway[]; error?: string }
      if (!listRes.ok) throw new Error(list.error ?? "Erro ao carregar")
      setGiveaways(list.giveaways ?? [])
      if (flagsRes.ok) {
        const flags = (await flagsRes.json()) as { configs?: { giveaways?: { mode: FeatureFlagMode } } }
        setFlagMode(flags.configs?.giveaways?.mode ?? null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar")
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }
  if (!giveaways) return <SunanoLoader />

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <RouteLink
          href="/admin/feature-flags"
          className="flex items-center gap-2 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <ToggleRight className="size-4" />
          Seção na Home:{" "}
          <span className="font-semibold text-foreground">
            {flagMode ? FEATURE_FLAG_MODE_META[flagMode].label : "—"}
          </span>
        </RouteLink>
        <Button type="button" onClick={() => setForm(EMPTY_FORM)}>
          <Plus className="size-4" />
          Novo sorteio
        </Button>
      </div>

      {giveaways.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          <span className="text-3xl">🎉</span>
          Nenhum sorteio ainda
        </div>
      ) : (
        <ul className="space-y-2">
          {giveaways.map((giveaway) => (
            <GiveawayRow
              key={giveaway.id}
              giveaway={giveaway}
              onEdit={() => setForm(formFromGiveaway(giveaway))}
              onDraw={() => setDrawTarget(giveaway)}
              onDelete={() => setDeleteTarget(giveaway)}
            />
          ))}
        </ul>
      )}

      {form && (
        <GiveawayFormDialog
          initial={form}
          onClose={() => setForm(null)}
          onSaved={() => {
            setForm(null)
            load()
          }}
        />
      )}

      <DrawDialog target={drawTarget} onClose={() => setDrawTarget(null)} onDrawn={load} />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={load} />
    </div>
  )
}

function GiveawayRow({
  giveaway,
  onEdit,
  onDraw,
  onDelete,
}: {
  giveaway: AdminGiveaway
  onEdit: () => void
  onDraw: () => void
  onDelete: () => void
}) {
  const rarity = GIVEAWAY_RARITY_META[giveaway.rarity]
  const status = STATUS_META[giveaway.status]
  const image = giveaway.imageUrl ?? giveaway.peripheral?.imageUrl ?? null
  const canDraw = (giveaway.status === "open" || giveaway.status === "closed") && giveaway.entriesCount > 0

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-xl bg-card p-3 ring-1 ring-border">
      <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-[var(--card-image-bg)]">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img {...storageImgProps(image, 56)} alt="" className="size-full object-contain p-1" />
        ) : (
          <Package className="m-auto size-6 h-full text-muted-foreground" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={cn("rounded-full px-1.5 py-px text-[10px] font-bold uppercase", rarity.chipClass)}>
            {rarity.label}
          </span>
          <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold", status.className)}>
            {status.label}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {giveawayCategoryLabel(giveaway.category)}
          </span>
        </div>
        <p className="mt-0.5 truncate text-sm font-semibold">{giveaway.title}</p>
        <p className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            {giveaway.entriesCount}/{giveaway.maxParticipants}
          </span>
          {giveaway.winnerName && (
            <span className="flex items-center gap-1 text-violet-300">
              <Trophy className="size-3" />
              {giveaway.winnerName}
            </span>
          )}
        </p>
      </div>

      <div className="flex gap-1.5">
        {canDraw && (
          <Button type="button" size="sm" variant="outline" onClick={onDraw}>
            <Dices className="size-3.5" />
            Sortear
          </Button>
        )}
        {giveaway.status !== "drawn" && (
          <Button type="button" size="icon" variant="ghost" onClick={onEdit} aria-label="Editar">
            <Pencil className="size-4" />
          </Button>
        )}
        <Button type="button" size="icon" variant="ghost" onClick={onDelete} aria-label="Apagar">
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  )
}

function GiveawayFormDialog({
  initial,
  onClose,
  onSaved,
}: {
  initial: FormState
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<FormState>(initial)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }))

  const upload = async (file: File) => {
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/admin/giveaways/upload-image", { method: "POST", body })
      const data = (await res.json()) as { publicUrl?: string; error?: string }
      if (!res.ok || !data.publicUrl) throw new Error(data.error ?? "Falha no envio")
      set("imageUrl", data.publicUrl)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha no envio")
    } finally {
      setUploading(false)
    }
  }

  const previewImage = form.source === "upload" ? form.imageUrl : form.peripheral?.imageUrl ?? null
  const maxParticipants = Math.max(1, Number(form.maxParticipants) || 1)
  const preview: PublicGiveaway = {
    id: "preview",
    title: form.title || "Nome do prêmio",
    category: form.category,
    rarity: form.rarity,
    imageUrl: previewImage,
    peripheralHref: null,
    maxParticipants,
    entriesCount: Math.round(maxParticipants * 0.42),
    status: "open",
    endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
    winnerName: null,
  }

  const submit = async () => {
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        category: form.category,
        rarity: form.rarity,
        peripheralId: form.source === "catalog" ? form.peripheral?.id ?? null : null,
        imageUrl: form.source === "upload" ? form.imageUrl : null,
        maxParticipants: Number(form.maxParticipants),
        status: form.status,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        sortOrder: Number(form.sortOrder) || 0,
      }
      const res = await fetch(form.id ? `/api/admin/giveaways/${form.id}` : "/api/admin/giveaways", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? "Erro ao salvar")
      toast.success(form.id ? "Sorteio salvo" : "Sorteio criado")
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao salvar")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Editar sorteio" : "Novo sorteio"}</DialogTitle>
          <DialogDescription>A prévia no fim é exatamente o card da Home e da Central de Aura</DialogDescription>
        </DialogHeader>

        <div className="grid gap-5">
          <div className="space-y-4">
            {/* Raridade = cor do card. */}
            <div className="space-y-1.5">
              <Label>Raridade</Label>
              <div className="grid grid-cols-3 gap-2">
                {GIVEAWAY_RARITIES.slice()
                  .reverse()
                  .map((rarity) => (
                    <button
                      key={rarity}
                      type="button"
                      onClick={() => set("rarity", rarity)}
                      className={cn(
                        "rounded-lg px-2 py-2 text-xs font-bold uppercase tracking-wide transition",
                        GIVEAWAY_RARITY_META[rarity].chipClass,
                        form.rarity === rarity ? "ring-2" : "opacity-50 hover:opacity-90"
                      )}
                    >
                      {GIVEAWAY_RARITY_META[rarity].label}
                    </button>
                  ))}
              </div>
            </div>

            {/* Prêmio: do catálogo ou foto + nome. */}
            <div className="space-y-2">
              <Label>Prêmio</Label>
              <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted/50 p-1">
                {(
                  [
                    ["catalog", "Do catálogo"],
                    ["upload", "Foto e nome"],
                  ] as const
                ).map(([source, label]) => (
                  <button
                    key={source}
                    type="button"
                    onClick={() => set("source", source)}
                    className={cn(
                      "rounded-md py-1.5 text-xs font-semibold transition",
                      form.source === source ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {form.source === "catalog" ? (
                form.peripheral ? (
                  <div className="flex items-center gap-2 rounded-lg bg-muted/40 p-2 text-sm">
                    <Package className="size-4 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate font-medium">{form.peripheral.name}</span>
                    <button
                      type="button"
                      aria-label="Trocar periférico"
                      onClick={() => set("peripheral", null)}
                      className="rounded p-1 text-muted-foreground hover:bg-background hover:text-foreground"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ) : (
                  <PeripheralPicker
                    autoFocus
                    onSelect={(peripheral) =>
                      setForm((current) => ({
                        ...current,
                        peripheral: { id: peripheral.id, name: peripheral.name, imageUrl: peripheral.image_url },
                        // O nome e a categoria saem da ficha; dá para ajustar depois.
                        title: current.title || peripheral.name,
                        category: (ALL_CATEGORIES as string[]).includes(peripheral.category)
                          ? peripheral.category
                          : current.category,
                      }))
                    }
                  />
                )
              ) : (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 text-muted-foreground transition hover:border-foreground/30 hover:text-foreground"
                  >
                    {uploading ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : form.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img {...storageImgProps(form.imageUrl, 80)} alt="" className="size-full object-contain p-1" />
                    ) : (
                      <ImagePlus className="size-5" />
                    )}
                  </button>
                  <p className="text-xs text-muted-foreground">
                    PNG, JPG ou WebP. Fundo transparente fica melhor no card
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) upload(file)
                      event.target.value = ""
                    }}
                  />
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="giveaway-title">Nome do prêmio</Label>
                <Input
                  id="giveaway-title"
                  value={form.title}
                  maxLength={120}
                  onChange={(event) => set("title", event.target.value)}
                  placeholder="Ex.: Pulsar Superglide Glass Pad v3"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select value={form.category} onValueChange={(value) => set("category", value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_CATEGORIES.map((category) => (
                      <SelectItem key={category} value={category}>
                        {GIVEAWAY_CATEGORY_LABELS[category]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="giveaway-max">Vagas</Label>
                <Input
                  id="giveaway-max"
                  type="number"
                  min={1}
                  max={100000}
                  value={form.maxParticipants}
                  onChange={(event) => set("maxParticipants", event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label>Situação</Label>
                <Select value={form.status} onValueChange={(value) => set("status", value as FormState["status"])}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Rascunho (não aparece)</SelectItem>
                    <SelectItem value="open">Aberto</SelectItem>
                    <SelectItem value="closed">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="giveaway-ends">Encerra em (opcional)</Label>
                <Input
                  id="giveaway-ends"
                  type="datetime-local"
                  value={form.endsAt}
                  onChange={(event) => set("endsAt", event.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="giveaway-order">Ordem</Label>
                <Input
                  id="giveaway-order"
                  type="number"
                  value={form.sortOrder}
                  onChange={(event) => set("sortOrder", event.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="max-w-sm space-y-2">
            <Label>Prévia</Label>
            <GiveawayCard giveaway={preview} joined={false} joining={false} burst={false} onJoin={() => {}} />
            <p className="text-[11px] text-muted-foreground">Contador de exemplo; começa em 0</p>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="button" onClick={submit} disabled={saving || uploading}>
            {saving && <Loader2 className="size-4 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DrawDialog({
  target,
  onClose,
  onDrawn,
}: {
  target: AdminGiveaway | null
  onClose: () => void
  onDrawn: () => void
}) {
  const [drawing, setDrawing] = useState(false)
  const [winner, setWinner] = useState<string | null>(null)

  useEffect(() => {
    if (!target) setWinner(null)
  }, [target])

  const draw = async () => {
    if (!target) return
    setDrawing(true)
    try {
      const res = await fetch(`/api/admin/giveaways/${target.id}/draw`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as { winnerName?: string; error?: string } | null
      if (!res.ok || !data?.winnerName) throw new Error(data?.error ?? "Erro ao sortear")
      // Um respiro antes do nome: o momento do sorteio merece um suspense.
      await new Promise((resolve) => setTimeout(resolve, 900))
      setWinner(data.winnerName)
      onDrawn()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao sortear")
    } finally {
      setDrawing(false)
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        {winner ? (
          <div className="flex flex-col items-center gap-3 py-4 text-center">
            <span className="text-5xl">🎉</span>
            <DialogTitle className="text-xl">{winner}</DialogTitle>
            <DialogDescription>
              Ganhou “{target?.title}”. O nome já aparece no card da Home e a pessoa recebeu um aviso no sino
            </DialogDescription>
            <Button type="button" onClick={onClose} className="mt-2">
              Fechar
            </Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Dices className="size-4" />
                Sortear “{target?.title}”?
              </DialogTitle>
              <DialogDescription>
                Um ganhador entre {target?.entriesCount} participantes, escolhido pelo gerador seguro do banco. É
                definitivo: não dá para sortear de novo
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose} disabled={drawing}>
                Cancelar
              </Button>
              <Button type="button" onClick={draw} disabled={drawing}>
                {drawing ? <Loader2 className="size-4 animate-spin" /> : <Dices className="size-4" />}
                {drawing ? "Sorteando" : "Sortear agora"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: AdminGiveaway | null
  onClose: () => void
  onDeleted: () => void
}) {
  const [deleting, setDeleting] = useState(false)

  const remove = async () => {
    if (!target) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/giveaways/${target.id}`, { method: "DELETE" })
      const data = (await res.json().catch(() => null)) as { error?: string } | null
      if (!res.ok) throw new Error(data?.error ?? "Erro ao apagar")
      toast.success("Sorteio apagado")
      onClose()
      onDeleted()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao apagar")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Apagar “{target?.title}”?</DialogTitle>
          <DialogDescription>
            {target && target.entriesCount > 0
              ? `As ${target.entriesCount} participações somem junto. Para tirar da Home sem perder nada, mude para Rascunho`
              : "Some da Home e do painel"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={onClose} disabled={deleting}>
            Cancelar
          </Button>
          <Button type="button" variant="destructive" onClick={remove} disabled={deleting}>
            {deleting && <Loader2 className="size-4 animate-spin" />}
            Apagar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
