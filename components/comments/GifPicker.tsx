"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Loader2, Search, Sparkles } from "lucide-react"

import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { searchGifs, triggerShare, type KlipyGif } from "@/lib/klipy"

/** Espera o usuário parar de digitar antes de bater no KLIPY. */
const SEARCH_DEBOUNCE_MS = 350

/** Quantos px antes do fim da lista o scroll dispara a próxima página. */
const INFINITE_SCROLL_MARGIN = 240

/**
 * Seletor de GIF (KLIPY) num popover: campo de busca + grade de miniaturas com
 * scroll infinito. Clicar num GIF chama `onSelect(url)` — quem usa decide o que
 * fazer com a URL (anexar ao comentário, ao post, etc.) — e fecha o popover.
 *
 * Chama o KLIPY **direto do browser** (ver `lib/klipy.ts`): os requisitos de
 * integração deles proíbem proxy no servidor. Placeholder "Search KLIPY" e o
 * ping de `share` no clique também são requisitos.
 *
 * Sem estado global: cada instância busca sob demanda e some quando fecha. A
 * grade usa `<img>` cru (não `next/image`): são miniaturas pequenas de CDN
 * externo. `referrerPolicy="no-referrer"` pra não vazar o path da página.
 */
export function GifPicker({
  onSelect,
  disabled,
  triggerClassName,
  triggerLabel = "GIF",
}: {
  onSelect: (url: string) => void
  disabled?: boolean
  triggerClassName?: string
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [gifs, setGifs] = useState<KlipyGif[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Id do GIF sendo anexado — feedback visual entre o clique e o popover fechar.
  const [pickingId, setPickingId] = useState<string | null>(null)

  // Corrida: uma resposta lenta de uma busca antiga não pode sobrescrever a
  // grade de uma mais recente. `requestIdRef` descarta o resultado obsoleto;
  // `abortRef` corta a requisição na rede de verdade.
  const requestIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  // Termo que gerou a lista atual — vai no `share` trigger.
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

  // Primeira abertura carrega os GIFs em alta; toda mudança de busca (com
  // debounce) recarrega a partir da página 1.
  useEffect(() => {
    if (!open) return
    const term = query.trim()
    const timer = setTimeout(() => runSearch(term, 1), term ? SEARCH_DEBOUNCE_MS : 0)
    return () => clearTimeout(timer)
  }, [open, query, runSearch])

  // Corta qualquer requisição pendente ao desmontar.
  useEffect(() => () => abortRef.current?.abort(), [])

  function handleScroll() {
    const el = scrollRef.current
    if (!el || loading || loadingMore || !hasMore) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < INFINITE_SCROLL_MARGIN) {
      runSearch(activeQueryRef.current, page + 1)
    }
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) {
      abortRef.current?.abort()
      // Reseta pra próxima abertura começar limpa.
      setQuery("")
      setGifs([])
      setPage(1)
      setHasMore(false)
      setError(null)
      setPickingId(null)
      activeQueryRef.current = ""
    }
  }

  function pick(gif: KlipyGif) {
    setPickingId(gif.id)
    // Requisito do KLIPY: registrar o "share" quando o GIF é efetivamente usado.
    if (gif.slug) triggerShare(gif.slug, activeQueryRef.current)
    onSelect(gif.url)
    handleOpenChange(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={
            triggerClassName ??
            "flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-primary disabled:opacity-60"
          }
        >
          <Sparkles className="size-3.5" />
          {triggerLabel}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-3 sm:w-[360px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search KLIPY"
            className="h-8 pl-8 text-sm"
          />
        </div>

        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="mt-2 h-[280px] overflow-y-auto rounded-md"
        >
          {loading ? (
            <div className="flex h-full items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-xs text-destructive">{error}</p>
              <button
                type="button"
                onClick={() => runSearch(query.trim(), 1)}
                className="text-xs font-medium text-primary hover:underline"
              >
                Tentar de novo
              </button>
            </div>
          ) : gifs.length === 0 ? (
            <p className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              Nenhum GIF encontrado.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {gifs.map((gif) => (
                  <button
                    key={gif.id}
                    type="button"
                    onClick={() => pick(gif)}
                    disabled={pickingId !== null}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted transition-colors hover:border-primary disabled:opacity-60"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={gif.previewUrl}
                      alt={gif.title}
                      loading="lazy"
                      decoding="async"
                      referrerPolicy="no-referrer"
                      className="size-full object-cover"
                    />
                    {pickingId === gif.id && (
                      <span className="absolute inset-0 flex items-center justify-center bg-background/60">
                        <Loader2 className="size-4 animate-spin text-foreground" />
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {loadingMore && (
                <div className="mt-2 flex justify-center py-1">
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </>
          )}
        </div>

        <p className="mt-2 text-center text-[10px] text-muted-foreground">Powered by KLIPY</p>
      </PopoverContent>
    </Popover>
  )
}
