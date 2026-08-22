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
  Eye,
  EyeOff,
  GalleryHorizontalEnd,
  GripVertical,
  ImagePlus,
  Link2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Video,
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
import type { StoreBannerSection } from "@/lib/server/repositories/store-banners-repository"
import { cn } from "@/lib/utils"

type Banner = {
  id: string
  section: StoreBannerSection
  image_url: string | null
  video_url: string | null
  title: string
  subtitle: string | null
  cta_text: string | null
  cta_link: string | null
  sort_order: number
  is_active: boolean
  created_at: string
  updated_at: string
}

const SECTIONS: StoreBannerSection[] = ["main", "best_sellers", "pre_sale", "ready_stock", "site_items"]

const SECTION_LABELS: Record<StoreBannerSection, string> = {
  main: "Topo da Loja",
  best_sellers: "Mais vendidos",
  pre_sale: "Pré-venda",
  ready_stock: "Pronta entrega",
  site_items: "Itens para o site",
}

type FormState = {
  imageUrl: string
  videoUrl: string
  title: string
  subtitle: string
  ctaText: string
  ctaLink: string
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  imageUrl: "",
  videoUrl: "",
  title: "",
  subtitle: "",
  ctaText: "",
  ctaLink: "",
  isActive: true,
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

      <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-muted">
        {banner.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={banner.image_url} alt="" className="size-full object-cover" />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Video className="size-4" />
          </div>
        )}
        {banner.video_url && (
          <span className="absolute bottom-1 right-1 flex size-4 items-center justify-center rounded-full bg-black/60 text-white">
            <Video className="size-2.5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{banner.title}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {banner.cta_link ? (
            <>
              <Link2 className="size-3 shrink-0" />
              <span className="truncate">{banner.cta_link}</span>
            </>
          ) : (
            <span>Sem CTA</span>
          )}
        </div>
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
export default function AdminStoreBannersPage() {
  const [banners, setBanners] = useState<Banner[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [activeSection, setActiveSection] = useState<StoreBannerSection>("main")

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Banner | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [uploading, setUploading] = useState<"image" | "video" | null>(null)
  const [saving, setSaving] = useState(false)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)

  const [deleteTarget, setDeleteTarget] = useState<Banner | null>(null)
  const [deleting, setDeleting] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  usePageHeader(
    "Banners da Loja",
    "Carrossel de cada seção da Home da Loja. Sem banner cadastrado, a seção volta ao formato de lista."
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/store-banners")
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

  const sectionBanners = banners
    .filter((banner) => banner.section === activeSection)
    .sort((a, b) => a.sort_order - b.sort_order)

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(banner: Banner) {
    setEditing(banner)
    setForm({
      imageUrl: banner.image_url ?? "",
      videoUrl: banner.video_url ?? "",
      title: banner.title,
      subtitle: banner.subtitle ?? "",
      ctaText: banner.cta_text ?? "",
      ctaLink: banner.cta_link ?? "",
      isActive: banner.is_active,
    })
    setFormOpen(true)
  }

  async function handleUpload(file: File, kind: "image" | "video") {
    setUploading(kind)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch(`/api/admin/store-banners/upload-${kind}`, { method: "POST", body })
      const data = (await res.json()) as { publicUrl?: string; error?: string }
      if (!res.ok || !data.publicUrl) throw new Error(data.error ?? "Erro ao enviar arquivo.")
      setForm((prev) =>
        kind === "image" ? { ...prev, imageUrl: data.publicUrl! } : { ...prev, videoUrl: data.publicUrl! }
      )
      toast.success(kind === "image" ? "Imagem enviada" : "Vídeo enviado")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao enviar arquivo."
      toast.error("Erro no upload", { description: message })
    } finally {
      setUploading(null)
      const ref = kind === "image" ? imageInputRef : videoInputRef
      if (ref.current) ref.current.value = ""
    }
  }

  async function handleSave() {
    if (!form.title.trim()) {
      toast.error("Envie o título do banner.")
      return
    }
    if (!form.imageUrl && !form.videoUrl) {
      toast.error("Envie uma imagem ou um vídeo de fundo.")
      return
    }
    const ctaLink = form.ctaLink.trim()
    if (ctaLink && !isValidBannerLink(ctaLink)) {
      toast.error("Link inválido", { description: BANNER_LINK_HINT })
      return
    }

    setSaving(true)
    try {
      const payload = {
        section: activeSection,
        imageUrl: form.imageUrl.trim() || null,
        videoUrl: form.videoUrl.trim() || null,
        title: form.title.trim(),
        subtitle: form.subtitle.trim() || null,
        ctaText: form.ctaText.trim() || null,
        ctaLink: ctaLink || null,
        isActive: form.isActive,
      }
      const res = await fetch(
        editing ? `/api/admin/store-banners/${editing.id}` : "/api/admin/store-banners",
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
    setBusy(true)
    const previous = banners
    setBanners((list) =>
      list.map((item) => (item.id === banner.id ? { ...item, is_active: !item.is_active } : item))
    )
    try {
      const res = await fetch(`/api/admin/store-banners/${banner.id}`, {
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
      const res = await fetch(`/api/admin/store-banners/${deleteTarget.id}`, { method: "DELETE" })
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

    const oldIndex = sectionBanners.findIndex((banner) => banner.id === active.id)
    const newIndex = sectionBanners.findIndex((banner) => banner.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const previous = banners
    const reordered = arrayMove(sectionBanners, oldIndex, newIndex)
    const reorderedIds = new Set(reordered.map((b) => b.id))
    setBanners((list) => [
      ...list.filter((b) => !reorderedIds.has(b.id)),
      ...reordered,
    ])

    try {
      const res = await fetch("/api/admin/store-banners/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ section: activeSection, ids: reordered.map((banner) => banner.id) }),
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
      {/* Abas de seção */}
      <div className="flex flex-wrap gap-2">
        {SECTIONS.map((section) => (
          <button
            key={section}
            type="button"
            onClick={() => setActiveSection(section)}
            className={cn(
              "rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors",
              activeSection === section
                ? "border-primary/40 bg-primary/10 text-foreground"
                : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {SECTION_LABELS[section]}
          </button>
        ))}
      </div>

      <div className="flex justify-end">
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          Adicionar banner
        </Button>
      </div>

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
      ) : sectionBanners.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <GalleryHorizontalEnd className="size-10 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">
              Nenhum banner em &ldquo;{SECTION_LABELS[activeSection]}&rdquo;
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem banner cadastrado, a seção mostra a lista de produtos normalmente.
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
            items={sectionBanners.map((banner) => banner.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {sectionBanners.map((banner, index) => (
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
            <DialogDescription>Seção: {SECTION_LABELS[activeSection]}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Vídeo */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Video className="size-3.5" />
                Vídeo de fundo — opcional
              </Label>
              <div className="aspect-[21/9] w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
                {form.videoUrl ? (
                  <video src={form.videoUrl} muted loop autoPlay playsInline className="size-full object-cover" />
                ) : (
                  <div className="flex size-full flex-col items-center justify-center gap-1 text-muted-foreground">
                    <Video className="size-6" />
                    <span className="text-xs">Nenhum vídeo enviado</span>
                  </div>
                )}
              </div>
              <input
                ref={videoInputRef}
                type="file"
                accept="video/mp4"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleUpload(file, "video")
                }}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="flex-1 gap-2"
                  disabled={uploading !== null}
                  onClick={() => videoInputRef.current?.click()}
                >
                  <Upload className="size-3.5" />
                  {uploading === "video" ? "Enviando..." : form.videoUrl ? "Trocar vídeo" : "Enviar vídeo"}
                </Button>
                {form.videoUrl && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setForm((prev) => ({ ...prev, videoUrl: "" }))}
                  >
                    Remover
                  </Button>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                MP4, até 15MB. Toca em loop, mudo e sem controles. Se o vídeo não carregar, a imagem
                abaixo aparece no lugar.
              </p>
            </div>

            {/* Imagem */}
            <div className="space-y-2">
              <Label>{form.videoUrl ? "Imagem de fallback" : "Imagem de fundo"}</Label>
              <div className="aspect-[21/9] w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/40">
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
                ref={imageInputRef}
                type="file"
                accept="image/webp,image/png,image/jpeg"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) handleUpload(file, "image")
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full gap-2"
                disabled={uploading !== null}
                onClick={() => imageInputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                {uploading === "image" ? "Enviando..." : form.imageUrl ? "Trocar imagem" : "Enviar imagem"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                {form.videoUrl
                  ? "Usada como pôster do vídeo e como fallback se ele falhar."
                  : "Obrigatória se não houver vídeo. Recomendado 2100×700px (21:7)."}
              </p>
            </div>

            {/* Título e subtítulo */}
            <div className="space-y-2">
              <Label htmlFor="banner-title">Título</Label>
              <Input
                id="banner-title"
                placeholder="Ex.: Teclados mecânicos até 30% off"
                maxLength={120}
                value={form.title}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="banner-subtitle">Subtítulo — opcional</Label>
              <Input
                id="banner-subtitle"
                placeholder="Ex.: Só até domingo, unidades limitadas"
                maxLength={200}
                value={form.subtitle}
                onChange={(event) => setForm((prev) => ({ ...prev, subtitle: event.target.value }))}
              />
            </div>

            {/* CTA */}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="banner-cta-text">Texto do botão</Label>
                <Input
                  id="banner-cta-text"
                  placeholder="Compre agora"
                  maxLength={40}
                  value={form.ctaText}
                  onChange={(event) => setForm((prev) => ({ ...prev, ctaText: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="banner-cta-link">Link do botão</Label>
                <Input
                  id="banner-cta-link"
                  placeholder="/loja/produto/slug"
                  value={form.ctaLink}
                  onChange={(event) => setForm((prev) => ({ ...prev, ctaLink: event.target.value }))}
                />
              </div>
            </div>
            <p className="-mt-2 text-[11px] text-muted-foreground">
              {BANNER_LINK_HINT} O botão só aparece se tiver texto e link.
            </p>

            {/* Ativo */}
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Banner ativo</p>
                <p className="text-[11px] text-muted-foreground">
                  Libera o banner para o carrossel da seção.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                aria-label="Banner ativo"
                onClick={() => setForm((prev) => ({ ...prev, isActive: !prev.isActive }))}
                className={cn(
                  "relative h-6 w-11 shrink-0 rounded-full transition-colors",
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
              disabled={saving || uploading !== null || (!form.imageUrl && !form.videoUrl)}
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
              O banner sai do carrossel imediatamente e a mídia é apagada do storage se nenhum outro
              banner usar o mesmo arquivo. Esta ação não pode ser desfeita.
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
