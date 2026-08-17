"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Bookmark, ChevronDown, Loader2, PackageSearch, Search, SlidersHorizontal, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthUser } from "@/components/providers/auth-context"
import { ProductCard } from "@/components/store/ProductCard"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { MultiCombobox } from "@/components/ui/combobox"
import { Button } from "@/components/ui/button"
import { MarketInfoDialog } from "@/components/store/MarketInfoDialog"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import type { StoreProductCard, StoreFilterOptions } from "@/lib/server/repositories/store-repository"

interface StoreContentProps {
  initialItems: StoreProductCard[]
  initialTotal: number
  initialFilterOptions: StoreFilterOptions
  pageSize: number
}

type ConditionFilter = "all" | "new" | "used" | "opened"
type SortKey = "recent" | "name-asc" | "name-desc" | "price-asc" | "price-desc"

const PRICE_MIN = 0

function formatLabel(value: string) {
  return value
    .split(/[\s_-]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
}

function PriceSlider({ value, onChange, max }: { value: [number, number]; onChange: (v: [number, number]) => void; max: number }) {
  const [minVal, maxVal] = value
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">R$</span>
        <span className="text-xs font-medium text-foreground">R${minVal} – R${maxVal}</span>
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

function FilterSection({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-border last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted/20"
      >
        {title}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform duration-200", open && "rotate-180")} />
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  )
}

export function StoreContent({ initialItems, initialTotal, initialFilterOptions, pageSize }: StoreContentProps) {
  const searchParams = useSearchParams()
  const { user } = useAuthUser()
  const userId = user?.id ?? null

  const [wishlistedIds, setWishlistedIds] = useState<Set<string> | null>(null)
  const [onlyWishlisted, setOnlyWishlisted] = useState(false)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetch("/api/store/wishlists")
      .then((res) => res.json())
      .then((data: { wishlists?: { id: string; is_default: boolean }[] }) => {
        const defaultList = data.wishlists?.find((w) => w.is_default)
        if (!defaultList) return
        return fetch(`/api/store/wishlists/${defaultList.id}`)
          .then((res) => res.json())
          .then((itemsData: { items?: { product_id: string }[] }) => {
            if (cancelled) return
            setWishlistedIds(new Set((itemsData.items ?? []).map((item) => item.product_id)))
          })
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [userId])

  function handleWishlistChange(productId: string, wishlisted: boolean) {
    setWishlistedIds((prev) => {
      const next = new Set(prev ?? [])
      if (wishlisted) next.add(productId)
      else next.delete(productId)
      return next
    })
  }

  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const debouncedQuery = useDebouncedValue(query, 400)
  const [selectedCondition, setSelectedCondition] = useState<ConditionFilter>("all")
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [sortKey, setSortKey] = useState<SortKey>("recent")
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false)
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
  }, [selectedCondition, selectedCategories.join(","), selectedBrands.join(","), debouncedQuery, priceRange[0], priceRange[1], sortKey, onlyWishlisted])

  useEffect(() => {
    if (onlyWishlisted && wishlistedIds && wishlistedIds.size === 0) {
      setItems([])
      setTotal(0)
      return
    }

    const params = new URLSearchParams()
    params.set("type", "store")
    if (selectedCondition !== "all") params.set("condition", selectedCondition)
    if (selectedCategories.length > 0) params.set("categories", selectedCategories.join(","))
    if (selectedBrands.length > 0) params.set("brands", selectedBrands.join(","))
    if (debouncedQuery.trim()) params.set("search", debouncedQuery.trim())
    if (isPriceFiltered) {
      params.set("priceMin", String(priceRange[0] * 100))
      params.set("priceMax", String(priceRange[1] * 100))
    }
    if (sortKey !== "recent") params.set("sort", sortKey)
    if (onlyWishlisted && wishlistedIds) params.set("productIds", [...wishlistedIds].join(","))
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))

    // Na primeira renderização os dados já vieram do SSR com os mesmos
    // filtros padrão — evita um fetch redundante assim que a página monta.
    if (isFirstRun.current) {
      isFirstRun.current = false
      if (page === 1 && !debouncedQuery && !onlyWishlisted) {
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
  }, [selectedCondition, selectedCategories.join(","), selectedBrands.join(","), debouncedQuery, priceRange[0], priceRange[1], isPriceFiltered, sortKey, page, pageSize, onlyWishlisted, wishlistedIds])

  const activeFiltersCount =
    (selectedCondition !== "all" ? 1 : 0) +
    selectedCategories.length +
    selectedBrands.length +
    (query.trim() ? 1 : 0) +
    (isPriceFiltered ? 1 : 0)

  const resetFilters = () => {
    setQuery("")
    setSelectedCondition("all")
    setSelectedCategories([])
    setSelectedBrands([])
    setPriceRange(null)
    setSortKey("recent")
  }

  const sidebarFilters = (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      {/* Search */}
      <div className="border-b border-border p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Buscar produtos"
            className="h-9 border-border bg-muted/20 pl-9 text-sm placeholder:text-muted-foreground focus-visible:ring-1"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, marca..."
            value={query}
          />
        </div>
      </div>

      {/* Sort by */}
      <div className="border-b border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ordenar por
        </p>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="recent">Mais recentes</SelectItem>
            <SelectItem value="name-asc">Nome A-Z</SelectItem>
            <SelectItem value="name-desc">Nome Z-A</SelectItem>
            <SelectItem value="price-asc">Menor preço</SelectItem>
            <SelectItem value="price-desc">Maior preço</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Condition / Estado */}
      <FilterSection title="Estado">
        <Select value={selectedCondition} onValueChange={(v) => setSelectedCondition(v as ConditionFilter)}>
          <SelectTrigger className="h-9 w-full border-border bg-muted/20 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Qualquer</SelectItem>
            <SelectItem value="new">Novo</SelectItem>
            <SelectItem value="opened">Embalagem aberta</SelectItem>
            <SelectItem value="used">Usado</SelectItem>
          </SelectContent>
        </Select>
      </FilterSection>

      {/* Category */}
      {categoryOptions.length > 0 && (
        <FilterSection title="Categoria">
          <MultiCombobox
            options={categoryOptions}
            values={selectedCategories}
            onValuesChange={setSelectedCategories}
            placeholder="Todas as categorias"
            searchPlaceholder="Buscar categoria"
            allLabel="Todas as categorias"
            className="h-9 w-full border-border bg-muted/20 text-sm"
          />
        </FilterSection>
      )}

      {/* Brand */}
      {brandOptions.length > 0 && (
        <FilterSection title="Marca">
          <MultiCombobox
            options={brandOptions}
            values={selectedBrands}
            onValuesChange={setSelectedBrands}
            placeholder="Todas as marcas"
            searchPlaceholder="Buscar marca"
            allLabel="Todas as marcas"
            className="h-9 w-full border-border bg-muted/20 text-sm"
          />
        </FilterSection>
      )}

      {/* Price */}
      <FilterSection title="Preço">
        <PriceSlider value={priceRange} onChange={setPriceRange} max={maxPrice} />
      </FilterSection>

      {/* Wishlist */}
      {user && (
        <div className="p-4">
          <button
            type="button"
            onClick={() => setOnlyWishlisted((prev) => !prev)}
            disabled={!wishlistedIds}
            className={cn(
              "flex w-full items-center justify-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
              onlyWishlisted
                ? "border-primary/40 bg-primary/10 text-primary"
                : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
              !wishlistedIds && "opacity-60"
            )}
          >
            <Bookmark className={cn("size-3.5", onlyWishlisted && "fill-current")} />
            Só na minha lista de compras
          </button>
        </div>
      )}

      {/* Clear filters */}
      {activeFiltersCount > 0 && (
        <div className="p-4 pt-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={resetFilters}
            className="h-9 w-full gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
            Limpar filtros {activeFiltersCount > 0 && `(${activeFiltersCount})`}
          </Button>
        </div>
      )}
    </div>
  )

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-2 py-8 sm:px-4 md:px-6 lg:px-8">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border/40 bg-card/60 px-6 pb-4 pt-5">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-44 bg-gradient-to-b from-primary/[0.05] to-transparent" />

        {user && (
          <Link
            href="/conta/pedidos"
            className="absolute right-4 top-4 z-10 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/30 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-primary/10 hover:text-primary"
          >
            <PackageSearch className="size-3.5" />
            Meus pedidos
          </Link>
        )}

        <div className="relative text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/50">
            Loja Sunano
          </p>
          <div className="mt-1 flex items-center justify-center gap-1.5">
            <h1 className="text-2xl font-black tracking-tight text-foreground md:text-3xl">
              Loja
            </h1>
            <MarketInfoDialog />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Produtos novos e usados, selecionados e testados pelo Sunano.
          </p>
        </div>

      </div>

      {/* Mobile filter toggle */}
      <div className="flex items-center justify-between md:hidden">
        <p className="text-xs text-muted-foreground">
          {total} produto{total !== 1 ? "s" : ""}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          onClick={() => setMobileFiltersOpen((o) => !o)}
        >
          <SlidersHorizontal className="size-3.5" />
          Filtros
          {activeFiltersCount > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
              {activeFiltersCount}
            </span>
          )}
        </Button>
      </div>

      {mobileFiltersOpen && <div className="md:hidden">{sidebarFilters}</div>}

      {/* Two-column layout */}
      <div className="flex items-start gap-8">
        <aside className="hidden w-[260px] shrink-0 md:block md:sticky md:top-[var(--sticky-header-h)]">
          {sidebarFilters}
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mb-6 hidden items-center gap-3 md:flex">
            <span className="text-sm font-medium text-muted-foreground">
              {total} produto{total !== 1 ? "s" : ""}
            </span>
            {activeFiltersCount > 0 && (
              <span className="text-xs text-muted-foreground/60">
                · {activeFiltersCount} filtro{activeFiltersCount !== 1 ? "s" : ""} ativo{activeFiltersCount !== 1 ? "s" : ""}
              </span>
            )}
            {isFetching && <Loader2 className="size-3.5 animate-spin text-muted-foreground/60" />}
          </div>

          {onlyWishlisted && items.length === 0 && !isFetching ? (
            <p className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
              Nenhum produto da sua lista de compras está disponível aqui.
            </p>
          ) : items.length === 0 && !isFetching ? (
            <div className="rounded-2xl border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Tente ajustar os filtros.</p>
            </div>
          ) : (
            <div className={cn("grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 xl:grid-cols-3 transition-opacity", isFetching && "opacity-60")}>
              {items.map((product) => (
                <ProductCard
                  key={product.id}
                  {...product}
                  wishlisted={wishlistedIds?.has(product.id) ?? false}
                  onWishlistChange={handleWishlistChange}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Próxima
              </Button>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
