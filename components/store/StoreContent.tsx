"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Flame, Handshake, Loader2, Package, PackageSearch, ShieldCheck, Sparkles, Star, Tag, TrendingUp, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthUser } from "@/components/providers/auth-context"
import { usePageHeader } from "@/components/providers/page-header-context"
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard"
import { CategoryTiles } from "@/components/store/CategoryTiles"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"
import {
  countActiveFilters,
  EMPTY_STORE_FILTERS,
  StoreFilters,
  type StoreFilterState,
  type StoreSortKey,
} from "@/components/store/StoreFilters"
import { MarketInfoDialog } from "@/components/store/MarketInfoDialog"
import { TrustStrip } from "@/components/store/TrustStrip"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"
import type { StoreProductCard, StoreFilterOptions } from "@/lib/server/repositories/store-repository"
import type { StoreBannerSection, StoreSectionBanner } from "@/lib/server/repositories/store-banners-repository"
import SectionBannerCarousel, { type SectionCarouselBanner } from "@/components/store/SectionBannerCarousel"

/** Contexto de "loja filtrada" (landing de categoria ou marca) — troca o hero
 *  padrão por um banner e pré-seleciona o filtro correspondente. */
export type StoreBanner =
  | { type: "category"; value: string }
  | { type: "brand"; value: string }

interface StoreContentProps {
  initialItems: StoreProductCard[]
  initialTotal: number
  initialFilterOptions: StoreFilterOptions
  initialFeatured: StoreProductCard[]
  /** Produtos em pré-venda (todo o catálogo, não só a página atual) — seção dedicada abaixo dos Destaques. */
  preOrderItems?: StoreProductCard[]
  /** Produtos de pronta entrega (todo o catálogo, não só a página atual) — seção dedicada abaixo dos Destaques. */
  readyStockItems?: StoreProductCard[]
  /** Produtos institucionais/do site (category: "site") — seção "Itens para o site" da Home. */
  siteItems?: StoreProductCard[]
  /** Produtos da categoria "services" — seção "Serviços" da Home. */
  serviceItems?: StoreProductCard[]
  /** Mais vendidos nos últimos 90 dias (get_top_selling_products) — primeira seção da Home. */
  bestSellingItems?: StoreProductCard[]
  /** Banners ativos por seção — quando uma seção tem ao menos 1, ela vira carrossel em vez de grid. */
  sectionBanners?: Record<StoreBannerSection, StoreSectionBanner[]>
  pageSize: number
  banner?: StoreBanner
  /** Categoria pré-selecionada vinda de `?categoria=` — usado na landing de marca
   *  quando se chega via um link "marca dentro de categoria" (ex: menu de navegação). */
  initialCategory?: string | null
}

const EMPTY_SECTION_BANNERS: Record<StoreBannerSection, StoreSectionBanner[]> = {
  main: [],
  best_sellers: [],
  pre_sale: [],
  ready_stock: [],
  site_items: [],
}

/** Mapeia as colunas snake_case do banco para as props camelCase do carrossel. */
function toCarouselBanners(banners: StoreSectionBanner[]): SectionCarouselBanner[] {
  return banners.map((banner) => ({
    id: banner.id,
    imageUrl: banner.image_url,
    videoUrl: banner.video_url,
    title: banner.title,
    subtitle: banner.subtitle,
    ctaText: banner.cta_text,
    ctaLink: banner.cta_link,
  }))
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

/** Banner das landings de categoria/marca — substitui o hero padrão da Loja. */
function StoreBannerHero({
  banner,
  productCount,
  activeCategory,
}: {
  banner: StoreBanner
  productCount: number
  /** Categoria também ativa junto da marca (veio de `?categoria=`) — mostra o recorte no subtítulo. */
  activeCategory?: string | null
}) {
  const isCategory = banner.type === "category"
  const { icon: Icon, tint } = isCategory ? getCategoryIcon(banner.value) : { icon: Tag, tint: "oklch(0.65 0.01 260)" }

  return (
    <div
      className="relative overflow-hidden border-b border-[#1c1c1c] bg-[#0b0f14] py-10 sm:py-14"
      style={{ background: `radial-gradient(120% 140% at 85% 0%, color-mix(in oklab, ${tint} 16%, #0b0f14), #0b0f14)` }}
    >
      <Icon
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-8 -right-6 size-[220px] opacity-[0.08] sm:size-[280px]"
        style={{ color: tint }}
        strokeWidth={0.9}
      />
      <div className="relative mx-auto flex max-w-7xl flex-col gap-3 px-4 lg:px-8">
        <Link
          href="/loja"
          className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#9a9a9a] transition-colors hover:text-white"
        >
          <ArrowLeft className="size-3.5" />
          Voltar à loja
        </Link>
        <div className="flex items-center gap-3.5">
          <span
            className="flex size-14 shrink-0 items-center justify-center rounded-2xl border border-white/10"
            style={{ background: `color-mix(in oklab, ${tint} 18%, #0e0e0e)` }}
          >
            <Icon className="size-7" style={{ color: tint }} strokeWidth={1.4} />
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">
              {isCategory ? "Categoria" : "Marca"}
            </span>
            <h1 className="font-display text-3xl font-bold capitalize leading-tight tracking-[-0.02em] text-white sm:text-[42px]">
              {isCategory ? getCategoryLabel(banner.value) : banner.value}
            </h1>
          </div>
        </div>
        <p className="text-[13px] font-semibold text-[#9a9a9a]">
          {productCount} produto{productCount === 1 ? "" : "s"} {isCategory ? "nessa categoria" : "dessa marca"}
          {!isCategory && activeCategory ? ` em "${activeCategory}"` : ""}
        </p>
      </div>
    </div>
  )
}

/**
 * Cabeçalho (eyebrow + título) das seções dinâmicas da Home da Loja — o mesmo
 * usado dentro de `ProductCarouselSection`, mas extraído para também ficar
 * acima de `SectionBannerCarousel`, que não tem cabeçalho próprio.
 */
function SectionHeading({
  eyebrow,
  title,
  icon: Icon,
  iconClassName,
}: {
  eyebrow: string
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  iconClassName: string
}) {
  return (
    <div className="flex flex-col gap-[3px] sm:gap-1">
      <p className="flex items-center gap-[5px] text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] text-[#7a7a7a] sm:gap-1.5 sm:text-[10.5px]">
        <Icon className={cn("size-[11px] shrink-0 sm:size-3", iconClassName)} strokeWidth={2.2} />
        {eyebrow}
      </p>
      <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">{title}</h2>
    </div>
  )
}

/** Carrossel horizontal reutilizado por Destaques e Disponibilidade (pronta entrega + pré-venda). */
function ProductCarouselSection({
  items,
  eyebrow,
  title,
  icon: Icon,
  iconClassName,
}: {
  items: StoreProductCard[]
  eyebrow: string
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  iconClassName: string
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const showCarouselControls = items.length > 5

  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-3.5 sm:gap-[18px]">
      <div className="flex items-end justify-between gap-3 sm:gap-4">
        <div className="flex flex-col gap-[3px] sm:gap-1">
          <p className="flex items-center gap-[5px] text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] text-[#7a7a7a] sm:gap-1.5 sm:text-[10.5px]">
            <Icon className={cn("size-[11px] shrink-0 sm:size-3", iconClassName)} strokeWidth={2.2} />
            {eyebrow}
          </p>
          <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">{title}</h2>
        </div>
        {showCarouselControls && (
          <div className="hidden items-center gap-2.5 sm:flex">
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
              aria-label="Rolar para trás"
              className="flex size-8 items-center justify-center rounded-[10px] border border-[#2a2a2a] text-[#6e6e6e] transition-colors hover:text-white"
            >
              <ChevronLeft className="size-[15px]" />
            </button>
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
              aria-label="Rolar para frente"
              className="flex size-8 items-center justify-center rounded-[10px] border border-[#333333] text-[#dcdcdc] transition-colors hover:bg-white/5 hover:text-white"
            >
              <ChevronRight className="size-[15px]" />
            </button>
          </div>
        )}
      </div>
      <div ref={scrollRef} className="-mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-2 scrollbar-hide sm:gap-3.5 lg:-mx-8 lg:px-8">
        {items.map((product) => (
          <div key={product.id} className="w-[188px] shrink-0 sm:w-[258px]">
            <ProductCard {...product} />
          </div>
        ))}
      </div>
    </section>
  )
}

export function StoreContent({ initialItems, initialTotal, initialFilterOptions, initialFeatured, preOrderItems = [], readyStockItems = [], siteItems = [], serviceItems = [], bestSellingItems = [], sectionBanners = EMPTY_SECTION_BANNERS, pageSize, banner, initialCategory = null }: StoreContentProps) {
  const searchParams = useSearchParams()
  const { user } = useAuthUser()

  // A TopBar cai no fallback "Sunano" sem isso — /loja não está no mapa de
  // títulos por rota (getPageDefaults em TopBar.tsx). Descrição curta de
  // propósito: o grupo esquerdo da TopBar é `shrink-0` (TopBar.tsx), então
  // o `truncate` do span nunca entra em ação — uma string longa empurra os
  // botões da direita (carrinho/login) pra fora da tela no mobile.
  usePageHeader("Loja", "PIX na hora, testado antes de anunciar")

  // A landing manda no recorte: em /loja/categoria/mouse o cliente está dentro
  // de "mouse" e ponto — a categoria some da barra de filtros em vez de virar
  // um combo onde dava pra somar "teclado" e receber uma grade que não tem nada
  // a ver com a página. Mesma regra pra marca em /loja/marca/<x>.
  const lockedCategory = banner?.type === "category" ? banner.value : null
  const lockedBrand = banner?.type === "brand" ? banner.value : null

  const [filters, setFilters] = useState<StoreFilterState>(() => ({
    ...EMPTY_STORE_FILTERS,
    query: searchParams.get("q") ?? "",
    categories: lockedCategory ? [lockedCategory] : initialCategory ? [initialCategory] : [],
    brands: lockedBrand ? [lockedBrand] : [],
  }))
  const patchFilters = (patch: Partial<StoreFilterState>) => setFilters((prev) => ({ ...prev, ...patch }))
  const resetFilters = () =>
    setFilters({
      ...EMPTY_STORE_FILTERS,
      categories: lockedCategory ? [lockedCategory] : [],
      brands: lockedBrand ? [lockedBrand] : [],
    })

  const debouncedQuery = useDebouncedValue(filters.query, 400)
  const [sortKey, setSortKey] = useState<StoreSortKey>("recent")
  const [page, setPage] = useState(1)

  // Buscar de novo estando já em /loja não remonta o componente — sem isso o
  // `?q=` novo entrava na URL e a grade continuava mostrando a busca anterior.
  const urlQuery = searchParams.get("q") ?? ""
  useEffect(() => {
    setFilters((prev) => (prev.query === urlQuery ? prev : { ...prev, query: urlQuery }))
  }, [urlQuery])

  const [filterOptions, setFilterOptions] = useState<StoreFilterOptions>(initialFilterOptions)
  useEffect(() => {
    const params = new URLSearchParams()
    params.set("type", "store")
    fetch(`/api/store/filter-options?${params}`)
      .then((res) => res.json())
      .then((data: StoreFilterOptions) => setFilterOptions(data))
      .catch(() => {})
  }, [])

  // Facetas do recorte da página, não do catálogo inteiro: dentro de "mouse" as
  // marcas, faixas de preço e contagens são as de mouse.
  const facets = useMemo(() => {
    if (lockedCategory) return filterOptions.facetsByCategory[lockedCategory] ?? filterOptions.facets
    if (lockedBrand) return filterOptions.facetsByBrand[lockedBrand] ?? filterOptions.facets
    return filterOptions.facets
  }, [filterOptions, lockedCategory, lockedBrand])

  useEffect(() => {
    setFilters((prev) => {
      const categories = prev.categories.filter((c) => filterOptions.categories.includes(c))
      const brands = prev.brands.filter((b) => filterOptions.brands.includes(b))
      if (categories.length === prev.categories.length && brands.length === prev.brands.length) return prev
      return { ...prev, categories, brands }
    })
  }, [filterOptions.categories, filterOptions.brands])

  // Uma chave só pros efeitos abaixo — o estado de filtro virou objeto, então
  // comparar campo a campo na lista de dependências não escala mais.
  const filterKey = useMemo(
    () => JSON.stringify({ ...filters, query: debouncedQuery.trim() }),
    [filters, debouncedQuery]
  )

  // Estado de resultado: itens da página atual, servidos pelo servidor
  // (banco pagina/filtra, não mais o browser). `items`/`total` só trocam
  // quando o fetch termina — mantém a grade anterior visível durante a
  // troca de filtro (via `isFetching`), evitando layout shift.
  const [items, setItems] = useState<StoreProductCard[]>(initialItems)
  const [total, setTotal] = useState(initialTotal)
  const [isFetching, setIsFetching] = useState(false)
  // "Carregar mais" do mobile soma a próxima página aos itens já carregados
  // em vez de substituir — o mesmo grid serve os dois breakpoints, então o
  // fetch effect abaixo lê essa ref pra saber se deve acumular ou trocar.
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const appendNextRef = useRef(false)
  const isFirstRun = useRef(true)
  const featuredScrollRef = useRef<HTMLDivElement>(null)

  // Volta pra página 1 sempre que um filtro (não a página em si) muda.
  useEffect(() => {
    setPage(1)
  }, [filterKey, sortKey])

  useEffect(() => {
    const params = new URLSearchParams()
    params.set("type", "store")
    if (filters.categories.length > 0) params.set("categories", filters.categories.join(","))
    if (filters.brands.length > 0) params.set("brands", filters.brands.join(","))
    if (filters.conditions.length > 0) params.set("conditions", filters.conditions.join(","))
    if (filters.saleTypes.length > 0) params.set("saleTypes", filters.saleTypes.join(","))
    if (filters.promoOnly) params.set("promo", "1")
    if (filters.inStockOnly) params.set("inStock", "1")
    if (debouncedQuery.trim()) params.set("search", debouncedQuery.trim())
    if (filters.price) {
      params.set("priceMin", String(filters.price[0] * 100))
      params.set("priceMax", String(filters.price[1] * 100))
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

    const appending = appendNextRef.current
    appendNextRef.current = false
    if (appending) setIsLoadingMore(true)
    else setIsFetching(true)
    const controller = new AbortController()
    fetch(`/api/store/products?${params}`, { signal: controller.signal })
      .then((res) => res.json())
      .then((data: { items: StoreProductCard[]; total: number }) => {
        setItems((prev) => (appending ? [...prev, ...data.items] : data.items))
        setTotal(data.total)
      })
      .catch((err) => {
        if (err?.name !== "AbortError" && !appending) setItems([])
      })
      .finally(() => (appending ? setIsLoadingMore(false) : setIsFetching(false)))
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, sortKey, page, pageSize])

  // Mobile: acumula a próxima página no grid já visível, em vez da paginação
  // numérica do desktop.
  const loadMore = () => {
    appendNextRef.current = true
    setPage((p) => p + 1)
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

  // Pronta entrega primeiro (compra imediata), pré-venda depois — cada
  // ProductCard já traz o badge do tipo, então uma fileira só basta.
  const availabilityItems = useMemo(
    () => [...readyStockItems, ...preOrderItems],
    [readyStockItems, preOrderItems]
  )

  const activeCategory = filters.categories.length === 1 ? filters.categories[0] : null
  const activeFiltersCount = countActiveFilters(filters, lockedCategory, lockedBrand)

  // Com poucos itens todos já cabem na tela sem rolar — "ver tudo" e as setas
  // de carrossel não fazem sentido até que sobre item fora da área visível.
  const showFeaturedCarouselControls = featuredItems.length > 5

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

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
        previewPool={[...initialFeatured, ...initialItems]}
      />

      {banner ? (
        <StoreBannerHero
          banner={banner}
          productCount={banner.type === "category" ? (initialFilterOptions.categoryCounts[banner.value] ?? total) : total}
          activeCategory={activeCategory}
        />
      ) : (
        <div className="relative">
          {sectionBanners.main.length > 0 ? (
            <SectionBannerCarousel banners={toCarouselBanners(sectionBanners.main)} className="rounded-none border-0" />
          ) : (
            /* Fallback estático — mesma imagem de sempre, aspect-ratio dela
               própria (6047×1890) pra mostrar o banner inteiro em vez de
               cortar topo/laterais com bg-cover numa altura fixa. */
            <div
              className="aspect-[6047/1890] w-full overflow-hidden bg-[#0b0f14] bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: "url(/images/mascot/Loja.png)" }}
            />
          )}
          {user && (
            <Link
              href="/conta/pedidos"
              className="absolute right-4 top-4 z-[5] inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition-colors hover:border-emerald-400/40 hover:bg-emerald-500/10 hover:text-emerald-300"
            >
              <PackageSearch className="size-3.5" />
              Meus pedidos
            </Link>
          )}
        </div>
      )}

      <div className={cn(
        "mx-auto flex w-full max-w-7xl flex-col px-4 pb-10 sm:pb-[72px] lg:px-8",
        banner?.type === "category" ? "gap-5 pt-5 sm:gap-7 sm:pt-6" : "gap-9 pt-7 sm:gap-14 sm:pt-12"
      )}>
        {/* Trust strip — mesma regra dos Destaques: pula na landing de categoria
            (banner já deixa a área densa com a fileira de tags). */}
        {banner?.type !== "category" && <TrustStrip />}

        {/* Destaques — só na Home. Landing de marca/categoria vai direto pros
            filtros + catálogo, sem essa seção antes do que o usuário veio ver. */}
        {!banner && featuredItems.length > 0 && (
          <section className="flex flex-col gap-3.5 sm:gap-[18px]">
            <div className="flex items-end justify-between gap-3 sm:gap-4">
              <div className="flex flex-col gap-[3px] sm:gap-1">
                <p className="flex items-center gap-[5px] text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a] sm:gap-1.5 sm:text-[10.5px]">
                  <FeaturedIcon className="size-[11px] fill-amber-400 text-amber-400 sm:size-3" strokeWidth={0} />
                  Destaques
                </p>
                <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">{featuredLabel}</h2>
              </div>
              {showFeaturedCarouselControls && (
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
              )}
            </div>
            <div ref={featuredScrollRef} className="-mx-4 flex gap-3 overflow-x-auto px-4 pt-1 pb-2 scrollbar-hide sm:gap-3.5 lg:-mx-8 lg:px-8">
              {featuredItems.map((product) => (
                <div key={product.id} className="w-[188px] shrink-0 sm:w-[258px]">
                  <ProductCard {...product} />
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Pronta entrega + Pré-venda numa seção só — só na landing de marca
            (mesmo motivo dos Destaques acima). O badge de cada ProductCard já
            diferencia o tipo de venda, então separar em duas fileiras era
            redundante. Pronta entrega primeiro (compra imediata). */}
        {!banner && (
          <ProductCarouselSection
            items={availabilityItems}
            eyebrow="Disponibilidade"
            title="Pronta entrega e pré-venda"
            icon={Package}
            iconClassName="text-emerald-400"
          />
        )}

        {/* Seções dinâmicas da Home — só na Loja geral (sem banner). Cada uma
            só existe se tiver produto (ProductCarouselSection já retorna null
            vazia); não há fallback estático. */}
        {!banner && (
          <>
            {sectionBanners.best_sellers.length > 0 ? (
              <section className="flex flex-col gap-3.5 sm:gap-[18px]">
                <SectionHeading eyebrow="Popularidade" title="Mais vendidos" icon={TrendingUp} iconClassName="text-amber-400" />
                <SectionBannerCarousel banners={toCarouselBanners(sectionBanners.best_sellers)} />
              </section>
            ) : (
              <ProductCarouselSection
                items={bestSellingItems}
                eyebrow="Popularidade"
                title="Mais vendidos"
                icon={TrendingUp}
                iconClassName="text-amber-400"
              />
            )}
            {sectionBanners.pre_sale.length > 0 ? (
              <section className="flex flex-col gap-3.5 sm:gap-[18px]">
                <SectionHeading eyebrow="Lançamento" title="Pré-venda 🔥🔥🔥" icon={Flame} iconClassName="text-orange-400" />
                <SectionBannerCarousel banners={toCarouselBanners(sectionBanners.pre_sale)} />
              </section>
            ) : (
              <ProductCarouselSection
                items={preOrderItems}
                eyebrow="Lançamento"
                title="Pré-venda 🔥🔥🔥"
                icon={Flame}
                iconClassName="text-orange-400"
              />
            )}
            {sectionBanners.ready_stock.length > 0 ? (
              <section className="flex flex-col gap-3.5 sm:gap-[18px]">
                <SectionHeading eyebrow="Envio imediato" title="Pronta entrega 📦" icon={Package} iconClassName="text-emerald-400" />
                <SectionBannerCarousel banners={toCarouselBanners(sectionBanners.ready_stock)} />
              </section>
            ) : (
              <ProductCarouselSection
                items={readyStockItems}
                eyebrow="Envio imediato"
                title="Pronta entrega 📦"
                icon={Package}
                iconClassName="text-emerald-400"
              />
            )}
            {sectionBanners.site_items.length > 0 ? (
              <section className="flex flex-col gap-3.5 sm:gap-[18px]">
                <SectionHeading eyebrow="Sunano" title="Itens para o site 🤝" icon={Handshake} iconClassName="text-sky-400" />
                <SectionBannerCarousel banners={toCarouselBanners(sectionBanners.site_items)} />
              </section>
            ) : (
              <ProductCarouselSection
                items={siteItems}
                eyebrow="Sunano"
                title="Itens para o site 🤝"
                icon={Handshake}
                iconClassName="text-sky-400"
              />
            )}
            <ProductCarouselSection
              items={serviceItems}
              eyebrow="Sunano"
              title="Serviços"
              icon={Wrench}
              iconClassName="text-violet-400"
            />
          </>
        )}

        {/* Catálogo — landings de categoria/marca sempre mostram; na Home
            só aparece quando há uma busca ativa (StoreSearchBox navega pra
            cá com ?q=...#produtos mesmo sem banner). Sem isso a busca fica
            sem lugar pra mostrar resultado na Home. */}
        {(banner || filters.query.trim()) && (
        <section id="produtos" className="flex scroll-mt-20 flex-col gap-3.5 sm:gap-[18px]">
          <div className="flex flex-col gap-[3px] sm:gap-1">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a] sm:text-[10.5px]">Catálogo completo</p>
            <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">Todos os produtos</h2>
          </div>

          <StoreFilters
            state={filters}
            onChange={patchFilters}
            onReset={resetFilters}
            facets={facets}
            lockedCategory={lockedCategory}
            lockedBrand={lockedBrand}
            sortKey={sortKey}
            onSortChange={setSortKey}
            total={total}
            isFetching={isFetching}
          />

          {isFetching ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4">
              {Array.from({ length: items.length > 0 ? items.length : pageSize }).map((_, idx) => (
                <ProductCardSkeleton key={idx} />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center rounded-[18px] border border-[#262626] bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">Nenhum produto encontrado.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                {activeFiltersCount > 0 ? "Nenhum produto bate com todos os filtros." : "Tente outra busca."}
              </p>
              {activeFiltersCount > 0 && (
                <button
                  type="button"
                  onClick={resetFilters}
                  className="mt-4 inline-flex h-9 items-center rounded-[10px] border border-[#2a2a2a] bg-[#141414] px-4 text-[12.5px] font-bold text-[#e8e8e8] transition-colors hover:border-foreground/25"
                >
                  Limpar filtros
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4">
              {items.map((product) => (
                <ProductCard key={product.id} {...product} />
              ))}
            </div>
          )}

          {/* Desktop: paginação numérica. */}
          {totalPages > 1 && (
            <div className="mt-4 hidden items-center justify-center gap-1.5 md:flex">
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

          {/* Mobile: "Carregar mais" em vez de páginas numeradas. */}
          {items.length < total && (
            <div className="mt-1 flex justify-center md:hidden">
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={loadMore}
                className="flex h-11 items-center gap-2 rounded-xl border border-[#2a2a2a] bg-[#141414] px-6 text-[12.5px] font-bold text-[#e8e8e8] transition-colors disabled:opacity-60"
              >
                {isLoadingMore && <Loader2 className="size-3.5 animate-spin" />}
                Carregar mais
              </button>
            </div>
          )}
        </section>
        )}

        {/* Categorias — só aparece na Loja geral. Na landing de categoria a
            navegação já vive inteira no menu do header (StoreCategoryNav),
            sem repetir a mesma lista aqui embaixo. */}
        {filterOptions.categories.length > 0 && banner?.type !== "category" && (
          <section className="flex flex-col gap-3.5 sm:gap-[18px]">
            <div className="flex flex-col gap-[3px] sm:gap-1">
              <p className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a] sm:text-[10.5px]">Navegar</p>
              <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">Comprar por categoria</h2>
            </div>
            <CategoryTiles
              categories={filterOptions.categories}
              categoryCounts={filterOptions.categoryCounts}
            />
          </section>
        )}

      </div>
    </div>
  )
}
