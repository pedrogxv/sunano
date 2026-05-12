"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Check, ExternalLink, Plus, Search, X } from "lucide-react"

import { supabase } from "@/lib/supabase"
import { cn } from "@/lib/utils"
import BoxLoader from "@/components/ui/box-loader"

// ── Types ─────────────────────────────────────────────────────────────────────

type PeripheralRow = {
  id: string
  name: string
  brand: string
  category: string
  tier: string | null
  price: number
  image_url: string | null
  tags: string[]
  specs: Record<string, string | number | undefined> | null
}

type SearchResult = {
  id: string
  name: string
  brand: string
  image_url: string | null
  tier: string | null
  price: number
  category: string
}

// ── Constants ─────────────────────────────────────────────────────────────────

const TIER_ORDER = ["GOAT", "SS", "S", "A", "B", "C", "L"]

const TIER_CLASS: Record<string, string> = {
  GOAT: "tier-badge-t0",
  SS:   "tier-badge-t05",
  S:    "tier-badge-t1",
  A:    "tier-badge-t2",
  B:    "bg-muted/60 border border-border text-foreground",
  C:    "bg-muted/40 border border-border text-muted-foreground",
  L:    "bg-muted/20 border border-border text-muted-foreground/60",
}

const CATEGORY_LABEL: Record<string, string> = {
  mouse: "Mouse", keyboard: "Teclado", mousepad: "Mousepad",
  glasspad: "Glasspad", iem: "IEM", headset: "Headset",
  monitors: "Monitor", chairs: "Cadeira", feet: "Feet",
  switches: "Switches", dac_amp: "DAC/AMP",
}

const TAG_LABEL: Record<string, string> = {
  competitive: "Competitivo", versatile: "Versátil",
  value: "Custo-benefício", comfort: "Conforto",
}

const MAX_ITEMS = 4

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatLabel(value: string) {
  return value.split("-").map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ")
}

function formatCurrency(value: number) {
  try {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value)
  } catch {
    return `R$${value}`
  }
}

function TierBadge({ tier }: { tier: string }) {
  return (
    <span className={cn(
      "inline-flex items-center justify-center rounded px-2 py-0.5 text-xs font-bold tracking-wider",
      TIER_CLASS[tier] ?? "bg-muted/60 text-foreground"
    )}>
      {tier}
    </span>
  )
}

// ── Row definitions ───────────────────────────────────────────────────────────

type RowDef = {
  key: string
  label: string
  getValue: (item: PeripheralRow) => string | null
  getBest?: (items: PeripheralRow[]) => string | null
  renderValue?: (value: string) => React.ReactNode
}

const ROWS: RowDef[] = [
  {
    key: "price",
    label: "Preço",
    getValue: (item) => formatCurrency(item.price),
    getBest: (items) => {
      const min = Math.min(...items.map((i) => i.price))
      return items.find((i) => i.price === min)?.id ?? null
    },
  },
  {
    key: "tier",
    label: "Classificação",
    getValue: (item) => item.tier ?? null,
    getBest: (items) => {
      let bestIdx = Infinity, bestId: string | null = null
      for (const item of items) {
        const idx = item.tier ? TIER_ORDER.indexOf(item.tier) : Infinity
        if (idx < bestIdx) { bestIdx = idx; bestId = item.id }
      }
      return bestId
    },
    renderValue: (value) => <TierBadge tier={value} />,
  },
  {
    key: "connectivity",
    label: "Conectividade",
    getValue: (item) => item.specs?.connectivity ? formatLabel(String(item.specs.connectivity)) : null,
  },
  {
    key: "driver",
    label: "Sensor",
    getValue: (item) => item.specs?.driver ? String(item.specs.driver) : null,
  },
  {
    key: "keyboardLayout",
    label: "Layout",
    getValue: (item) => item.specs?.keyboardLayout ? String(item.specs.keyboardLayout).toUpperCase() : null,
  },
  {
    key: "keyboardType",
    label: "Tipo de Teclado",
    getValue: (item) => item.specs?.keyboardType ? formatLabel(String(item.specs.keyboardType)) : null,
  },
  {
    key: "surface",
    label: "Superfície",
    getValue: (item) => item.specs?.surface ? formatLabel(String(item.specs.surface)) : null,
  },
  {
    key: "size",
    label: "Tamanho",
    getValue: (item) => item.specs?.size ? formatLabel(String(item.specs.size)) : null,
  },
  {
    key: "mouseShape",
    label: "Formato",
    getValue: (item) => item.specs?.mouseShape ? formatLabel(String(item.specs.mouseShape)) : null,
  },
  {
    key: "refreshRate",
    label: "Taxa de Atualização",
    getValue: (item) => item.specs?.refreshRate ? `${item.specs.refreshRate}Hz` : null,
    getBest: (items) => {
      const max = Math.max(...items.map((i) => Number(i.specs?.refreshRate ?? 0)))
      if (!max) return null
      return items.find((i) => Number(i.specs?.refreshRate) === max)?.id ?? null
    },
  },
  {
    key: "panelType",
    label: "Painel",
    getValue: (item) => item.specs?.panelType ? String(item.specs.panelType).toUpperCase() : null,
  },
  {
    key: "profile",
    label: "Perfil",
    getValue: (item) => item.specs?.profile ? String(item.specs.profile) : null,
  },
  {
    key: "tags",
    label: "Destaques",
    getValue: (item) => item.tags?.length ? item.tags.map((t) => TAG_LABEL[t] ?? formatLabel(t)).join(", ") : null,
  },
]

// ── Main component ────────────────────────────────────────────────────────────

export function ComparePageClient() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [ids, setIds] = useState<string[]>(() =>
    searchParams.get("ids")?.split(",").filter(Boolean) ?? []
  )
  const [items, setItems] = useState<PeripheralRow[]>([])
  const [loading, setLoading] = useState(true)

  // Search state
  const [activeSearch, setActiveSearch] = useState<"add" | string | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const searchPanelRef = useRef<HTMLDivElement>(null)

  const category = items.length > 0 ? items[0].category : null

  // Fetch peripherals when ids change
  useEffect(() => {
    if (ids.length === 0) { setItems([]); setLoading(false); return }
    setLoading(true)
    supabase
      .from("peripherals")
      .select("id, name, brand, image_url, category, tier, price, tags, specs")
      .in("id", ids)
      .then(({ data }) => {
        const map = new Map((data ?? []).map((p: any) => [p.id, p]))
        const sorted = ids.map((id) => map.get(id)).filter(Boolean) as PeripheralRow[]
        setItems(sorted)
        setLoading(false)
      })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids.join(",")])

  // Sync URL when ids change
  useEffect(() => {
    const currentStr = searchParams.get("ids") ?? ""
    const newStr = ids.join(",")
    if (currentStr !== newStr) {
      const url = newStr ? `/perifericos/comparar?ids=${newStr}` : "/perifericos/comparar"
      router.replace(url, { scroll: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])

  // Focus search input when panel opens, reset when closed
  useEffect(() => {
    if (activeSearch) {
      setTimeout(() => searchInputRef.current?.focus(), 80)
    } else {
      setSearchQuery("")
      setSearchResults([])
    }
  }, [activeSearch])

  // Scroll search panel into view when it opens
  useEffect(() => {
    if (activeSearch) {
      setTimeout(() => searchPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 120)
    }
  }, [activeSearch])

  // Search peripherals
  useEffect(() => {
    if (!activeSearch || searchQuery.trim().length < 2) {
      setSearchResults([])
      setSearchLoading(false)
      return
    }
    setSearchLoading(true)
    const timer = setTimeout(async () => {
      let q = (supabase as any)
        .from("peripherals")
        .select("id, name, brand, image_url, tier, price, category")
        .ilike("name", `%${searchQuery.trim()}%`)

      if (category) q = q.eq("category", category)

      // Exclude already-selected, except the slot being swapped
      const excluded = activeSearch === "add" ? ids : ids.filter((id) => id !== activeSearch)
      if (excluded.length > 0) q = q.not("id", "in", `(${excluded.join(",")})`)

      const { data } = await q.limit(7)
      setSearchResults((data ?? []) as SearchResult[])
      setSearchLoading(false)
    }, 280)
    return () => { clearTimeout(timer) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, activeSearch, ids.join(","), category])

  // ── Mutation helpers ─────────────────────────────────────────────────────────

  const removeItem = useCallback((id: string) => {
    setIds((prev) => prev.filter((i) => i !== id))
    setActiveSearch((prev) => (prev === id ? null : prev))
  }, [])

  const selectResult = useCallback((result: SearchResult) => {
    if (activeSearch === "add") {
      setIds((prev) => [...prev, result.id])
    } else if (activeSearch) {
      const oldId = activeSearch
      setIds((prev) => prev.map((i) => (i === oldId ? result.id : i)))
    }
    setActiveSearch(null)
  }, [activeSearch])

  const openSwap = useCallback((id: string) => {
    setActiveSearch((prev) => (prev === id ? null : id))
  }, [])

  const openAdd = useCallback(() => {
    setActiveSearch((prev) => (prev === "add" ? null : "add"))
  }, [])

  // ── Compute comparison data ───────────────────────────────────────────────────

  const hasEnough = items.length >= 2
  const categoriesMatch = hasEnough && items.every((i) => i.category === items[0].category)

  const winsMap: Record<string, number> = {}
  for (const item of items) winsMap[item.id] = 0

  if (hasEnough && categoriesMatch) {
    for (const row of ROWS) {
      if (!row.getBest) continue
      const values = items.map((i) => row.getValue(i))
      if (!values.some((v) => v !== null)) continue
      const bestId = row.getBest(items)
      if (bestId) winsMap[bestId] = (winsMap[bestId] ?? 0) + 1
    }
  }
  const maxWins = hasEnough ? Math.max(...Object.values(winsMap)) : 0

  const rowsWithValues = ROWS.filter((row) => {
    const values = items.map((i) => row.getValue(i))
    return values.some((v) => v !== null)
  })
  const differentRows = rowsWithValues.filter((row) => {
    const values = items.map((i) => row.getValue(i))
    return !values.every((v) => v === values[0])
  })
  const sameRows = rowsWithValues.filter((row) => {
    const values = items.map((i) => row.getValue(i))
    return values.every((v) => v === values[0]) && values[0] !== null
  })

  const categoryLabel = category ? (CATEGORY_LABEL[category] ?? category) : "Periféricos"
  const swappingItem = typeof activeSearch === "string" && activeSearch !== "add"
    ? items.find((i) => i.id === activeSearch)
    : null

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 md:px-6 lg:px-8 space-y-8">

      {/* Header */}
      <div>
        <Link
          href="/perifericos"
          className="mb-5 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Voltar para periféricos
        </Link>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Comparativo
        </h1>
        {!loading && items.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {items.length} {categoryLabel.toLowerCase()}{items.length !== 1 ? "s" : ""}
            {hasEnough && categoriesMatch && differentRows.length > 0
              ? ` · ${differentRows.length} diferencial${differentRows.length !== 1 ? "is" : ""}`
              : ""}
          </p>
        )}
      </div>

      {/* Product cards + Add slot */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <BoxLoader />
        </div>
      ) : (
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(items.length + (items.length < MAX_ITEMS ? 1 : 0), MAX_ITEMS + 1)}, 1fr)` }}
        >
          {items.map((item) => {
            const wins = winsMap[item.id] ?? 0
            const isWinner = wins === maxWins && maxWins > 0 && hasEnough
            const isSwapping = activeSearch === item.id

            return (
              <div
                key={item.id}
                className={cn(
                  "relative rounded-2xl border bg-card p-4 text-center flex flex-col transition-all",
                  isWinner && !isSwapping ? "border-primary/50 shadow-lg shadow-primary/10" : "border-border",
                  isSwapping && "border-primary ring-2 ring-primary/30"
                )}
              >
                {/* Winner badge */}
                {isWinner && items.length > 1 && !isSwapping && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full border border-primary/40 bg-primary/15 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary">
                    Melhor opção
                  </div>
                )}

                {/* Remove button */}
                <button
                  onClick={() => removeItem(item.id)}
                  className="absolute right-2.5 top-2.5 flex size-6 items-center justify-center rounded-full bg-muted/40 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                  title="Remover da comparação"
                >
                  <X className="size-3.5" />
                </button>

                {/* Image */}
                <div className="mx-auto mb-3 size-20 overflow-hidden rounded-xl border border-border bg-muted/20">
                  {item.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.image_url} alt={item.name} className="h-full w-full object-contain p-2" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-black text-muted-foreground/20">
                      {item.brand.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 space-y-1">
                  <p className="text-sm font-bold leading-tight text-foreground">{item.name}</p>
                  <p className="text-xs text-muted-foreground">{item.brand}</p>
                  {item.tier && (
                    <div className="flex justify-center pt-0.5">
                      <TierBadge tier={item.tier} />
                    </div>
                  )}
                </div>

                {/* Price */}
                <div className="mt-3 border-t border-border pt-3">
                  <p className="text-base font-bold text-foreground">{formatCurrency(item.price)}</p>
                  {wins > 0 && (
                    <p className="text-[10px] text-muted-foreground">
                      {wins} vantage{wins === 1 ? "m" : "ns"}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-1.5">
                  <button
                    onClick={() => openSwap(item.id)}
                    className={cn(
                      "flex-1 rounded-lg border py-1.5 text-xs font-medium transition-colors",
                      isSwapping
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-border/70 hover:text-foreground"
                    )}
                  >
                    {isSwapping ? "Cancelar" : "Trocar"}
                  </button>
                  <Link
                    href={`/perifericos/${item.id}`}
                    className="flex items-center justify-center rounded-lg border border-border px-2 py-1.5 text-muted-foreground transition-colors hover:border-border/70 hover:text-foreground"
                    title="Ver detalhes"
                  >
                    <ExternalLink className="size-3.5" />
                  </Link>
                </div>
              </div>
            )
          })}

          {/* Add slot */}
          {items.length < MAX_ITEMS && (
            <button
              onClick={openAdd}
              className={cn(
                "flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed transition-colors",
                activeSearch === "add"
                  ? "border-primary/50 bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:border-primary/30 hover:bg-primary/5 hover:text-primary"
              )}
            >
              <div className={cn(
                "flex size-10 items-center justify-center rounded-full border-2 transition-colors",
                activeSearch === "add" ? "border-primary/50 bg-primary/10" : "border-border"
              )}>
                {activeSearch === "add" ? <X className="size-4" /> : <Plus className="size-4" />}
              </div>
              <span className="text-xs font-medium">
                {activeSearch === "add" ? "Cancelar" : "Adicionar"}
              </span>
            </button>
          )}
        </div>
      )}

      {/* Search panel */}
      {activeSearch !== null && (
        <div
          ref={searchPanelRef}
          className="overflow-hidden rounded-xl border border-primary/30 bg-card shadow-lg shadow-black/20"
        >
          {/* Panel header */}
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-xs font-semibold text-muted-foreground">
                {activeSearch === "add"
                  ? `Adicionar ${category ? CATEGORY_LABEL[category]?.toLowerCase() ?? "periférico" : "periférico"}`
                  : `Trocar: ${swappingItem?.name ?? ""}`}
              </p>
            </div>
            <button
              onClick={() => setActiveSearch(null)}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Search input */}
          <div className="border-b border-border px-4 py-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nome…"
                className="w-full rounded-lg border border-border bg-muted/20 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-72 overflow-y-auto">
            {searchLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="size-5 animate-spin rounded-full border-2 border-border border-t-primary" />
              </div>
            ) : searchResults.length > 0 ? (
              <div className="divide-y divide-border/50">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => selectResult(result)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/20"
                  >
                    {/* Thumbnail */}
                    <div className="size-10 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/20">
                      {result.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={result.image_url} alt={result.name} className="h-full w-full object-contain p-1" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[9px] font-bold text-muted-foreground">
                          {result.brand.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">{result.name}</p>
                      <p className="text-xs text-muted-foreground">{result.brand} · {formatCurrency(result.price)}</p>
                    </div>

                    {/* Tier */}
                    {result.tier && (
                      <TierBadge tier={result.tier} />
                    )}

                    {/* Action label */}
                    <span className="shrink-0 rounded-lg border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                      {activeSearch === "add" ? "Adicionar" : "Selecionar"}
                    </span>
                  </button>
                ))}
              </div>
            ) : searchQuery.trim().length >= 2 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum resultado para &quot;{searchQuery}&quot;.
              </p>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Digite pelo menos 2 caracteres para buscar.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Not enough items */}
      {!loading && !hasEnough && items.length > 0 && (
        <div className="rounded-xl border border-border bg-card/50 p-6 text-center">
          <p className="text-sm font-medium text-foreground">Adicione mais um periférico para comparar</p>
          <p className="mt-1 text-xs text-muted-foreground">Clique em "+ Adicionar" acima ou volte para a lista.</p>
        </div>
      )}

      {!loading && items.length === 0 && (
        <div className="rounded-2xl border border-border bg-card p-10 text-center space-y-3">
          <p className="text-base font-semibold text-foreground">Nenhum periférico selecionado</p>
          <p className="text-sm text-muted-foreground">Volte para a lista e marque os itens que deseja comparar.</p>
          <Link
            href="/perifericos"
            className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
          >
            Ir para periféricos
          </Link>
        </div>
      )}

      {!loading && hasEnough && !categoriesMatch && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-5 text-center">
          <p className="text-sm font-medium text-foreground">Categorias incompatíveis</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Remova ou troque os periféricos até que todos sejam da mesma categoria.
          </p>
        </div>
      )}

      {/* Comparison table */}
      {hasEnough && categoriesMatch && (
        <>
          {/* Diferenciais */}
          {differentRows.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Diferenciais</h2>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">
                  {differentRows.length} spec{differentRows.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-border">
                {differentRows.map((row, idx) => {
                  const bestId = row.getBest?.(items) ?? null
                  const values = items.map((i) => row.getValue(i))

                  return (
                    <div
                      key={row.key}
                      className={cn("grid items-center", idx < differentRows.length - 1 && "border-b border-border/60")}
                      style={{ gridTemplateColumns: `160px repeat(${items.length}, 1fr)` }}
                    >
                      <div className="bg-muted/10 px-5 py-4 self-stretch flex items-center border-r border-border/60">
                        <span className="text-xs font-semibold text-muted-foreground">{row.label}</span>
                      </div>

                      {items.map((item, i) => {
                        const value = values[i]
                        const isBest = bestId === item.id && value !== null

                        return (
                          <div
                            key={item.id}
                            className={cn(
                              "flex flex-col items-center justify-center gap-1.5 px-4 py-4",
                              isBest && "bg-primary/5",
                              i < items.length - 1 && "border-r border-border/40"
                            )}
                          >
                            {value !== null ? (
                              <>
                                {row.renderValue ? row.renderValue(value) : (
                                  <span className={cn(
                                    "text-sm font-semibold text-center leading-snug",
                                    isBest ? "text-primary" : "text-foreground"
                                  )}>
                                    {value}
                                  </span>
                                )}
                                {isBest && (
                                  <span className="inline-flex items-center gap-0.5 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-primary">
                                    <Check className="size-2.5" />
                                    Melhor
                                  </span>
                                )}
                              </>
                            ) : (
                              <span className="text-sm text-muted-foreground/30">—</span>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Em comum */}
          {sameRows.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground/60">Em comum</h2>
                <div className="h-px flex-1 bg-border/50" />
                <span className="text-xs text-muted-foreground/50">
                  {sameRows.length} spec{sameRows.length !== 1 ? "s" : ""}
                </span>
              </div>

              <div className="overflow-hidden rounded-xl border border-border/50">
                {sameRows.map((row, idx) => {
                  const value = row.getValue(items[0])
                  return (
                    <div
                      key={row.key}
                      className={cn(
                        "flex items-center gap-4 px-5 py-3 bg-muted/5",
                        idx < sameRows.length - 1 && "border-b border-border/40"
                      )}
                    >
                      <span className="w-36 shrink-0 text-xs font-medium text-muted-foreground/60">{row.label}</span>
                      <div className="flex items-center gap-2">
                        <Check className="size-3.5 text-muted-foreground/40" />
                        {row.renderValue && value ? row.renderValue(value) : (
                          <span className="text-sm text-muted-foreground">{value}</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          )}

          {/* Score summary */}
          {maxWins > 0 && (
            <div className="rounded-xl border border-border bg-card/50 p-5">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Placar de vantagens
              </h3>
              <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
                {items.map((item) => {
                  const wins = winsMap[item.id] ?? 0
                  const pct = maxWins > 0 ? (wins / maxWins) * 100 : 0
                  return (
                    <div key={item.id} className="space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-xs font-medium text-foreground">{item.name}</p>
                        <span className="shrink-0 text-sm font-bold text-foreground">{wins}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all duration-500",
                            wins === maxWins ? "bg-primary" : "bg-muted-foreground/30"
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      <Link
        href="/perifericos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        Voltar e alterar seleção
      </Link>
    </div>
  )
}
