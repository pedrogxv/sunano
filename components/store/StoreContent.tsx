"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Flame, Loader2, Package, PackageSearch, QrCode, ShieldCheck, SlidersHorizontal, Sparkles, Star, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthUser } from "@/components/providers/auth-context"
import { usePageHeader } from "@/components/providers/page-header-context"
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard"
import { CategoryTiles } from "@/components/store/CategoryTiles"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"
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
type ConditionKey = "all" | "new" | "used" | "opened"

const CONDITION_LABEL: Record<ConditionKey, string> = {
  all: "Estado",
  new: "Novo",
  used: "Usado",
  opened: "Emb. aberta",
}

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

/** Chip da fileira de filtros do desktop (36 px, #141414 sobre #0a0a0a). */
const TRIGGER_CLASS =
  "flex h-9 w-auto items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-[#2a2a2a] bg-[#141414] px-3.5 text-[12.5px] font-semibold text-[#cfcfcf] hover:border-foreground/25"

/** Mesmo chip, empilhado e de largura cheia dentro do popover do mobile. */
const MOBILE_TRIGGER_CLASS =
  "flex h-11 w-full items-center justify-between gap-[7px] whitespace-nowrap rounded-xl border border-[#2a2a2a] bg-[#141414] px-4 text-[13px] font-semibold text-[#cfcfcf]"

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

  // A TopBar cai no fallback "Sunano" sem isso — /loja não está no mapa de
  // títulos por rota (getPageDefaults em TopBar.tsx). Descrição curta de
  // propósito: o grupo esquerdo da TopBar é `shrink-0` (TopBar.tsx), então
  // o `truncate` do span nunca entra em ação — uma string longa empurra os
  // botões da direita (carrinho/login) pra fora da tela no mobile.
  usePageHeader("Mercado", "PIX na hora, testado antes de anunciar")

  const [query, setQuery] = useState(searchParams.get("q") ?? "")
  const debouncedQuery = useDebouncedValue(query, 400)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [condition, setCondition] = useState<ConditionKey>("all")
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
  const featuredScrollRef = useRef<HTMLDivElement>(null)

  // Volta pra página 1 sempre que um filtro (não a página em si) muda.
  useEffect(() => {
    setPage(1)
  }, [selectedCategories.join(","), selectedBrands.join(","), debouncedQuery, priceRange[0], priceRange[1], sortKey, condition])

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
    if (condition !== "all") params.set("condition", condition)
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
  }, [selectedCategories.join(","), selectedBrands.join(","), debouncedQuery, priceRange[0], priceRange[1], isPriceFiltered, sortKey, condition, page, pageSize])

  const activeFiltersCount =
    selectedCategories.length +
    selectedBrands.length +
    (query.trim() ? 1 : 0) +
    (condition !== "all" ? 1 : 0) +
    (isPriceFiltered ? 1 : 0)

  const resetFilters = () => {
    setQuery("")
    setSelectedCategories([])
    setSelectedBrands([])
    setCondition("all")
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
      featuredLabel: initialFeatured.length > 0 ? "Selecionados da semana" : discounted.length > 0 ? "Ofertas" : "Novidades",
      FeaturedIcon: initialFeatured.length > 0 ? Star : discounted.length > 0 ? Flame : Sparkles,
    }
  }, [initialItems, initialFeatured])

  const activeCategory = selectedCategories.length === 1 ? selectedCategories[0] : null

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  // Os mesmos controles aparecem em dois lugares: na fileira do desktop e
  // empilhados dentro do popover "Filtros" do mobile (o artboard 390 troca a
  // fileira inteira por um botão só).
  const renderFilters = (triggerClass: string) => (
    <>
      {categoryOptions.length > 0 && (
        <MultiCombobox
          options={categoryOptions}
          values={selectedCategories}
          onValuesChange={setSelectedCategories}
          placeholder="Categoria"
          searchPlaceholder="Buscar categoria"
          allLabel="Todas as categorias"
          className={triggerClass}
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
          className={triggerClass}
        />
      )}

      <Select value={condition} onValueChange={(v) => setCondition(v as ConditionKey)}>
        <SelectTrigger className={triggerClass}>
          <SelectValue>{CONDITION_LABEL[condition]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os estados</SelectItem>
          <SelectItem value="new">Novo</SelectItem>
          <SelectItem value="opened">Emb. aberta</SelectItem>
          <SelectItem value="used">Usado</SelectItem>
        </SelectContent>
      </Select>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={triggerClass}>
            Preço
            <ChevronDown className="size-[13px] text-[#6e6e6e]" strokeWidth={2.2} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-72" align="start">
          <PriceSlider value={priceRange} onChange={setPriceRange} max={maxPrice} />
        </PopoverContent>
      </Popover>
    </>
  )

  return (
    <div>
      {/* Faixa de aviso + categorias — vive na página, não é chrome global
          (sidebar cuida da navegação do site). Hover mostra marcas + 1 produto
          de exemplo, tudo a partir do que já está carregado no cliente. */}
      <StoreCategoryNav
        categories={filterOptions.categories}
        categoryCounts={filterOptions.categoryCounts}
        brandsByCategory={filterOptions.brandsByCategory}
        activeCategory={activeCategory}
        onSelect={(cat) => setSelectedCategories(cat ? [cat] : [])}
        onSelectBrand={(cat, brand) => {
          setSelectedCategories([cat])
          setSelectedBrands([brand])
        }}
        query={query}
        onQueryChange={setQuery}
        previewPool={[...initialFeatured, ...initialItems]}
      />

      {/* Hero: a mascote só sangra pela direita no desktop; no mobile ela fica
          atrás de um degradê vertical e o conteúdo desce pro rodapé do bloco. */}
      <div
        className="relative h-[320px] overflow-hidden bg-[#0b0f14] bg-cover [background-position:72%_center] sm:h-[400px] sm:[background-position:right_center]"
        style={{ backgroundImage: "url(/images/mascot/Loja.png)" }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 hidden sm:block"
          style={{
            background:
              "linear-gradient(90deg, #0b0f14 22%, rgba(11,15,20,0.82) 48%, rgba(11,15,20,0.25) 74%, rgba(11,15,20,0) 96%)",
          }}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 sm:hidden"
          style={{
            background: "linear-gradient(180deg, rgba(11,15,20,0.45) 0%, rgba(11,15,20,0.88) 58%, #0b0f14 100%)",
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

        <div className="relative mx-auto flex h-full max-w-7xl flex-col items-start justify-end gap-[13px] px-4 pb-[22px] text-left sm:justify-center sm:gap-5 sm:pb-0 lg:px-8">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/16 bg-black/30 px-[11px] py-[5px] text-[9.5px] font-extrabold uppercase tracking-[0.16em] text-white/90 backdrop-blur-sm sm:gap-[7px] sm:px-[13px] sm:py-1.5 sm:text-[10px]">
            <ShieldCheck className="size-[11px] text-emerald-400 sm:size-3" strokeWidth={2.2} />
            Curadoria Sunano
          </span>
          <div className="flex items-center gap-2">
            <h1 className="max-w-[560px] font-display text-4xl font-bold leading-[1.02] tracking-[-0.03em] text-white sm:text-[54px]">
              Periférico bom,
              <br />
              sem golpe.
            </h1>
            <MarketInfoDialog />
          </div>
          {/* O artboard mobile corta o subtítulo — a headline e o CTA já ocupam
              a área legível sobre a mascote em 390px. */}
          <p className="hidden max-w-[420px] text-[15px] font-medium leading-[1.55] text-white/70 sm:block">
            Cada item passa pela bancada antes de entrar no anúncio — e a review da comunidade fica na página do produto.
          </p>
          <a
            href="#produtos"
            className="mt-1 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-extrabold text-[#04140d] transition-opacity hover:opacity-90 sm:w-auto sm:justify-start sm:gap-[9px] sm:px-[26px]"
          >
            Ver todos os produtos
            <ArrowRight className="size-4" strokeWidth={2.4} />
          </a>
        </div>
      </div>

      {/* Faixa de confiança — consolida o que antes estava espalhado nos 2
          chips do hero + nos 3 cards grandes no rodapé da página. */}
      <div className="border-b border-[#1c1c1c] bg-[#060606]">
        <div className="mx-auto grid max-w-7xl grid-cols-1 px-4 sm:grid-cols-3 lg:px-8">
          {[
            { icon: QrCode, title: "PIX na hora", desc: "chave gerada no checkout" },
            { icon: ShieldCheck, title: "Testado antes de anunciar", desc: "bancada Sunano" },
            { icon: Package, title: "Pedido acompanhado", desc: "status direto na sua conta" },
          ].map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              className={cn(
                "flex items-center justify-center gap-[11px] px-6 py-[18px]",
                i > 0 && "border-t border-[#1c1c1c] sm:border-l sm:border-t-0"
              )}
            >
              <Icon className="size-[17px] shrink-0 text-emerald-400" strokeWidth={1.9} />
              <span className="text-[12.5px] font-bold text-[#e8e8e8]">{title}</span>
              <span className="hidden text-xs text-[#7a7a7a] sm:inline">{desc}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-9 px-4 pb-10 pt-7 sm:gap-14 sm:pb-[72px] sm:pt-12 lg:px-8">
        {/* Categorias */}
        {categoryOptions.length > 0 && (
          <section className="flex flex-col gap-3.5 sm:gap-[18px]">
            <div className="flex flex-col gap-[3px] sm:gap-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a] sm:text-[10.5px]">Navegar</p>
              <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">Comprar por categoria</h2>
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
          <section className="flex flex-col gap-3.5 sm:gap-[18px]">
            <div className="flex items-end justify-between gap-3 sm:gap-4">
              <div className="flex flex-col gap-[3px] sm:gap-1">
                <p className="flex items-center gap-[5px] text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a] sm:gap-1.5 sm:text-[10.5px]">
                  <FeaturedIcon className="size-[11px] fill-amber-400 text-amber-400 sm:size-3" strokeWidth={0} />
                  Destaques
                </p>
                <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">{featuredLabel}</h2>
              </div>
              <div className="flex items-center gap-2.5">
                <a
                  href="#produtos"
                  className="text-[12.5px] font-bold text-[#999999] transition-colors hover:text-white sm:text-[13px]"
                >
                  Ver tudo
                </a>
                <div className="hidden items-center gap-2.5 sm:flex">
                  <button
                    type="button"
                    onClick={() => featuredScrollRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
                    aria-label="Rolar para trás"
                    className="flex size-8 items-center justify-center rounded-[10px] border border-[#2a2a2a] text-[#6e6e6e] transition-colors hover:text-white"
                  >
                    <ChevronLeft className="size-[15px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => featuredScrollRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
                    aria-label="Rolar para frente"
                    className="flex size-8 items-center justify-center rounded-[10px] border border-[#333333] text-[#dcdcdc] transition-colors hover:bg-white/5 hover:text-white"
                  >
                    <ChevronRight className="size-[15px]" />
                  </button>
                </div>
              </div>
            </div>
            <div ref={featuredScrollRef} className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin] sm:gap-3.5">
              {featuredItems.map((product) => (
                <div key={product.id} className="w-[168px] shrink-0 sm:w-[232px]">
                  <ProductCard {...product} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Catálogo */}
        <section id="produtos" className="flex scroll-mt-20 flex-col gap-3.5 sm:gap-[18px]">
          <div className="flex flex-col gap-[3px] sm:gap-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a] sm:text-[10.5px]">Catálogo completo</p>
            <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">Todos os produtos</h2>
          </div>

          {/* Mobile: um botão "Filtros" com contador, e a contagem à direita. */}
          <div className="flex items-center gap-2.5 md:hidden">
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-11 items-center gap-[7px] rounded-xl border border-[#2a2a2a] bg-[#141414] px-4 text-[12.5px] font-bold text-[#e8e8e8]"
                >
                  <SlidersHorizontal className="size-[15px]" strokeWidth={1.9} />
                  Filtros
                  {activeFiltersCount > 0 && (
                    <span className="flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[9.5px] font-extrabold text-[#04140d]">
                      {activeFiltersCount}
                    </span>
                  )}
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2.5">
                {renderFilters(MOBILE_TRIGGER_CLASS)}
                <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
                  <SelectTrigger className={MOBILE_TRIGGER_CLASS}>
                    <SelectValue>{SORT_LABEL[sortKey]}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="recent">Mais recentes</SelectItem>
                    <SelectItem value="name-asc">Nome A-Z</SelectItem>
                    <SelectItem value="name-desc">Nome Z-A</SelectItem>
                    <SelectItem value="price-asc">Menor preço</SelectItem>
                    <SelectItem value="price-desc">Maior preço</SelectItem>
                  </SelectContent>
                </Select>
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={resetFilters} className="gap-1.5 text-muted-foreground">
                    <X className="size-3.5" />
                    Limpar ({activeFiltersCount})
                  </Button>
                )}
              </PopoverContent>
            </Popover>
            <span className="ml-auto flex items-center gap-2 text-[12.5px] font-semibold text-[#8a8a8a]">
              <b className="text-white">{total}</b> produto{total !== 1 ? "s" : ""}
              {isFetching && <Loader2 className="size-3.5 animate-spin text-[#8a8a8a]" />}
            </span>
          </div>

          {/* Desktop: a fileira compacta do mock — a busca não aparece aqui,
              ela vive na faixa de categorias logo acima. */}
          <div className="hidden flex-wrap items-center gap-2.5 rounded-[14px] border border-[#262626] bg-card px-3.5 py-3 md:flex">
            <span className="inline-flex shrink-0 items-center gap-[7px] border-r border-[#262626] pr-3 text-xs font-bold text-[#8a8a8a]">
              <SlidersHorizontal className="size-3.5" strokeWidth={1.9} />
              Filtros
            </span>

            {renderFilters(TRIGGER_CLASS)}

            <span className="ml-auto flex items-center gap-1.5 text-[12.5px] font-semibold text-[#8a8a8a]">
              <b className="text-white">{total}</b> produto{total !== 1 ? "s" : ""}
              {isFetching && <Loader2 className="size-3.5 animate-spin text-[#8a8a8a]" />}
            </span>

            {activeFiltersCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                className="h-9 gap-1.5 text-[12.5px] text-[#8a8a8a] hover:text-white"
              >
                <X className="size-3.5" />
                Limpar ({activeFiltersCount})
              </Button>
            )}

            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="flex h-9 w-auto items-center gap-[7px] whitespace-nowrap rounded-[10px] border border-white bg-white px-3.5 text-[12.5px] font-bold text-black hover:opacity-90">
                <SelectValue>{SORT_LABEL[sortKey]}</SelectValue>
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

          {isFetching ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4">
              {Array.from({ length: items.length > 0 ? items.length : pageSize }).map((_, idx) => (
                <ProductCardSkeleton key={idx} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-[18px] border border-[#262626] bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">Tente ajustar os filtros.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} {...product} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1 || isFetching}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                aria-label="Página anterior"
                className="flex h-[34px] min-w-[34px] items-center justify-center rounded-[10px] border border-[#2a2a2a] text-[#6e6e6e] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[#6e6e6e]"
              >
                <ChevronLeft className="size-[15px]" />
              </button>
              {buildPageList(page, totalPages).map((p, idx) =>
                p === "ellipsis" ? (
                  <span key={`e${idx}`} className="px-1 text-xs font-semibold text-[#6e6e6e]">
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
                      "flex h-[34px] min-w-[34px] items-center justify-center rounded-[10px] border px-2.5 text-[12.5px] font-bold transition-colors",
                      p === page
                        ? "border-white bg-white text-black"
                        : "border-[#2a2a2a] text-[#8a8a8a] hover:text-white"
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
                className="flex h-[34px] min-w-[34px] items-center justify-center rounded-[10px] border border-[#2a2a2a] text-[#6e6e6e] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-[#6e6e6e]"
              >
                <ChevronRight className="size-[15px]" />
              </button>
            </div>
          )}
        </section>

      </div>
    </div>
  )
}
