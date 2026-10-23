"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AlertCircle,
  CalendarClock,
  Eye,
  EyeOff,
  GripVertical,
  ImagePlus,
  Maximize2,
  MousePointerClick,
  PanelTop,
  Pencil,
  Plus,
  ShoppingBag,
  Smartphone,
  Tag,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"

import { StoreProductPicker } from "@/components/admin/StoreProductPicker"
import { StoreHeroSealsEditor } from "@/components/admin/store/StoreHeroSealsEditor"
import { usePageHeader } from "@/components/providers/page-header-context"
import { StoreHero } from "@/components/store/StoreHero"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { SunanoLoader } from "@/components/ui/SunanoLoader"
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
import { MediaViewer } from "@/components/ui/media-viewer"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { BANNER_LINK_HINT, isValidBannerLink } from "@/lib/banner-link"
import {
  formatBytes,
  formatEta,
  UploadAbortedError,
  UploadError,
  uploadWithProgress,
  type UploadProgress,
} from "@/lib/client/upload-with-progress"
import { formatShortDateTime, fromLocalInput, toLocalInput } from "@/lib/datetime-local"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"
import {
  buildHeroView,
  HERO_CTA_PRESETS,
  HERO_CTA_TEXT_MAX,
  HERO_HIGHLIGHT_LABEL,
  HERO_HIGHLIGHT_LABEL_MAX,
  HERO_STATUS_LABEL,
  HERO_SUBTITLE_MAX,
  HERO_TITLE_MAX,
  heroSlideStatus,
  isStoreHeroVideoUrl,
  STORE_HERO_HIGHLIGHTS,
  STORE_HERO_VIDEO_MAX_BYTES,
  type AdminStoreHeroSlide,
  type StoreHeroHighlightKind,
  type StoreHeroStatus,
} from "@/lib/store-hero"
import { formatUploadLimit } from "@/lib/upload-limits"
import { cn } from "@/lib/utils"

type FormState = {
  highlight: StoreHeroHighlightKind | null
  highlightLabel: string
  title: string
  subtitle: string
  imageDesktopUrl: string
  imageMobileUrl: string
  product: StoreProductCard | null
  primaryCtaText: string
  primaryCtaLink: string
  secondaryCtaText: string
  secondaryCtaLink: string
  startsAt: string
  endsAt: string
  isActive: boolean
}

const EMPTY_FORM: FormState = {
  highlight: null,
  highlightLabel: "",
  title: "",
  subtitle: "",
  imageDesktopUrl: "",
  imageMobileUrl: "",
  product: null,
  primaryCtaText: "",
  primaryCtaLink: "",
  secondaryCtaText: "",
  secondaryCtaLink: "",
  startsAt: "",
  endsAt: "",
  isActive: true,
}

const STATUS_CLASS: Record<StoreHeroStatus, string> = {
  live: "bg-emerald-500/10 text-emerald-400",
  scheduled: "bg-blue-500/10 text-blue-400",
  ended: "bg-amber-500/10 text-amber-400",
  inactive: "bg-slate-500/10 text-muted-foreground",
}

function statusHint(slide: AdminStoreHeroSlide, status: StoreHeroStatus): string | null {
  if (status === "scheduled" && slide.startsAt) return `a partir de ${formatShortDateTime(slide.startsAt)}`
  if (status === "ended" && slide.endsAt) return `em ${formatShortDateTime(slide.endsAt)}`
  if (status === "live" && slide.endsAt) return `até ${formatShortDateTime(slide.endsAt)}`
  return null
}

/** Tipos que os campos de arte aceitam, no seletor de arquivo e ao soltar. */
const MEDIA_ACCEPT = ["image/webp", "image/png", "image/jpeg", "video/mp4", "video/quicktime"]

/**
 * Arrastar e soltar arquivo de arte. Mesmo comportamento nos campos de
 * desktop/mobile e na prévia grande, que recebe a arte de desktop.
 */
function useMediaDrop(disabled: boolean, onFile: (file: File) => void) {
  const [dragOver, setDragOver] = useState(false)

  const handlers = {
    onDragOver(event: React.DragEvent<HTMLDivElement>) {
      if (disabled || !event.dataTransfer.types.includes("Files")) return
      event.preventDefault()
      event.dataTransfer.dropEffect = "copy"
      setDragOver(true)
    },
    onDragLeave(event: React.DragEvent<HTMLDivElement>) {
      // Sair para um filho (o <img>, o texto) também dispara dragleave.
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragOver(false)
    },
    onDrop(event: React.DragEvent<HTMLDivElement>) {
      event.preventDefault()
      setDragOver(false)
      if (disabled) return
      const file = event.dataTransfer.files?.[0]
      if (!file) return
      if (!MEDIA_ACCEPT.includes(file.type)) {
        toast.error("Formato não aceito", { description: "Envie WebP, PNG, JPG, MP4 ou MOV" })
        return
      }
      onFile(file)
    },
  }

  return { dragOver, handlers }
}

function DropOverlay({ label }: { label: string }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 bg-black/60 text-white">
      <Upload className="size-5" />
      <span className="text-[11px] font-semibold">{label}</span>
    </div>
  )
}

type UploadPhase = "preparing" | "sending" | "processing"

/** Envio em andamento: qual campo, o arquivo local (para a prévia) e onde ele está. */
type UploadState = {
  kind: "desktop" | "mobile"
  isVideo: boolean
  /** `blob:` do arquivo local, mostrado enquanto sobe. */
  localUrl: string
  phase: UploadPhase
  progress: UploadProgress | null
}

function phaseLabel(state: UploadState): string {
  if (state.phase === "preparing") return "Preparando o envio"
  if (state.phase === "processing") return state.isVideo ? "Conferindo o vídeo" : "Otimizando a imagem"
  return state.isVideo ? "Enviando o vídeo" : "Enviando a imagem"
}

/**
 * O arquivo sobe por cima da própria prévia: a versão local aparece em preto
 * e branco e ganha cor da esquerda para a direita conforme os bytes saem. A
 * fronteira da cor É a barra de progresso, e o número embaixo diz quanto
 * falta em MB e em tempo. Nas fases sem byte para contar (gerar a URL,
 * conferir/otimizar no servidor) a barra vira um brilho correndo, em vez de
 * fingir um percentual.
 */
function UploadOverlay({ state, compact, onCancel }: { state: UploadState; compact?: boolean; onCancel: () => void }) {
  const sending = state.phase === "sending"
  const fraction = state.phase === "processing" ? 1 : sending ? (state.progress?.fraction ?? 0) : 0
  const percent = Math.floor(fraction * 100)
  const progress = state.progress
  const clip = `inset(0 ${(1 - fraction) * 100}% 0 0)`

  const media = (className: string, style?: React.CSSProperties) =>
    state.isVideo ? (
      <video src={state.localUrl} muted loop autoPlay playsInline className={className} style={style} />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={state.localUrl} alt="" className={className} style={style} />
    )

  return (
    <div className="absolute inset-0 z-20 overflow-hidden bg-black" role="status" aria-live="polite">
      {media("absolute inset-0 size-full object-cover opacity-35 grayscale")}
      {media("absolute inset-0 size-full object-cover transition-[clip-path] duration-300 ease-out", { clipPath: clip })}
      {/* Fio de luz na fronteira entre o que já subiu e o que falta. */}
      {sending && fraction > 0 && fraction < 1 && (
        <div
          className="absolute inset-y-0 w-px bg-white/80 shadow-[0_0_12px_2px_rgba(255,255,255,0.6)] transition-[left] duration-300 ease-out"
          style={{ left: `${fraction * 100}%` }}
        />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/40 to-black/20" />

      <button
        type="button"
        onClick={onCancel}
        aria-label="Cancelar envio"
        className="absolute right-1.5 top-1.5 z-10 flex size-6 items-center justify-center rounded-full bg-black/60 text-white/80 transition-colors hover:bg-black/80 hover:text-white"
      >
        <X className="size-3.5" />
      </button>

      <div className={cn("absolute inset-x-0 bottom-0 text-white", compact ? "space-y-1.5 p-2" : "space-y-2 p-4")}>
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <p className={cn("font-semibold text-white/80", compact ? "text-[10px]" : "text-xs")}>{phaseLabel(state)}</p>
            {sending && progress && progress.total > 0 && (
              <p className={cn("tabular-nums text-white/60", compact ? "text-[10px]" : "text-[11px]")}>
                {formatBytes(progress.loaded)} de {formatBytes(progress.total)}
                {!compact && progress.bytesPerSecond ? ` · ${formatBytes(progress.bytesPerSecond)}/s` : ""}
              </p>
            )}
          </div>
          {sending && (
            <span className={cn("font-bold tabular-nums leading-none", compact ? "text-lg" : "text-3xl")}>
              {percent}
              <span className="text-[0.55em] font-semibold text-white/70">%</span>
            </span>
          )}
        </div>

        <div className="relative h-1 overflow-hidden rounded-full bg-white/15">
          {sending ? (
            <div
              className="h-full rounded-full bg-white transition-[width] duration-300 ease-out"
              style={{ width: `${fraction * 100}%` }}
            />
          ) : (
            <div className="absolute inset-y-0 w-1/3 animate-[upload-shimmer_1.1s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-transparent via-white to-transparent" />
          )}
        </div>

        {sending && (
          <p className={cn("tabular-nums text-white/60", compact ? "text-[10px]" : "text-[11px]")}>
            {progress?.etaSeconds != null ? formatEta(progress.etaSeconds) : "Calculando o tempo..."}
          </p>
        )}
      </div>
      <style>{`@keyframes upload-shimmer { 0% { left: -33% } 100% { left: 100% } }`}</style>
    </div>
  )
}

/** Largura em que a prévia é desenhada antes de ser reduzida: a de um desktop comum. */
const PREVIEW_WIDTH = 1280

/**
 * Prévia do slide como a vitrine desenha no desktop, reduzida para caber no
 * editor. É o próprio componente da Loja, não uma imitação: o que aparece
 * aqui é o que vai ao ar.
 */
function HeroPreview({
  form,
  now,
  upload,
  disabled,
  onDropDesktop,
  onCancelUpload,
}: {
  form: FormState
  now: number
  /** Envio da arte de desktop em andamento, desenhado por cima da prévia. */
  upload: UploadState | null
  disabled: boolean
  onDropDesktop: (file: File) => void
  onCancelUpload: () => void
}) {
  const { dragOver, handlers } = useMediaDrop(disabled, onDropDesktop)
  const frameRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.5)
  const [contentHeight, setContentHeight] = useState(400)

  // Prazo vencido não some da prévia (a vitrine tiraria o slide do ar): aqui
  // o admin quer ver a arte, não a regra de agendamento.
  const endsAt = fromLocalInput(form.endsAt)
  const view = buildHeroView(
    {
      id: "preview",
      title: form.title.trim() || "Título do slide",
      subtitle: form.subtitle.trim() || null,
      imageDesktopUrl: form.imageDesktopUrl || null,
      imageMobileUrl: form.imageMobileUrl || null,
      primaryCtaText: form.primaryCtaText.trim() || null,
      primaryCtaLink: form.primaryCtaLink.trim() || null,
      secondaryCtaText: form.secondaryCtaText.trim() || null,
      secondaryCtaLink: form.secondaryCtaLink.trim() || null,
      highlight: form.highlight,
      highlightLabel: form.highlightLabel.trim() || null,
      endsAt: endsAt && Date.parse(endsAt) > now ? endsAt : null,
    },
    form.product
  )
  const hasView = view !== null

  // Religa ao trocar de placeholder para Hero: o elemento medido é outro.
  useEffect(() => {
    const frame = frameRef.current
    const content = contentRef.current
    if (!frame || !content) return
    const observer = new ResizeObserver(() => {
      setScale(frame.clientWidth / PREVIEW_WIDTH)
      setContentHeight(content.offsetHeight)
    })
    observer.observe(frame)
    observer.observe(content)
    return () => observer.disconnect()
  }, [hasView])

  return (
    <div
      ref={frameRef}
      {...handlers}
      className={cn(
        "relative w-full overflow-hidden rounded-lg border border-border bg-[#0b0f14] transition-colors",
        dragOver && "border-foreground/60"
      )}
      style={{ height: hasView ? contentHeight * scale : undefined }}
    >
      {view ? (
        <div
          ref={contentRef}
          inert
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width: PREVIEW_WIDTH, transform: `scale(${scale})` }}
        >
          <StoreHero slides={[view]} />
        </div>
      ) : (
        <div ref={contentRef} className="flex aspect-[16/5] flex-col items-center justify-center gap-1.5 text-muted-foreground">
          <ImagePlus className="size-6" />
          <span className="text-xs">
            Arraste a imagem ou o vídeo de desktop para cá, ou escolha um produto, para ver a prévia
          </span>
        </div>
      )}
      {upload && <UploadOverlay state={upload} onCancel={onCancelUpload} />}
      {dragOver && (
        <DropOverlay label={form.imageDesktopUrl ? "Solte para trocar a arte de desktop" : "Solte para usar como arte de desktop"} />
      )}
    </div>
  )
}

function ImageField({
  label,
  hint,
  icon: Icon,
  value,
  aspectClassName,
  upload,
  disabled,
  onUpload,
  onCancelUpload,
  onClear,
}: {
  label: string
  hint: string
  icon: typeof ImagePlus
  value: string
  aspectClassName: string
  /** Envio deste campo em andamento. */
  upload: UploadState | null
  disabled: boolean
  onUpload: (file: File) => void
  onCancelUpload: () => void
  onClear: () => void
}) {
  const uploading = upload !== null
  const inputRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState(false)
  const isVideo = isStoreHeroVideoUrl(value)
  const { dragOver, handlers } = useMediaDrop(disabled, onUpload)

  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <Icon className="size-3.5" />
        {label}
      </Label>
      <div
        {...handlers}
        className={cn(
          "group relative w-full overflow-hidden rounded-lg border border-dashed border-border bg-muted/40 transition-colors",
          dragOver && "border-solid border-foreground/60 bg-muted",
          aspectClassName
        )}
      >
        {value ? (
          <button
            type="button"
            aria-label={isVideo ? "Ver vídeo em tela cheia" : "Ver imagem em tela cheia"}
            onClick={() => setViewing(true)}
            className="block size-full cursor-zoom-in"
          >
            {isVideo ? (
              <video src={value} muted loop autoPlay playsInline className="size-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="" className="size-full object-cover" />
            )}
            <span className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100">
              <Maximize2 className="size-3" />
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex size-full flex-col items-center justify-center gap-1 px-2 text-center text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none"
          >
            <ImagePlus className="size-5" />
            <span className="text-[11px]">Arraste ou clique para enviar imagem ou vídeo</span>
          </button>
        )}
        {upload && <UploadOverlay state={upload} compact onCancel={onCancelUpload} />}
        {dragOver && <DropOverlay label={value ? "Solte para trocar" : "Solte para enviar"} />}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={MEDIA_ACCEPT.join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) onUpload(file)
          event.target.value = ""
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1 gap-2"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          {uploading ? `Enviando ${Math.floor((upload.progress?.fraction ?? 0) * 100)}%` : value ? "Trocar" : "Enviar"}
        </Button>
        {value && (
          <Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={onClear}>
            Remover
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>

      {value && !isVideo && (
        <MediaViewer
          items={[{ src: value, alt: label, unoptimized: true }]}
          open={viewing}
          onOpenChange={setViewing}
        />
      )}
      {value && isVideo && (
        <Dialog open={viewing} onOpenChange={setViewing}>
          <DialogContent className="border border-border bg-black p-0 sm:max-w-4xl">
            <DialogTitle className="sr-only">{label}</DialogTitle>
            <video src={value} controls autoPlay muted loop playsInline className="max-h-[80vh] w-full rounded-lg" />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function CtaFields({
  idPrefix,
  title,
  text,
  link,
  linkPlaceholder,
  linkHint,
  hasProduct,
  onChange,
}: {
  idPrefix: string
  title: string
  text: string
  link: string
  linkPlaceholder: string
  linkHint: string
  hasProduct: boolean
  onChange: (patch: { text?: string; link?: string }) => void
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-1.5">
        <MousePointerClick className="size-3.5" />
        {title}
      </Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Input
          id={`${idPrefix}-text`}
          aria-label={`${title}: texto`}
          placeholder="Texto do botão"
          maxLength={HERO_CTA_TEXT_MAX}
          value={text}
          onChange={(event) => onChange({ text: event.target.value })}
        />
        <Input
          id={`${idPrefix}-link`}
          aria-label={`${title}: link`}
          placeholder={linkPlaceholder}
          value={link}
          onChange={(event) => onChange({ link: event.target.value })}
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {HERO_CTA_PRESETS.filter((preset) => preset.link !== "product" || hasProduct).map((preset) => (
          <button
            key={preset.text}
            type="button"
            onClick={() =>
              onChange({
                text: preset.text,
                ...(preset.link === "product" ? { link: "" } : preset.link ? { link: preset.link } : {}),
              })
            }
            className="rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            {preset.text}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">{linkHint}</p>
    </div>
  )
}

function SortableSlideRow({
  slide,
  position,
  now,
  onEdit,
  onToggle,
  onDelete,
  isBusy,
}: {
  slide: AdminStoreHeroSlide
  position: number
  now: number
  onEdit: (slide: AdminStoreHeroSlide) => void
  onToggle: (slide: AdminStoreHeroSlide) => void
  onDelete: (slide: AdminStoreHeroSlide) => void
  isBusy: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id })
  const status = heroSlideStatus(slide, now)
  const hint = statusHint(slide, status)
  const thumbnail = slide.imageDesktopUrl ?? slide.product?.images?.[0] ?? null

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors",
        isDragging && "z-10 border-primary/40 shadow-lg",
        status !== "live" && "opacity-70"
      )}
    >
      <button
        type="button"
        aria-label={`Reordenar slide ${position}`}
        className="cursor-grab touch-none rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">{position}</span>

      <div className="relative h-14 w-28 shrink-0 overflow-hidden rounded-lg bg-muted">
        {thumbnail && isStoreHeroVideoUrl(thumbnail) ? (
          // Sem tocar, o <video> mostra o 1º quadro, que em vídeo de campanha
          // quase sempre é preto (fade de entrada). `#t=1` posiciona em 1s.
          <video src={`${thumbnail}#t=1`} muted playsInline preload="metadata" className="size-full object-cover" />
        ) : thumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={thumbnail}
            alt=""
            className={cn("size-full", slide.imageDesktopUrl ? "object-cover" : "object-contain p-1")}
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <PanelTop className="size-4" />
          </div>
        )}
        {slide.imageMobileUrl && (
          <span
            className="absolute bottom-1 right-1 flex size-4 items-center justify-center rounded-full bg-black/60 text-white"
            title="Tem arte de celular"
          >
            <Smartphone className="size-2.5" />
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {slide.highlight && (
            <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
              {slide.highlightLabel ?? HERO_HIGHLIGHT_LABEL[slide.highlight]}
            </span>
          )}
          <p className="truncate text-sm font-medium text-foreground">{slide.title}</p>
          <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold", STATUS_CLASS[status])}>
            {HERO_STATUS_LABEL[status]}
            {hint && <span className="font-medium opacity-80"> · {hint}</span>}
          </span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          {slide.product ? (
            <>
              <ShoppingBag className="size-3 shrink-0" />
              <span className="truncate">{slide.product.name}</span>
              {!slide.product.is_active && <span className="shrink-0 font-semibold text-amber-400">(pausado)</span>}
            </>
          ) : (
            <span>Sem produto relacionado</span>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label={slide.isActive ? "Desativar slide" : "Ativar slide"}
          disabled={isBusy}
          onClick={() => onToggle(slide)}
        >
          {slide.isActive ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-muted-foreground hover:text-foreground"
          aria-label="Editar slide"
          disabled={isBusy}
          onClick={() => onEdit(slide)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-red-500/60 hover:text-red-400"
          aria-label="Remover slide"
          disabled={isBusy}
          onClick={() => onDelete(slide)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export default function AdminStoreHeroPage() {
  const [slides, setSlides] = useState<AdminStoreHeroSlide[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<AdminStoreHeroSlide | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [upload, setUpload] = useState<UploadState | null>(null)
  const uploadAbortRef = useRef<AbortController | null>(null)
  const uploading = upload?.kind ?? null
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<AdminStoreHeroSlide | null>(null)
  const [deleting, setDeleting] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  usePageHeader(
    "Hero da Loja",
    "Banner principal do topo de /loja: campanha, lançamento, produto ou oferta. Vários slides no ar viram carrossel; sem nenhum, a Loja mostra a arte padrão."
  )

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/store-hero")
      const data = (await res.json()) as { slides?: AdminStoreHeroSlide[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar os slides.")
      setSlides(data.slides ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar os slides."
      setError(message)
      toast.error("Erro ao carregar o Hero", { description: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  // Relógio do painel: "No ar"/"Agendado"/"Encerrado" mudam sozinhos com o
  // tempo, sem precisar recarregar a lista.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(timer)
  }, [])

  const liveCount = useMemo(
    () => slides.filter((slide) => heroSlideStatus(slide, now) === "live").length,
    [slides, now]
  )

  const patchForm = (patch: Partial<FormState>) => setForm((prev) => ({ ...prev, ...patch }))

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(slide: AdminStoreHeroSlide) {
    setEditing(slide)
    setForm({
      highlight: slide.highlight,
      highlightLabel: slide.highlightLabel ?? "",
      title: slide.title,
      subtitle: slide.subtitle ?? "",
      imageDesktopUrl: slide.imageDesktopUrl ?? "",
      imageMobileUrl: slide.imageMobileUrl ?? "",
      product: slide.product,
      primaryCtaText: slide.primaryCtaText ?? "",
      primaryCtaLink: slide.primaryCtaLink ?? "",
      secondaryCtaText: slide.secondaryCtaText ?? "",
      secondaryCtaLink: slide.secondaryCtaLink ?? "",
      startsAt: toLocalInput(slide.startsAt),
      endsAt: toLocalInput(slide.endsAt),
      isActive: slide.isActive,
    })
    setFormOpen(true)
  }

  /** Cancela com o usuário OU depois de `ms`: chamada ao nosso servidor não pode prender a tela. */
  const withTimeout = (signal: AbortSignal, ms: number) => AbortSignal.any([signal, AbortSignal.timeout(ms)])

  const patchUpload = (patch: Partial<UploadState>) => setUpload((prev) => (prev ? { ...prev, ...patch } : prev))

  function cancelUpload() {
    uploadAbortRef.current?.abort()
  }

  /**
   * Vídeo vai do navegador direto para o Storage por signed URL (a Vercel
   * corta o corpo em ~4.5MB); a rota gera a URL e depois confere o que chegou.
   * Ver /api/admin/store-hero/upload-video.
   *
   * Corpo cru com `content-type: video/mp4`, e não o `uploadToSignedUrl` do
   * supabase-js: com um `File` ele monta multipart e ignora o `contentType`
   * pedido, então um .mov chegava como `video/quicktime` e o bucket (que só
   * libera `video/mp4`) recusava.
   */
  async function uploadVideo(file: File, signal: AbortSignal): Promise<string> {
    if (file.size > STORE_HERO_VIDEO_MAX_BYTES) {
      throw new Error(`O vídeo deve ter no máximo ${formatUploadLimit(STORE_HERO_VIDEO_MAX_BYTES)}`)
    }
    const startRes = await fetch("/api/admin/store-hero/upload-video", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contentType: file.type, sizeBytes: file.size }),
      signal: withTimeout(signal, 30_000),
    })
    const start = (await startRes.json().catch(() => null)) as { path?: string; signedUrl?: string; error?: string } | null
    if (!startRes.ok || !start?.path || !start.signedUrl) throw new Error(start?.error ?? "Erro ao iniciar o envio")

    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? ""
    patchUpload({ phase: "sending" })
    try {
      await uploadWithProgress({
        method: "PUT",
        url: start.signedUrl,
        body: file,
        headers: {
          "content-type": "video/mp4",
          "cache-control": "max-age=31536000",
          "x-upsert": "false",
          apikey: anonKey,
          authorization: `Bearer ${anonKey}`,
        },
        signal,
        onProgress: (progress) => patchUpload({ progress }),
        onUploaded: () => patchUpload({ phase: "processing" }),
      })
    } catch (err) {
      if (err instanceof UploadError && (err.status === 413 || /maximum allowed size/i.test(err.message))) {
        throw new Error(
          "O Storage recusou pelo tamanho. Confira o limite global de upload em Supabase → Storage → Settings"
        )
      }
      throw err
    }

    patchUpload({ phase: "processing" })
    let finishRes: Response
    try {
      finishRes = await fetch("/api/admin/store-hero/upload-video", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: start.path }),
        signal: withTimeout(signal, 30_000),
      })
    } catch (err) {
      if (signal.aborted) throw err
      throw new Error("A conferência do vídeo não respondeu. Tente de novo")
    }
    const finish = (await finishRes.json().catch(() => null)) as { publicUrl?: string; error?: string } | null
    if (!finishRes.ok || !finish?.publicUrl) throw new Error(finish?.error ?? "Erro ao confirmar o envio")
    return finish.publicUrl
  }

  /** Imagem passa pela rota (que recomprime); o progresso é o do envio até ela. */
  async function uploadImage(file: File, signal: AbortSignal): Promise<string> {
    const body = new FormData()
    body.append("file", file)
    patchUpload({ phase: "sending" })
    // Mesmo bucket e rota dos banners de seção da Loja.
    const data = await uploadWithProgress<{ publicUrl?: string; error?: string }>({
      method: "POST",
      url: "/api/admin/store-banners/upload-image",
      body,
      signal,
      onProgress: (progress) => patchUpload({ progress }),
      onUploaded: () => patchUpload({ phase: "processing" }),
    })
    if (!data?.publicUrl) throw new Error(data?.error ?? "Erro ao enviar a imagem")
    return data.publicUrl
  }

  async function handleUpload(file: File, kind: "desktop" | "mobile") {
    if (uploadAbortRef.current) return
    const isVideo = file.type.startsWith("video/")
    const controller = new AbortController()
    uploadAbortRef.current = controller
    const localUrl = URL.createObjectURL(file)
    setUpload({ kind, isVideo, localUrl, phase: "preparing", progress: null })

    try {
      const publicUrl = isVideo ? await uploadVideo(file, controller.signal) : await uploadImage(file, controller.signal)
      patchForm(kind === "desktop" ? { imageDesktopUrl: publicUrl } : { imageMobileUrl: publicUrl })
      toast.success(isVideo ? "Vídeo enviado" : "Imagem enviada")
    } catch (err) {
      const aborted = err instanceof UploadAbortedError || (err instanceof DOMException && err.name === "AbortError")
      if (aborted) {
        toast("Envio cancelado")
      } else {
        toast.error("Erro no upload", {
          description: err instanceof Error ? err.message : isVideo ? "Erro ao enviar o vídeo" : "Erro ao enviar a imagem",
        })
      }
    } finally {
      URL.revokeObjectURL(localUrl)
      uploadAbortRef.current = null
      setUpload(null)
    }
  }

  async function handleSave() {
    const title = form.title.trim()
    if (!title) {
      toast.error("Escreva o título do slide.")
      return
    }
    if (!form.imageDesktopUrl && !form.product) {
      toast.error("Envie a imagem ou o vídeo de desktop, ou escolha um produto relacionado.")
      return
    }
    for (const link of [form.primaryCtaLink.trim(), form.secondaryCtaLink.trim()]) {
      if (link && !isValidBannerLink(link)) {
        toast.error("Link inválido", { description: BANNER_LINK_HINT })
        return
      }
    }
    if (form.primaryCtaText.trim() && !form.primaryCtaLink.trim() && !form.product) {
      toast.error("O botão principal precisa de um link (ou de um produto relacionado).")
      return
    }
    if (form.secondaryCtaText.trim() && !form.secondaryCtaLink.trim()) {
      toast.error("O botão secundário precisa de um link.")
      return
    }
    const startsAt = fromLocalInput(form.startsAt)
    const endsAt = fromLocalInput(form.endsAt)
    if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) {
      toast.error("O fim da campanha precisa ser depois do início.")
      return
    }

    setSaving(true)
    try {
      const payload = {
        highlight: form.highlight,
        highlightLabel: form.highlight ? form.highlightLabel.trim() || null : null,
        title,
        subtitle: form.subtitle.trim() || null,
        imageDesktopUrl: form.imageDesktopUrl || null,
        imageMobileUrl: form.imageMobileUrl || null,
        productId: form.product?.id ?? null,
        primaryCtaText: form.primaryCtaText.trim() || null,
        primaryCtaLink: form.primaryCtaLink.trim() || null,
        secondaryCtaText: form.secondaryCtaText.trim() || null,
        secondaryCtaLink: form.secondaryCtaLink.trim() || null,
        startsAt,
        endsAt,
        isActive: form.isActive,
      }
      const res = await fetch(editing ? `/api/admin/store-hero/${editing.id}` : "/api/admin/store-hero", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao salvar o slide.")

      toast.success(editing ? "Slide atualizado" : "Slide criado")
      setFormOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      await load()
    } catch (err) {
      toast.error("Erro ao salvar", { description: err instanceof Error ? err.message : "Erro ao salvar o slide." })
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(slide: AdminStoreHeroSlide) {
    setBusy(true)
    const previous = slides
    setSlides((list) => list.map((item) => (item.id === slide.id ? { ...item, isActive: !item.isActive } : item)))
    try {
      const res = await fetch(`/api/admin/store-hero/${slide.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !slide.isActive }),
      })
      const data = (await res.json()) as { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao alterar o slide.")
    } catch (err) {
      setSlides(previous)
      toast.error("Não foi possível alterar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/store-hero/${deleteTarget.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Erro ao remover o slide.")
      }
      setSlides((list) => list.filter((item) => item.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success("Slide removido")
    } catch (err) {
      toast.error("Erro ao remover", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setDeleting(false)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = slides.findIndex((slide) => slide.id === active.id)
    const newIndex = slides.findIndex((slide) => slide.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const previous = slides
    const reordered = arrayMove(slides, oldIndex, newIndex)
    setSlides(reordered)

    try {
      const res = await fetch("/api/admin/store-hero/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((slide) => slide.id) }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Erro ao reordenar.")
      }
    } catch (err) {
      setSlides(previous)
      toast.error("Não foi possível reordenar", { description: err instanceof Error ? err.message : undefined })
    }
  }

  const hasProduct = Boolean(form.product)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {loading
            ? "Carregando…"
            : liveCount > 0
              ? `${liveCount} slide${liveCount === 1 ? "" : "s"} no ar agora. Arraste para mudar a ordem do carrossel.`
              : "Nenhum slide no ar: a Loja está mostrando a arte padrão."}
        </p>
        <Button className="gap-2" onClick={openCreate}>
          <Plus className="size-4" />
          Adicionar slide
        </Button>
      </div>

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <SunanoLoader />
        </div>
      ) : slides.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <PanelTop className="size-10 text-muted-foreground" />
          <div>
            <p className="text-sm text-muted-foreground">Nenhum slide cadastrado</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Sem slide no ar, o topo da Loja mostra a arte padrão de sempre.
            </p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={openCreate}>
            <Plus className="size-3.5" />
            Criar slide
          </Button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={slides.map((slide) => slide.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {slides.map((slide, index) => (
                <SortableSlideRow
                  key={slide.id}
                  slide={slide}
                  position={index + 1}
                  now={now}
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

      <StoreHeroSealsEditor />

      {/* Editor */}
      <Dialog
        open={formOpen}
        onOpenChange={(open) => {
          // Fechar o editor no meio do envio cancela: o arquivo não teria onde cair.
          if (!open) cancelUpload()
          setFormOpen(open)
        }}
      >
        <DialogContent className="max-h-[92vh] overflow-y-auto border border-border bg-card sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar slide" : "Novo slide"}</DialogTitle>
            <DialogDescription>Prévia de como o slide aparece no desktop.</DialogDescription>
          </DialogHeader>

          <HeroPreview
            form={form}
            now={now}
            upload={upload?.kind === "desktop" ? upload : null}
            disabled={uploading !== null}
            onDropDesktop={(file) => handleUpload(file, "desktop")}
            onCancelUpload={cancelUpload}
          />

          <div className="space-y-5">
            {/* Etiqueta */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Tag className="size-3.5" />
                O que este slide destaca
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {([null, ...STORE_HERO_HIGHLIGHTS] as const).map((kind) => {
                  const selected = form.highlight === kind
                  return (
                    <button
                      key={kind ?? "none"}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => patchForm({ highlight: kind })}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                        selected
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                      )}
                    >
                      {kind ? HERO_HIGHLIGHT_LABEL[kind] : "Sem etiqueta"}
                    </button>
                  )
                })}
              </div>
              {form.highlight && (
                <Input
                  aria-label="Texto da etiqueta"
                  placeholder={`Texto da etiqueta, opcional (vazio = "${HERO_HIGHLIGHT_LABEL[form.highlight]}")`}
                  maxLength={HERO_HIGHLIGHT_LABEL_MAX}
                  value={form.highlightLabel}
                  onChange={(event) => patchForm({ highlightLabel: event.target.value })}
                />
              )}
              <p className="text-[11px] text-muted-foreground">
                Aparece acima do título, com cor e ícone do tipo. Ex.: &ldquo;Black Week&rdquo; numa campanha,
                &ldquo;Só esta semana&rdquo; numa oferta.
              </p>
            </div>

            {/* Texto */}
            <div className="space-y-2">
              <Label htmlFor="hero-title">Título</Label>
              <Input
                id="hero-title"
                placeholder="Ex.: Beast X V2 chegou"
                maxLength={HERO_TITLE_MAX}
                value={form.title}
                onChange={(event) => patchForm({ title: event.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="hero-subtitle">Subtítulo curto, opcional</Label>
              <Textarea
                id="hero-subtitle"
                placeholder="Ex.: 49g, PAW3950 e 8K de polling. Lote limitado."
                maxLength={HERO_SUBTITLE_MAX}
                rows={2}
                value={form.subtitle}
                onChange={(event) => patchForm({ subtitle: event.target.value })}
              />
            </div>

            {/* Imagens */}
            <div className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
              <ImageField
                label="Imagem ou vídeo desktop"
                hint={`1920×600px (16:5). O texto fica à esquerda: deixe esse lado mais limpo. Vídeo: MP4 ou MOV mudo, em loop, até ${formatUploadLimit(STORE_HERO_VIDEO_MAX_BYTES)}. Opcional se houver produto.`}
                icon={ImagePlus}
                value={form.imageDesktopUrl}
                aspectClassName="aspect-[16/5]"
                upload={upload?.kind === "desktop" ? upload : null}
                disabled={uploading !== null}
                onCancelUpload={cancelUpload}
                onUpload={(file) => handleUpload(file, "desktop")}
                onClear={() => patchForm({ imageDesktopUrl: "" })}
              />
              <ImageField
                label="Imagem ou vídeo mobile, opcional"
                hint="1080×1440px (3:4). O texto ocupa os ~60% de baixo: deixe a arte no topo. Sem ela, o celular usa a de desktop."
                icon={Smartphone}
                value={form.imageMobileUrl}
                aspectClassName="aspect-[3/4] max-h-44 mx-auto max-w-[132px]"
                upload={upload?.kind === "mobile" ? upload : null}
                disabled={uploading !== null}
                onCancelUpload={cancelUpload}
                onUpload={(file) => handleUpload(file, "mobile")}
                onClear={() => patchForm({ imageMobileUrl: "" })}
              />
            </div>

            {/* Produto */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <ShoppingBag className="size-3.5" />
                Produto relacionado, opcional
              </Label>
              <StoreProductPicker value={form.product} onChange={(product) => patchForm({ product })} />
              <p className="text-[11px] text-muted-foreground">
                Aparece no slide com foto, preço e desconto, e vira o destino do botão principal quando o link dele
                fica vazio. Sem imagem de desktop, a foto do produto vira a arte do slide. Se o produto tiver
                periférico vinculado, o slide mostra a posição dele no ranking do Database.
              </p>
            </div>

            {/* Botões */}
            <CtaFields
              idPrefix="hero-primary"
              title="Botão principal"
              text={form.primaryCtaText}
              link={form.primaryCtaLink}
              linkPlaceholder={hasProduct ? "Vazio = página do produto" : "/loja?ofertas=1#produtos"}
              linkHint={`${BANNER_LINK_HINT} ${hasProduct ? "Com produto e sem texto, o botão vira \"Ver produto\"." : ""}`}
              hasProduct={hasProduct}
              onChange={({ text, link }) =>
                patchForm({
                  ...(text !== undefined ? { primaryCtaText: text } : {}),
                  ...(link !== undefined ? { primaryCtaLink: link } : {}),
                })
              }
            />
            <CtaFields
              idPrefix="hero-secondary"
              title="Botão secundário, opcional"
              text={form.secondaryCtaText}
              link={form.secondaryCtaLink}
              linkPlaceholder="/tierlist"
              linkHint="Só aparece com texto e link."
              hasProduct={false}
              onChange={({ text, link }) =>
                patchForm({
                  ...(text !== undefined ? { secondaryCtaText: text } : {}),
                  ...(link !== undefined ? { secondaryCtaLink: link } : {}),
                })
              }
            />

            {/* Período */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <CalendarClock className="size-3.5" />
                Período da campanha, opcional
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="hero-starts" className="text-[11px] text-muted-foreground">
                    Entra no ar
                  </Label>
                  <Input
                    id="hero-starts"
                    type="datetime-local"
                    value={form.startsAt}
                    onChange={(event) => patchForm({ startsAt: event.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="hero-ends" className="text-[11px] text-muted-foreground">
                    Sai do ar
                  </Label>
                  <Input
                    id="hero-ends"
                    type="datetime-local"
                    value={form.endsAt}
                    onChange={(event) => patchForm({ endsAt: event.target.value })}
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Vazio = sem limite. Com fim definido, o slide mostra &ldquo;Termina em…&rdquo; e sai do ar sozinho
                na hora marcada.
              </p>
            </div>

            {/* Ativo */}
            <div className="flex items-start justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium text-foreground">Slide ativo</p>
                <p className="text-[11px] text-muted-foreground">
                  Desativado, o slide fica salvo aqui mas não aparece na Loja, mesmo dentro do período.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                aria-label="Slide ativo"
                onClick={() => patchForm({ isActive: !form.isActive })}
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
            <Button onClick={handleSave} disabled={saving || uploading !== null}>
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar slide"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remoção */}
      <Dialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Remover slide?</DialogTitle>
            <DialogDescription>
              O slide sai do Hero imediatamente e as imagens são apagadas do storage se nada mais usar os mesmos
              arquivos. Esta ação não pode ser desfeita.
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
