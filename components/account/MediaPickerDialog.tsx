"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { DragEvent } from "react"
import { Crown, ImageIcon, Loader2, Search, Sparkles, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { searchGifs, triggerShare, type KlipyGif } from "@/lib/klipy"
import { cn } from "@/lib/utils"

/** Espera o usuário parar de digitar antes de bater no KLIPY. */
const SEARCH_DEBOUNCE_MS = 350

/** Quantos px antes do fim da lista o scroll dispara a próxima página. */
const INFINITE_SCROLL_MARGIN = 240

type Tab = "upload" | "gif"

export interface MediaPickerDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Título do modal — "Foto de perfil", "Banner do perfil", etc. */
  title: string
  description?: string
  /** `accept` do input de arquivo, já filtrado por tier (GIF só pra VIP). */
  accept: string
  /** Se a aba de GIF aparece — mídia animada é benefício VIP. */
  allowGif: boolean
  /** Arquivo escolhido do computador (arrastado ou pelo seletor). */
  onPickFile: (file: File) => void
  /** GIF escolhido no KLIPY — quem recebe manda a URL pro servidor importar. */
  onPickGif: (gif: KlipyGif) => void
  /** Trava tudo enquanto o envio anterior não terminou. */
  busy?: boolean
}

/**
 * Seletor de mídia do perfil: arrastar-e-soltar, escolher do computador ou
 * pegar um GIF direto do KLIPY, tudo num modal só.
 *
 * Substitui os `<input type="file">` escondidos atrás do ícone de câmera —
 * que só ofereciam o explorador de arquivos e não davam nenhuma pista de que
 * GIF era uma opção. As duas abas terminam no mesmo lugar (uma URL pública no
 * nosso bucket), mas por caminhos diferentes: arquivo local sobe por signed
 * URL do navegador, GIF do KLIPY é baixado pelo servidor
 * (`importProfileMediaFromKlipy`) — ver `components/account/ProfileSection`.
 *
 * A grade de GIF é a mesma do seletor do fórum (`components/comments/GifPicker`):
 * chamada client-side direta ao KLIPY, `<img>` cru nas miniaturas, ping de
 * `share` no clique. O que muda é só o entorno — modal com abas em vez de
 * popover.
 */
export function MediaPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  accept,
  allowGif,
  onPickFile,
  onPickGif,
  busy = false,
}: MediaPickerDialogProps) {
  const [tab, setTab] = useState<Tab>("upload")
  const [dragging, setDragging] = useState(false)
  const [fileError, setFileError] = useState<string | null>(null)

  /**
   * Cada abertura começa limpa e na aba de upload — é o caminho mais comum, e
   * a aba de GIF pode nem existir se o tier perder o benefício. O reset mora
   * aqui (e não num efeito de `open`) porque é consequência da ação de
   * fechar/abrir, não sincronização com sistema externo.
   */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setTab("upload")
      setDragging(false)
      setFileError(null)
    }
    onOpenChange(next)
  }

  /** Aceita o arquivo só se o tipo estiver no `accept` — o mesmo filtro que o
      explorador aplicaria, que o arrastar-e-soltar ignora. */
  function handleFile(file: File | undefined) {
    if (!file) return
    const allowed = accept.split(",").map((t) => t.trim())
    if (!allowed.includes(file.type)) {
      setFileError(
        file.type === "image/gif"
          ? "GIF no perfil é exclusivo para membros VIP."
          : "Formato não suportado. Use JPG, PNG ou WebP."
      )
      return
    }
    setFileError(null)
    onPickFile(file)
    handleOpenChange(false)
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    event.preventDefault()
    setDragging(false)
    if (busy) return
    handleFile(event.dataTransfer.files?.[0])
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        {allowGif && (
          <div className="flex gap-1 rounded-lg border border-border bg-muted/20 p-1">
            <TabButton active={tab === "upload"} onClick={() => setTab("upload")} icon={Upload}>
              Do computador
            </TabButton>
            <TabButton active={tab === "gif"} onClick={() => setTab("gif")} icon={Sparkles}>
              GIF
            </TabButton>
          </div>
        )}

        {tab === "upload" || !allowGif ? (
          <div className="space-y-2">
            <label
              onDragOver={(e) => {
                e.preventDefault()
                if (!busy) setDragging(true)
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
                dragging
                  ? "border-primary bg-primary/10"
                  : "border-border bg-muted/10 hover:border-primary/50 hover:bg-muted/20",
                busy && "pointer-events-none opacity-60"
              )}
            >
              <input
                type="file"
                accept={accept}
                className="hidden"
                disabled={busy}
                onChange={(e) => {
                  handleFile(e.target.files?.[0])
                  // Permite reescolher o mesmo arquivo depois de um erro.
                  e.target.value = ""
                }}
              />
              <div
                className={cn(
                  "flex size-12 items-center justify-center rounded-full transition-colors",
                  dragging ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"
                )}
              >
                {busy ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <ImageIcon className="size-5" />
                )}
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold text-foreground">
                  {dragging
                    ? "Solte para enviar"
                    : allowGif
                      ? "Arraste uma imagem ou GIF"
                      : "Arraste uma imagem"}
                </p>
                <p className="text-xs text-muted-foreground">
                  ou{" "}
                  <span className="font-medium text-primary underline underline-offset-2">
                    escolha do computador
                  </span>
                </p>
              </div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/60">
                {allowGif ? "JPG · PNG · WebP · GIF" : "JPG · PNG · WebP"}
              </p>
            </label>

            {fileError && <p className="text-xs text-red-400">{fileError}</p>}

            {!allowGif && (
              <p className="flex items-center justify-center gap-1.5 rounded-lg border border-border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
                <Crown className="size-3 shrink-0" style={{ color: "var(--vip-accent)" }} />
                GIF animado no perfil é um benefício VIP.
              </p>
            )}
          </div>
        ) : (
          <GifTab
            busy={busy}
            onPick={(gif) => {
              onPickGif(gif)
              handleOpenChange(false)
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
}: {
  active: boolean
  onClick: () => void
  icon: typeof Upload
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      <Icon className="size-3.5" />
      {children}
    </button>
  )
}

/**
 * Aba de GIF: busca no KLIPY com scroll infinito. Mesma mecânica de
 * `components/comments/GifPicker` (corrida de requisições resolvida por
 * `requestIdRef` + `AbortController`), num layout de modal.
 */
function GifTab({ busy, onPick }: { busy: boolean; onPick: (gif: KlipyGif) => void }) {
  const [query, setQuery] = useState("")
  const [gifs, setGifs] = useState<KlipyGif[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pickingId, setPickingId] = useState<string | null>(null)

  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeQueryRef = useRef("")

  const runSearch = useCallback(async (term: string, targetPage: number) => {
    const requestId = ++requestIdRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const append = targetPage > 1
    if (append) setLoadingMore(true)
    else setLoading(true)
    setError(null)

    try {
      const data = await searchGifs(term, targetPage, controller.signal)
      if (requestId !== requestIdRef.current) return

      setGifs((prev) => (append ? [...prev, ...data.gifs] : data.gifs))
      setHasMore(data.hasMore)
      setPage(targetPage)
      activeQueryRef.current = term
    } catch (err) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      setError(
        err instanceof Error && err.message.startsWith("NEXT_PUBLIC_KLIPY")
          ? "Busca de GIF indisponível."
          : "Não foi possível carregar os GIFs agora."
      )
      if (!append) {
        setGifs([])
        setHasMore(false)
      }
    } finally {
      if (requestId !== requestIdRef.current) return
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    const term = query.trim()
    const timer = setTimeout(() => runSearch(term, 1), term ? SEARCH_DEBOUNCE_MS : 0)
    return () => clearTimeout(timer)
  }, [query, runSearch])

  useEffect(() => () => abortRef.current?.abort(), [])

  function handleScroll() {
    const el = scrollRef.current
    if (!el || loading || loadingMore || !hasMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < INFINITE_SCROLL_MARGIN) {
      runSearch(activeQueryRef.current, page + 1)
    }
  }

  function pick(gif: KlipyGif) {
    setPickingId(gif.id)
    // Requisito do KLIPY: registrar o "share" quando o GIF é efetivamente usado.
    if (gif.slug) triggerShare(gif.slug, activeQueryRef.current)
    onPick(gif)
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search KLIPY"
          className="h-9 pl-8 text-sm"
        />
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-[320px] overflow-y-auto rounded-md"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
            <p className="text-xs text-destructive">{error}</p>
            <Button type="button" variant="outline" size="sm" onClick={() => runSearch(query.trim(), 1)}>
              Tentar de novo
            </Button>
          </div>
        ) : gifs.length === 0 ? (
          <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
            Nenhum GIF encontrado.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {gifs.map((gif) => (
                <button
                  key={gif.id}
                  type="button"
                  onClick={() => pick(gif)}
                  disabled={busy || pickingId !== null}
                  className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-primary disabled:opacity-60"
                >
                  {/* `<img>` cru: miniatura pequena de CDN externo, fora do
                      loader do Storage. `no-referrer` não vaza o path da página. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={gif.previewUrl}
                    alt={gif.title}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="size-full object-cover"
                  />
                  {pickingId === gif.id && (
                    <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="size-4 animate-spin text-primary" />
                    </span>
                  )}
                </button>
              ))}
            </div>
            {loadingMore && (
              <div className="flex justify-center py-3">
                <Loader2 className="size-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </>
        )}
      </div>

      <p className="text-center text-[10px] text-muted-foreground/60">GIFs por KLIPY</p>
    </div>
  )
}
