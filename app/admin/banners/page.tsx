"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AlertCircle,
  CalendarClock,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Link2,
  Pencil,
  Plus,
  Smartphone,
  Trash2,
  Upload,
} from "lucide-react"
import { toast } from "sonner"

import { usePageHeader } from "@/components/providers/page-header-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import BoxLoader from "@/components/ui/box-loader"
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
import { BANNER_LINK_HINT, isValidBannerLink } from "@/lib/banner-link"
import { cn } from "@/lib/utils"

type Banner = {
  id: string
  image_url: string
  image_url_mobile: string | null
  link_url: string | null
  alt_text: string | null
  sort_order: number
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  created_at: string
  updated_at: string
}

const MAX_ACTIVE = 7
const RECOMMENDED_DESKTOP = "1600 × 500 px (16:5)"
const RECOMMENDED_MOBILE = "800 × 400 px (2:1)"
const RECOMMENDED_FORMAT = ".webp ou .png · até 500 KB"

type ImageVariant = "desktop" | "mobile"

type FormState = {
  imageUrl: string
  imageUrlMobile: string
  linkUrl: string
  altText: string
  isActive: boolean
  startsAt: string
  endsAt: string
}

const EMPTY_FORM: FormState = {
  imageUrl: "",
  imageUrlMobile: "",
  linkUrl: "",
  altText: "",
  isActive: true,
  startsAt: "",
  endsAt: "",
}

// ── Datas ──────────────────────────────────────────────────
// O banco guarda UTC; o <input type="datetime-local"> fala no fuso do admin.
function toLocalInput(iso: string | null): string {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

// ── Status ─────────────────────────────────────────────────
type BannerStatus = { label: string; hint: string | null; className: string }

/**
 * "Ativo" é o botão que o admin controla; "no ar" é ativo *e* dentro da janela
 * de datas. Esta função traduz a combinação dos dois no rótulo que o painel
 * mostra, para não haver dúvida sobre o que está aparecendo na Home.
 */
function resolveStatus(banner: Banner): BannerStatus {
  if (!banner.is_active) {
    return { label: "Inativo", hint: null, className: "bg-slate-500/10 text-muted-foreground" }
  }

  const now = Date.now()
  if (banner.starts_at && Date.parse(banner.starts_at) > now) {
    return {
      label: "Agendado",
      hint: `a partir de ${formatDateTime(banner.starts_at)}`,
      className: "bg-blue-500/10 text-blue-400",
    }
  }
  if (banner.ends_at && Date.parse(banner.ends_at) <= now) {
    return {
      label: "Expirado",
      hint: `em ${formatDateTime(banner.ends_at)}`,
      className: "bg-amber-500/10 text-amber-400",
    }
  }

  return {
    label: "No ar",
    hint: banner.ends_at ? `até ${formatDateTime(banner.ends_at)}` : null,
    className: "bg-emerald-500/10 text-emerald-400",
  }
}

// ────────────────────────────────────────────
// Linha arrastável
// ────────────────────────────────────────────
function SortableBannerRow({
  banner,
  position,
  onEdit,
  onToggle,
  onDelete,
  isBusy,
}: {
  banner: Banner
  position: number
  onEdit: (banner: Banner) => void
  onToggle: (banner: Banner) => void
  onDelete: (banner: Banner) => void
  isBusy: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: banner.id,
  })
  const status = resolveStatus(banner)

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors",
        isDragging && "z-10 border-primary/40 shadow-lg",
        !banner.is_active && "opacity-60"
      )}
    >
      <button
        type="button"
        aria-label={`Reordenar banner ${position}`}
        className="cursor-grab touch-none rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
        {position}
      </span>

      <div className="h-14 w-40 shrink-0 overflow-hidden rounded-lg bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={banner.image_url} alt={banner.alt_text ?? ""} className="size-full object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-sm text-foreground">
          <Link2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">
            {banner.link_url ?? <span className="text-muted-foreground">Sem link</span>}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="truncate">{banner.alt_text || "Sem texto alternativo"}</span>
          {banner.image_url_mobile && (
            <span
              title="Tem arte específica para mobile"
              className="flex shrink-0 items-center gap-0.5 text-[10px]"
            >
              <Smartphone className="size-3" />
              mobile
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", status.className)}>
          {status.label}
        </span>
        {status.hint && (
          <p className="mt-0.5 text-[10px] text-muted-foreground">{status.hint}</p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label={banner.is_active ? "Desativar banner" : "Ativar banner"}
          disabled={isBusy}
          onClick={() => onToggle(banner)}
        >
          {banner.is_active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label="Editar banner"
          disabled={isBusy}
          onClick={() => onEdit(banner)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-red-500/60 hover:text-red-400"
          aria-label="Remover banner"
          disabled={isBusy}
          onClick={() => onDelete(banner)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

// ────────────────────────────────────────────
// Página
// ────────────────────────────────────────────
export default function AdminBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [uploading, setUploading] = useState<ImageVariant | null>(null)
  const [saving, setSaving] = useState(false)
  const desktopInputRef = useRef<HTMLInputElement>(null)
  const mobileInputRef = useRef<HTMLInputElement>(null)

  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null)
  const [deleting, setDeleting] = useState(false)

  const activeCount = banners.filter((banner) => banner.is_active).length
  const liveCount = banners.filter((banner) => resolveStatus(banner).label === "No ar").length
  const limitReached = activeCount >= MAX_ACTIVE
  // Ao editar um banner já ativo, ele mesmo não conta contra o limite.
  const canActivateInForm = editing?.is_active ? true : !limitReached

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  usePageHeader(
    "Banners da Home",
    "Carrossel do topo da página inicial. Até 7 banners ativos, girando a cada 10 segundos."
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/banners")
      const data = (await res.json()) as { banners?: Banner[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar banners.")
      setBanners(data.banners ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar banners."
      setError(message)
      toast.error("Erro ao carregar banners", { description: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, isActive: !limitReached })
    setFormOpen(true)
  }

  function openEdit(banner: Banner) {
    setEditing(banner)
    setForm({
      imageUrl: banner.image_url,
      imageUrlMobile: banner.image_url_mobile ?? "",
      linkUrl: banner.link_url ?? "",
      altText: banner.alt_text ?? "",
      isActive: banner.is_active,
      startsAt: toLocalInput(banner.starts_at),
      endsAt: toLocalInput(banner.ends_at),
    })
    setFormOpen(true)
  }

  async function handleUpload(file: File, variant: ImageVariant) {
    setUploading(variant)
    try {
      const body = new FormData()
      body.append("file", file)
      body.append("variant", variant)
      const res = await fetch("/api/admin/banners/upload-image", { method: "POST", body })
      const data = (await res.json()) as { publicUrl?: string; error?: string }
      if (!res.ok || !data.publicUrl) throw new Error(data.error ?? "Erro ao enviar imagem.")
      setForm((prev) =>
        variant === "desktop"
          ? { ...prev, imageUrl: data.publicUrl! }
          : { ...prev, imageUrlMobile: data.publicUrl! }
      )
      toast.success("Imagem enviada")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar imagem."
      toast.error("Erro no upload", { description: message })
    } finally {
      setUploading(null)
      const ref = variant === "desktop" ? desktopInputRef : mobileInputRef
      if (ref.current) ref.current.value = ""
    }
  }

  async function handleSave() {
    if (!form.imageUrl) {
      toast.error("Envie a imagem do banner.")
      return
    }
    const link = form.linkUrl.trim()
    if (link && !isValidBannerLink(link)) {
      toast.error("Link inválido", { description: BANNER_LINK_HINT })
      return
    }
    const startsAt = fromLocalInput(form.startsAt)
    const endsAt = fromLocalInput(form.endsAt)
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      toast.error("Agendamento inválido", {
        description: "A data de fim precisa ser posterior à data de início.",
      })
      return
    }

    setSaving(true)
    try {
      const payload = {
        imageUrl: form.imageUrl,
        imageUrlMobile: form.imageUrlMobile.trim() || null,
        linkUrl: link || null,
        altText: form.altText.trim() || null,
        isActive: form.isActive,
        startsAt,
        endsAt,
      }
      const res = await fetch(
        editing ? `/api/admin/banners/${editing.id}` : "/api/admin/banners",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      )
      const data = (await res.json()) as { banner?: Banner; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar banner.")

      toast.success(editing ? "Banner atualizado" : "Banner criado")
      setFormOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao salvar banner."
      toast.error("Erro ao salvar", { description: message })
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(banner: Banner) {
    if (!banner.is_active && limitReached) {
      toast.error("Limite de banners ativos", {
        description: `Já existem ${MAX_ACTIVE} banners ativos. Desative um antes de ativar outro.`,
      })
      return
    }

    setBusy(true)
    // Otimista: reverte se a API recusar.
    const previous = banners
    setBanners((list) =>
      list.map((item) => (item.id === banner.id ? { ...item, is_active: !item.is_active } : item))
    )
    try {
      const res = await fetch(`/api/admin/banners/${banner.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !banner.is_active }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao alterar o banner.")
    } catch (err) {
      setBanners(previous)
      const message = err instanceof Error ? err.message : "Erro ao alterar o banner."
      toast.error("Não foi possível alterar", { description: message })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/banners/${deleteTarget.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Erro ao remover banner.")
      }
      setBanners((list) => list.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success("Banner removido")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao remover banner."
      toast.error("Erro ao remover", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = banners.findIndex((banner) => banner.id === active.id)
    const newIndex = banners.findIndex((banner) => banner.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const previous = banners
    const reordered = arrayMove(banners, oldIndex, newIndex)
    setBanners(reordered)

    try {
      const res = await fetch("/api/admin/banners/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((banner) => banner.id) }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Erro ao reordenar.")
      }
    } catch (err) {
      setBanners(previous)
      const message = err instanceof Error ? err.message : "Erro ao reordenar."
      toast.error("Não foi possível reordenar", { description: message })
    }
  }

  return (
    <div className="space-y-6">
      {/* Contador + ação */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "rounded-xl border px-4 py-2",
              limitReached ? "border-amber-500/30 bg-amber-500/10" : "border-border bg-muted/30"
            )}
          >
            <p className="text-2xl font-black text-foreground">
              {activeCount}
              <span className="text-base font-bold text-muted-foreground">/{MAX_ACTIVE}</span>
            </p>
            <p className="text-xs text-muted-foreground">banners ativos</p>
          </div>
          <div className="rounded-xl border border-border bg-muted/30 px-4 py-2">
            <p className="text-2xl font-black text-foreground">{liveCount}</p>
            <p className="text-xs text-muted-foreground">no ar agora</p>
          </div>
          <p className="max-w-[15rem] text-xs text-muted-foreground">
            Desktop <strong className="text-foreground/80">{RECOMMENDED_DESKTOP}</strong> · mobile{" "}
            <strong className="text-foreground/80">{RECOMMENDED_MOBILE}</strong> ·{" "}
            {RECOMMENDED_FORMAT}
          </p>
        </div>

        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          Adicionar banner
        </Button>
      </div>

      {limitReached && (
        <Alert className="border-amber-500/30 bg-amber-500/10 py-2">
          <AlertCircle className="size-3.5 text-amber-400" />
          <AlertDescription className="text-xs text-amber-300">
            Limite de {MAX_ACTIVE} banners ativos atingido. Novos banners entram como inativos até
            você desativar um dos atuais.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-14">
          <BoxLoader />
        </div>
      ) : banners.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <ImagePlus className="size-10 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Nenhum banner cadastrado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem banners no ar, a Home mostra o destaque padrão “Periféricos sem mistério”.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={openCreate}>
            <Plus className="size-3.5" />
            Criar banner
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={banners.map((banner) => banner.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {banners.map((banner, index) => (
                <SortableBannerRow
                  key={banner.id}
                  banner={banner}
                  position={index + 1}
                  onEdit={openEdit}
                  onToggle={handleToggle}
                  onDelete={setDeleteTarget}
                  isBusy={busy}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {/* Dialog de criar/editar */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto border border-border bg-card sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar banner" : "Novo banner"}</DialogTitle>
            <DialogDescription>
              A imagem preenche o espaço com recorte central (object-cover).
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Imagem desktop */}
            <div className="space-y-2">
              <Label>Imagem (desktop)</Label>
              <div className="aspect-[16/5] w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
                {form.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imageUrl} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <ImagePlus className="size-6" />
                    <span className="text-xs">Nenhuma imagem enviada</span>
                  </div>
                )}
              </div>
              <input
                ref={desktopInputRef}
                type="file"
                accept="image/webp,image/png,image/jpeg"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleUpload(file, "desktop")
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                disabled={uploading !== null}
                onClick={() => desktopInputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                {uploading === "desktop"
                  ? "Enviando..."
                  : form.imageUrl
                    ? "Trocar imagem"
                    : "Enviar imagem"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Recomendado: {RECOMMENDED_DESKTOP} · {RECOMMENDED_FORMAT}
              </p>
            </div>

            {/* Imagem mobile */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Smartphone className="size-3.5" />
                Imagem (mobile) — opcional
              </Label>
              <div className="aspect-[2/1] w-full max-w-[15rem] overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
                {form.imageUrlMobile ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.imageUrlMobile} alt="" className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <span className="text-[11px]">Usa a arte de desktop recortada</span>
                  </div>
                )}
              </div>
              <input
                ref={mobileInputRef}
                type="file"
                accept="image/webp,image/png,image/jpeg"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleUpload(file, "mobile")
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  disabled={uploading !== null}
                  onClick={() => mobileInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  {uploading === "mobile" ? "Enviando..." : "Enviar arte mobile"}
                </Button>
                {form.imageUrlMobile && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setForm((prev) => ({ ...prev, imageUrlMobile: "" }))}
                  >
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Recomendado: {RECOMMENDED_MOBILE}. Use quando a arte tiver texto nas laterais — o
                recorte do desktop cortaria.
              </p>
            </div>

            {/* Link */}
            <div className="space-y-2">
              <Label htmlFor="banner-link">Link de destino</Label>
              <Input
                id="banner-link"
                placeholder="/tierlist ou https://exemplo.com"
                value={form.linkUrl}
                onChange={(event) => setForm((prev) => ({ ...prev, linkUrl: event.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                {BANNER_LINK_HINT} Links externos abrem em nova aba. Deixe vazio para um banner sem
                clique.
              </p>
            </div>

            {/* Alt */}
            <div className="space-y-2">
              <Label htmlFor="banner-alt">Texto alternativo</Label>
              <Input
                id="banner-alt"
                placeholder="Ex.: Promoção de teclados até 30% off"
                maxLength={160}
                value={form.altText}
                onChange={(event) => setForm((prev) => ({ ...prev, altText: event.target.value }))}
              />
              <p className="text-[11px] text-muted-foreground">
                Descreve a imagem para leitores de tela. Deixe vazio se o banner for puramente
                decorativo.
              </p>
            </div>

            {/* Agendamento */}
            <div className="space-y-2 rounded-lg border border-border p-3">
              <Label className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5" />
                Agendamento — opcional
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="banner-starts" className="text-[11px] text-muted-foreground">
                    Entra no ar
                  </Label>
                  <Input
                    id="banner-starts"
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, startsAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="banner-ends" className="text-[11px] text-muted-foreground">
                    Sai do ar
                  </Label>
                  <Input
                    id="banner-ends"
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, endsAt: event.target.value }))
                    }
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Vazio = sem limite. O banner também precisa estar ativo. A Home tem cache de 5
                minutos, então a troca pode levar até esse tempo para aparecer.
              </p>
            </div>

            {/* Ativo */}
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Banner ativo</p>
                <p className="text-[11px] text-muted-foreground">
                  {canActivateInForm
                    ? "Libera o banner para o carrossel, respeitando o agendamento."
                    : `Limite de ${MAX_ACTIVE} ativos atingido — salve como inativo e ative depois.`}
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                aria-label="Banner ativo"
                disabled={!canActivateInForm && !form.isActive}
                onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50",
                  form.isActive ? "bg-emerald-500" : "bg-muted-foreground/30"
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 size-5 rounded-full bg-white transition-all",
                    form.isActive ? "left-[22px]" : "left-0.5"
                  )}
                />
              </button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || uploading !== null || !form.imageUrl}
            >
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar banner"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de remoção */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Remover banner?</DialogTitle>
            <DialogDescription>
              O banner sai do carrossel imediatamente e a arte é apagada do storage se nenhum outro
              banner usar a mesma imagem. Esta ação não pode ser desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Removendo..." : "Remover"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
