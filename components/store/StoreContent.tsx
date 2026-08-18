"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Flame, Loader2, PackageSearch, QrCode, Search, ShieldCheck, Sparkles, Star, Store, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthUser } from "@/components/providers/auth-context"
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard"
import { CategoryTiles } from "@/components/store/CategoryTiles"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { MultiCombobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { MarketInfoDialog } from "@/components/store/MarketInfoDialog"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import type { StoreProductCard, StoreFilterOptions } from "@/lib/server/repositories/store-repository"

interface StoreContentProps {
  initialItems: StoreProductCard[]
  initialTotal: number
  initialFilterOptions: StoreFilterOptions
  initialFeatured: StoreProductCard[]
  pageSize: number
}

type SortKey = "recent" | "name-asc" | "name-desc" | "price-asc" | "price-desc"

const PRICE_MIN = 0
const SORT_LABEL: Record<SortKey, string> = {
  recent: "Mais recentes",
  "name-asc": "Nome A-Z",
  "name-desc": "Nome Z-A",
  "price-asc": "Menor preço",
  "price-desc": "Maior preço",
}

function formatLabel(value: string) {
  return value
    .split(/[\s_-]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}

function buildPageList(current: number, total: number): (number | "ellipsis")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const keep = new Set([1, total, current - 1, current, current + 1])
  const sorted = [...keep].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b)
  const result: (number | "ellipsis")[] = []
  let prev = 0
  for (const p of sorted) {
    if (prev && p - prev > 1) result.push("ellipsis")
    result.push(p)
    prev = p
  }
  return result
}

const TRIGGER_CLASS =
  "flex h-10 w-auto items-center gap-2 whitespace-nowrap rounded-lg border border-border bg-muted/30 px-3.5 text-[13px] font-semibold text-foreground hover:bg-muted/50"

function PriceSlider({ value, onChange, max }: { value: [number, number]; onChange: (v: [number, number]) => void; max: number }) {
  const [minVal, maxVal] = value
  return (
    <div className="flex flex-col gap-3 p-1">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Faixa de preço</span>
        <span className="text-xs font-semibold text-foreground">R${minVal} – R${maxVal}</span>
      </div>
      <Slider
        min={PRICE_MIN}
        max={max}
        step={10}
        value={[minVal, maxVal]}
        onValueChange={([min, max]) => onChange([min, max])}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground/60">
        <span>R${PRICE_MIN}</span>
        <span>R${max}</span>
      </div>
    </div>
  )
}

export function StoreContent({ initialItems, initialTotal, initialFilterOptions, initialFeatured, pageSize }: StoreContentProps) {
  const searchParams = useSearchParams()
  const { user } = useAuthUser()

  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const debouncedQuery = useDebouncedValue(query, 400)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>("recent")
  const [page, setPage] = useState(1)

  const [filterOptions, setFilterOptions] = useState<StoreFilterOptions>(initialFilterOptions)
  useEffect(() => {
    const params = new URLSearchParams()
    params.set("type", "store")
    fetch(`/api/store/filter-options?${params}`)
      .then((res) => res.json())
      .then((data: StoreFilterOptions) => setFilterOptions(data))
      .catch(() => {})
  }, [])

  const maxPriceCents = filterOptions.priceMaxCents || 0
  const maxPrice = Math.ceil(maxPriceCents / 100 / 10) * 10

  const [priceRangeOverride, setPriceRangeOverride] = useState<[number, number] | null>(null)
  const priceRange = useMemo<[number, number]>(
    () => priceRangeOverride ?? [PRICE_MIN, maxPrice],
    [priceRangeOverride, maxPrice]
  )
  const setPriceRange = setPriceRangeOverride
  const isPriceFiltered = priceRange[0] > PRICE_MIN || priceRange[1] < maxPrice

  const categoryOptions = useMemo(
    () => filterOptions.categories.map((c) => ({ value: c, label: formatLabel(c) })),
    [filterOptions.categories]
  )
  const brandOptions = useMemo(
    () => filterOptions.brands.map((b) => ({ value: b, label: b })),
    [filterOptions.brands]
  )

  useEffect(() => {
    setSelectedCategories((prev) => prev.filter((c) => filterOptions.categories.includes(c)))
    setSelectedBrands((prev) => prev.filter((b) => filterOptions.brands.includes(b)))
  }, [filterOptions.categories, filterOptions.brands])

  // Estado de resultado: itens da página atual, servidos pelo servidor
  // (banco pagina/filtra, não mais o browser). `items`/`total` só trocam
  // quando o fetch termina — mantém a grade anterior visível durante a
  // troca de filtro (via `isFetching`), evitando layout shift.
  const [items, setItems] = useState<StoreProductCard[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [isFetching, setIsFetching] = useState(false)
  const isFirstRun = useRef(true)

  // Volta pra página 1 sempre que um filtro (não a página em si) muda.
  useEffect(() => {
    setPage(1)
  }, [selectedCategories.join(","), selectedBrands.join(","), debouncedQuery, priceRange[0], priceRange[1], sortKey])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set("type", "store")
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","))
    if (selectedBrands.length > 0) params.set("brands", selectedBrands.join(","))
    if (debouncedQuery.trim()) params.set("search", debouncedQuery.trim())
    if (isPriceFiltered) {
      params.set("priceMin", String(priceRange[0] * 100))
      params.set("priceMax", String(priceRange[1] * 100))
    }
    if (sortKey !== "recent") params.set("sort", sortKey)
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))

    // Na primeira renderização os dados já vieram do SSR com os mesmos
    // filtros padrão — evita um fetch redundante assim que a página monta.
    if (isFirstRun.current) {
      isFirstRun.current = false
      if (page === 1 && !debouncedQuery) {
        return
      }
    }

    setIsFetching(true)
    const controller = new AbortController()
    fetch(`/api/store/products?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { items: StoreProductCard[]; total: number }) => {
        setItems(data.items)
        setTotal(data.total)
      })
      .catch((err) => {
        if (err?.name !== "AbortError") setItems([])
      })
      .finally(() => setIsFetching(false))
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCategories.join(","), selectedBrands.join(","), debouncedQuery, priceRange[0], priceRange[1], isPriceFiltered, sortKey, page, pageSize])

  const activeFiltersCount =
    selectedCategories.length +
    selectedBrands.length +
    (query.trim() ? 1 : 0) +
    (isPriceFiltered ? 1 : 0)

  const resetFilters = () => {
    setQuery("")
    setSelectedCategories([])
    setSelectedBrands([])
    setPriceRange(null)
    setSortKey("recent")
  }

  const { featuredItems, featuredLabel, FeaturedIcon } = useMemo(() => {
    // Produtos escolhidos manualmente pelo admin sempre entram primeiro —
    // se não preencherem as 8 vagas, o restante é completado pela lógica
    // automática (ofertas/novidades), sem repetir quem já é destaque.
    // Usa sempre `initialItems` (não os `items` filtrados) pra que Categorias
    // e Destaques fiquem fixos e não sejam afetados pelos filtros do catálogo.
    const featuredIds = new Set(initialFeatured.map((p) => p.id))
    const discounted = initialItems.filter((p) => p.promo_price_cents != null && p.promo_price_cents < p.price_cents && !featuredIds.has(p.id))
    const fallbackSource = discounted.length > 0 ? discounted : initialItems.filter((p) => !featuredIds.has(p.id))
    const remaining = Math.max(0, 8 - initialFeatured.length)
    const merged = [...initialFeatured.slice(0, 8), ...fallbackSource.slice(0, remaining)]

    return {
      featuredItems: merged,
      featuredLabel: initialFeatured.length > 0 ? "Selecionados" : discounted.length > 0 ? "Ofertas" : "Novidades",
      FeaturedIcon: initialFeatured.length > 0 ? Star : discounted.length > 0 ? Flame : Sparkles,
    }
  }, [initialItems, initialFeatured])

  const activeCategory = selectedCategories.length === 1 ? selectedCategories[0] : null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div>
      {/* Announcement bar */}
      <div className="border-b border-border bg-card px-4 py-2 text-center text-[12px] font-semibold text-muted-foreground">
        Pagamento via <span className="text-foreground">PIX</span> · Produtos novos e usados{" "}
        <span className="text-foreground">testados pelo Sunano</span>
      </div>

      {/* Hero / banner */}
      <div
        className="relative overflow-hidden bg-[#0b0f14] px-4 py-10 sm:py-14 md:py-16"
        style={{
          backgroundImage: "url(/images/mascot/Loja.png)",
          backgroundSize: "cover",
          backgroundPosition: "right center",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(90deg, #0b0f14 15%, rgba(11,15,20,0.85) 45%, rgba(11,15,20,0.35) 70%, transparent 95%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 sm:hidden"
          style={{
            background: "linear-gradient(180deg, rgba(11,15,20,0.55) 0%, rgba(11,15,20,0.9) 75%, #0b0f14 100%)",
          }}
        />

        {user && (
          <Link
            href="/conta/pedidos"
            className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-300"
          >
            <PackageSearch className="size-3.5" />
            Meus pedidos
          </Link>
        )}

        <div className="relative mx-auto flex max-w-7xl flex-col items-start gap-4 px-2 text-left sm:px-4 md:px-6 lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/25 px-3.5 py-1.5 text-[11px] font-extrabold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm">
            <ShieldCheck className="size-3 text-emerald-400" />
            Testado pelo Sunano
          </span>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-bold leading-[1.05] text-white drop-shadow-sm sm:text-4xl md:text-5xl">
              NOSSA LOJA DE
              <br />
              <span className="text-emerald-400">PERIFÉRICOS GAMER</span>
            </h1>
            <MarketInfoDialog />
          </div>
          <p className="max-w-md text-[13px] font-semibold text-white/75 sm:text-sm">
            Curadoria Sunano · marcas parceiras · reviews da comunidade
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <a
              href="#produtos"
              className="flex h-[50px] items-center gap-2 rounded-xl bg-emerald-500 px-6 text-sm font-extrabold text-black transition-opacity hover:opacity-90"
            >
              Ver todos os produtos
              <ArrowRight className="size-4" />
            </a>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <QrCode className="size-3.5 text-emerald-400" />
              Pagamento via PIX
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-white/80">
              <ShieldCheck className="size-3.5 text-emerald-400" />
              Compra acompanhada na sua conta
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-14 px-2 pb-16 pt-10 sm:px-4 sm:pt-12 md:px-6 lg:px-8">
        {/* Categorias */}
        {categoryOptions.length > 0 && (
          <section className="flex flex-col gap-4">
            <div>
              <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Navegar</p>
              <h2 className="font-display text-2xl font-bold text-foreground">Comprar por categoria</h2>
            </div>
            <CategoryTiles
              categories={filterOptions.categories}
              categoryCounts={filterOptions.categoryCounts}
              activeCategory={activeCategory}
              onSelect={(cat) => setSelectedCategories(cat ? [cat] : [])}
            />
          </section>
        )}

        {/* Destaques */}
        {featuredItems.length > 0 && (
          <section className="flex flex-col gap-4">
            <div className="flex items-end justify-between">
              <div>
                <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">
                  <FeaturedIcon className="size-3" />
                  Destaques
                </p>
                <h2 className="font-display text-2xl font-bold text-foreground">{featuredLabel}</h2>
              </div>
              <a
                href="#produtos"
                className="flex items-center gap-1.5 text-[13.5px] font-bold text-muted-foreground transition-colors hover:text-foreground"
              >
                Ver tudo
                <ArrowRight className="size-3.5" />
              </a>
            </div>
            <div className="flex gap-4 overflow-x-auto pb-2 [scrollbar-width:thin]">
              {featuredItems.map((product) => (
                <div key={product.id} className="w-[250px] shrink-0">
                  <ProductCard {...product} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Catálogo */}
        <section id="produtos" className="scroll-mt-20">
          <div className="mb-5">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-muted-foreground">Catálogo completo</p>
            <h2 className="font-display text-2xl font-bold text-foreground">Todos os produtos</h2>
          </div>

          {/* Filter bar */}
          <div className="mb-6 flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                aria-label="Buscar produtos"
                className="h-10 border-border bg-muted/30 pl-9 text-[13px] placeholder:text-muted-foreground focus-visible:ring-1"
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome, marca..."
                value={query}
              />
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {categoryOptions.length > 0 && (
                <MultiCombobox
                  options={categoryOptions}
                  values={selectedCategories}
                  onValuesChange={setSelectedCategories}
                  placeholder="Categoria"
                  searchPlaceholder="Buscar categoria"
                  allLabel="Todas as categorias"
                  className={TRIGGER_CLASS}
                />
              )}

              {brandOptions.length > 0 && (
                <MultiCombobox
                  options={brandOptions}
                  values={selectedBrands}
                  onValuesChange={setSelectedBrands}
                  placeholder="Marca"
                  searchPlaceholder="Buscar marca"
                  allLabel="Todas as marcas"
                  className={TRIGGER_CLASS}
                />
              )}

              <Popover>
                <PopoverTrigger asChild>
                  <button type="button" className={TRIGGER_CLASS}>
                    Preço
                    <ChevronDown className="size-3.5 text-muted-foreground" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72" align="start">
                  <PriceSlider value={priceRange} onChange={setPriceRange} max={maxPrice} />
                </PopoverContent>
              </Popover>

              <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                <SelectTrigger className={TRIGGER_CLASS}>
                  <SelectValue>{`Ordenar: ${SORT_LABEL[sortKey]}`}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Mais recentes</SelectItem>
                  <SelectItem value="name-asc">Nome A-Z</SelectItem>
                  <SelectItem value="name-desc">Nome Z-A</SelectItem>
                  <SelectItem value="price-asc">Menor preço</SelectItem>
                  <SelectItem value="price-desc">Maior preço</SelectItem>
                </SelectContent>
              </Select>

              <span className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-muted-foreground">
                <b className="text-foreground">{total}</b> produto{total !== 1 ? "s" : ""}
                {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />}
              </span>

              {activeFiltersCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetFilters}
                  className="h-10 gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                  Limpar ({activeFiltersCount})
                </Button>
              )}
            </div>
          </div>

          {isFetching ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: items.length > 0 ? items.length : pageSize }).map((_, idx) => (
                <ProductCardSkeleton key={idx} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Tente ajustar os filtros.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} {...product} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
                className="flex h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              {buildPageList(page, totalPages).map((p, idx) =>
                p === "ellipsis" ? (
                  <span key={`e${idx}`} className="px-1 text-xs font-semibold text-muted-foreground">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    disabled={isFetching}
                    onClick={() => setPage(p)}
                    aria-current={p === page ? "page" : undefined}
                    className={cn(
                      "flex h-[34px] min-w-[34px] items-center justify-center rounded-lg border px-2.5 text-[12.5px] font-bold transition-colors",
                      p === page
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {p}
                  </button>
                )
              )}
              <button
                type="button"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                aria-label="Próxima página"
                className="flex h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-muted-foreground"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}
        </section>

        {/* Footer trust */}
        <section className="grid gap-4 border-t border-border pt-12 sm:grid-cols-3">
          <div className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-400">
              <QrCode className="size-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-foreground">Pagamento via PIX</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Chave PIX gerada na hora, direto no checkout.</p>
            </div>
          </div>
          <div className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-400">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-foreground">Testado pelo Sunano</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Cada produto passa por teste antes de ir pro anúncio.</p>
            </div>
          </div>
          <div className="flex items-start gap-3.5 rounded-2xl border border-border bg-card p-5">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-emerald-500/12 text-emerald-400">
              <Store className="size-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-foreground">Compra acompanhada</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">Acompanhe o status do pedido direto na sua conta.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
