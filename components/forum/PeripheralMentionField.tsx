"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Image from "next/image"
import { Loader2, Plus, Tag, X } from "lucide-react"

import { getCategoryLabel } from "@/lib/store-category-icons"
import { buildPeripheralDisplayName } from "@/lib/peripheral-slug"
import { TIER_BASE_COLORS } from "@/lib/tierlist-theme"
import {
  MAX_PERIPHERAL_MENTIONS,
  deserializeMentionIndex,
  detectPeripherals,
  normalizeForMatch,
  type MentionIndex,
  type SerializedMentionIndex,
} from "@/lib/peripheral-mentions"
import { cn } from "@/lib/utils"

/**
 * "Live mode": detecta periféricos citados enquanto o usuário escreve o post.
 *
 * Tudo roda no cliente. O índice (~20 KB gzip) é baixado uma vez por sessão e
 * cada detecção custa ~0,2 ms, então não há fetch por tecla nem consulta ao
 * banco — diferente do `@` de menção de usuário, que precisa buscar perfis no
 * servidor porque a base de usuários não cabe no cliente.
 *
 * O que é detectado entra como chip já ativo; o usuário pode remover qualquer
 * um antes de publicar. Ao publicar, o servidor roda o MESMO detector sobre o
 * texto salvo e valida contra o catálogo — o que sai daqui é sugestão, nunca
 * a palavra final.
 */

const DEBOUNCE_MS = 300

export type MentionablePeripheral = {
  id: string
  name: string
  brand: string
  category: string
  tier: string | null
}

/** Cache por sessão: um único download do índice, compartilhado entre montagens. */
let indexPromise: Promise<{ index: MentionIndex; catalog: Map<string, MentionablePeripheral> }> | null = null

async function loadIndex() {
  if (!indexPromise) {
    indexPromise = (async () => {
      const [indexRes, catalogRes] = await Promise.all([
        fetch("/api/perifericos/mention-index"),
        fetch("/api/perifericos/mention-catalog"),
      ])
      const payload = (await indexRes.json()) as SerializedMentionIndex
      const catalogJson = (await catalogRes.json()) as { items: MentionablePeripheral[] }
      const catalog = new Map(catalogJson.items.map((item) => [item.id, item]))
      return { index: deserializeMentionIndex(payload), catalog }
    })().catch((error) => {
      // Deixa uma tentativa futura poder recarregar em vez de cravar o erro.
      indexPromise = null
      throw error
    })
  }
  return indexPromise
}

export function PeripheralMentionField({
  title,
  body,
  selectedIds,
  onChange,
}: {
  title: string
  body: string
  selectedIds: string[]
  onChange: (ids: string[]) => void
}) {
  const [data, setData] = useState<{ index: MentionIndex; catalog: Map<string, MentionablePeripheral> } | null>(null)
  const [loading, setLoading] = useState(true)
  const [detectedIds, setDetectedIds] = useState<string[]>([])
  const [query, setQuery] = useState("")
  const [showSearch, setShowSearch] = useState(false)
  /** Imagens buscadas sob demanda — só dos periféricos que viraram chip. */
  const [images, setImages] = useState<Record<string, string>>({})
  /** Detecções que o usuário removeu de propósito — não voltam ao redigitar. */
  const dismissedRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    let alive = true
    loadIndex()
      .then((loaded) => {
        if (alive) setData(loaded)
      })
      .catch(() => {
        // Sem índice o campo simplesmente não sugere nada; o servidor ainda
        // detecta ao publicar, então nada se perde de fato.
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  // Detecção com debounce sobre título + corpo.
  useEffect(() => {
    if (!data) return
    const timer = setTimeout(() => {
      const found = detectPeripherals(`${title}\n${body}`, data.index)
      setDetectedIds(found.map((m) => m.peripheralId))
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [title, body, data])

  // O que o detector achou e o usuário não descartou vira seleção automática.
  useEffect(() => {
    const fresh = detectedIds.filter(
      (id) => !dismissedRef.current.has(id) && !selectedIds.includes(id)
    )
    if (fresh.length === 0) return
    onChange([...selectedIds, ...fresh].slice(0, MAX_PERIPHERAL_MENTIONS))
    // `selectedIds`/`onChange` fora das deps de propósito: incluir os dois
    // faria o efeito rodar de novo a cada mudança da própria seleção.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedIds])

  const selected = useMemo(
    () => selectedIds.map((id) => data?.catalog.get(id)).filter((p): p is MentionablePeripheral => !!p),
    [selectedIds, data]
  )

  // Busca a imagem só de quem entrou num chip e ainda não tem uma.
  useEffect(() => {
    const missing = selectedIds.filter((id) => !(id in images))
    if (missing.length === 0) return
    const controller = new AbortController()
    fetch(`/api/perifericos/thumbs?ids=${missing.join(",")}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((payload: { images?: Record<string, string> }) => {
        // Marca os ausentes como "" para não repetir a busca de quem não tem imagem.
        const next: Record<string, string> = {}
        for (const id of missing) next[id] = payload.images?.[id] ?? ""
        setImages((prev) => ({ ...prev, ...next }))
      })
      .catch(() => {
        // Sem imagem o chip cai no ícone — nada quebra.
      })
    return () => controller.abort()
  }, [selectedIds, images])

  const results = useMemo(() => {
    if (!data || query.trim().length < 2) return []
    const needle = normalizeForMatch(query)
    const out: MentionablePeripheral[] = []
    for (const item of data.catalog.values()) {
      if (out.length >= 6) break
      if (selectedIds.includes(item.id)) continue
      const haystack = normalizeForMatch(`${item.brand} ${item.name}`)
      if (haystack.includes(needle)) out.push(item)
    }
    return out
  }, [query, data, selectedIds])

  function remove(id: string) {
    dismissedRef.current.add(id)
    onChange(selectedIds.filter((selectedId) => selectedId !== id))
  }

  function add(id: string) {
    dismissedRef.current.delete(id)
    if (selectedIds.includes(id) || selectedIds.length >= MAX_PERIPHERAL_MENTIONS) return
    onChange([...selectedIds, id])
    setQuery("")
    setShowSearch(false)
  }

  const limitReached = selectedIds.length >= MAX_PERIPHERAL_MENTIONS

  return (
    <div className="space-y-1">
      <label className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <Tag className="size-3.5 shrink-0" />
        Periféricos citados <span className="normal-case font-normal">(opcional)</span>
      </label>

      <div className="rounded-lg border border-border bg-muted/20 p-2.5 space-y-2">
        {loading ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 shrink-0 animate-spin" />
            Carregando catálogo…
          </p>
        ) : (
          <>
            {selected.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {selected.map((item) => (
                  <span
                    key={item.id}
                    className="flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 py-0.5 pl-1 pr-2 text-xs font-medium text-primary"
                  >
                    {images[item.id] ? (
                      <Image
                        src={images[item.id]}
                        alt=""
                        width={16}
                        height={16}
                        className="size-4 shrink-0 rounded-full object-cover"
                      />
                    ) : (
                      <Tag className="size-3 shrink-0" />
                    )}
                    <span className="max-w-[180px] truncate">
                      {buildPeripheralDisplayName(item.brand, item.name)}
                    </span>
                    <button
                      type="button"
                      onClick={() => remove(item.id)}
                      className="rounded-full text-primary/70 transition-colors hover:text-destructive"
                      aria-label={`Remover ${item.name}`}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Cite um periférico no texto e ele aparece aqui automaticamente.
              </p>
            )}

            {showSearch ? (
              <div className="relative">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onBlur={() => setTimeout(() => setShowSearch(false), 150)}
                  placeholder="Buscar periférico…"
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
                />
                {results.length > 0 && (
                  <div className="absolute left-0 top-full z-20 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover shadow-lg">
                    <div className="max-h-56 overflow-y-auto py-1">
                      {results.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => add(item.id)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60"
                        >
                          {/* Sem imagem aqui de propósito: a lista muda a cada
                              tecla e buscar 6 thumbs por tecla anularia a
                              economia do catálogo sem imagem. */}
                          <span className="flex size-6 shrink-0 items-center justify-center rounded bg-muted">
                            <Tag className="size-3 text-muted-foreground" />
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {buildPeripheralDisplayName(item.brand, item.name)}
                          </span>
                          {item.tier && (
                            <span
                              className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
                              style={{
                                backgroundColor:
                                  TIER_BASE_COLORS[item.tier as keyof typeof TIER_BASE_COLORS] ?? "#6B7280",
                              }}
                            >
                              {item.tier}
                            </span>
                          )}
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {getCategoryLabel(item.category)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowSearch(true)}
                disabled={limitReached}
                className={cn(
                  "flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary",
                  limitReached && "cursor-not-allowed opacity-50 hover:text-muted-foreground"
                )}
              >
                <Plus className="size-3.5 shrink-0" />
                {limitReached ? `Limite de ${MAX_PERIPHERAL_MENTIONS} periféricos` : "Adicionar manualmente"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
