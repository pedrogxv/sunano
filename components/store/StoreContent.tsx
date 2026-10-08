"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Flame, Handshake, Loader2, ShieldCheck, Sparkles, Star, Tag, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { usePageHeader } from "@/components/providers/page-header-context"
import { LaunchPreorderSection } from "@/components/store/LaunchPreorderSection"
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard"
import { CategoryTiles } from "@/components/store/CategoryTiles"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"
import {
  ActiveFilterChips,
  buildActiveChips,
  countActiveFilters,
  EMPTY_STORE_FILTERS,
  StoreFilters,
  StoreSortSelect,
  type StoreFilterState,
  type StoreSortKey,
} from "@/components/store/StoreFilters"
import { StoreCatalogMobileFilters, StoreCatalogSidebar, StoreFiltersButton, StoreQuickFilters } from "@/components/store/StoreCatalogFilters"
import { MarketInfoDialog } from "@/components/store/MarketInfoDialog"
import { StoreAuthorityStrip } from "@/components/store/StoreAuthorityStrip"
import { StoreHero } from "@/components/store/StoreHero"
import { useDebouncedValue } from "@/lib/hooks/use-debounced-value"
import { getCategoryIcon, getCategoryLabel } from "@/lib/store-category-icons"
import {
  catalogConfigFor,
  categoryPageScope,
  findPriceBand,
  parseCatalogParams,
  writeCatalogParams,
  type CatalogUrlState,
} from "@/lib/store-catalog"
import type { StoreHeroTrust, StoreHeroView } from "@/lib/store-hero"
import type { StoreProductCard, StoreFilterOptions } from "@/lib/server/repositories/store-repository"
import type { StoreSectionBanner } from "@/lib/server/repositories/store-banners-repository"
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
  /** Lançamentos marcados no admin (seção "Lançamentos e Pré-venda"). */
  launchItems?: StoreProductCard[]
  /** Slides do Hero no ar agora (/admin/store/hero). Vazio = arte estática de sempre. */
  heroSlides?: StoreHeroView[]
  /** Selos de curadoria e nota dos compradores, colados no Hero (/admin/store/hero). Só na Home. */
  heroTrust?: StoreHeroTrust
  /** Produtos institucionais/do site (category: "site") — seção "Itens para o site" da Home. */
  siteItems?: StoreProductCard[]
  /** Produtos da categoria "services" — seção "Serviços" da Home. */
  serviceItems?: StoreProductCard[]
  /** Mais vendidos nos últimos 90 dias (get_top_selling_products) — primeira seção da Home. */
  bestSellingItems?: StoreProductCard[]
  /** Banners do topo da landing de categoria (/admin/store/banners). Vazio = cabeçalho padrão. */
  categoryBanners?: StoreSectionBanner[]
  pageSize: number
  banner?: StoreBanner
  /** Categoria pré-selecionada vinda de `?categoria=` — usado na landing de marca
   *  quando se chega via um link "marca dentro de categoria" (ex: menu de navegação). */
  initialCategory?: string | null
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

/** Carrossel horizontal reutilizado pelas seções de produto da Home (pré-venda, mais vendidos, pronta entrega, etc). */
function ProductCarouselSection({
  items,
  eyebrow,
  title,
  icon: Icon,
  iconClassName,
  showcase = false,
}: {
  items: StoreProductCard[]
  eyebrow: string
  title: string
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>
  iconClassName: string
  /** Cards grandes e vistosos, para seções com poucos itens (Serviços). */
  showcase?: boolean
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const showCarouselControls = items.length > (showcase ? 3 : 5)

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
          <div
            key={product.id}
            className={cn("shrink-0", showcase ? "w-[264px] sm:w-[372px]" : "w-[188px] sm:w-[258px]")}
          >
            <ProductCard {...product} variant={showcase ? "showcase" : "default"} />
          </div>
        ))}
      </div>
    </section>
  )
}

export function StoreContent({ initialItems, initialTotal, initialFilterOptions, initialFeatured, preOrderItems = [], launchItems = [], heroSlides = [], heroTrust, siteItems = [], serviceItems = [], bestSellingItems = [], categoryBanners = [], pageSize, banner, initialCategory = null }: StoreContentProps) {
  const searchParams = useSearchParams()

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
  // O que a página lista: a categoria e as que ela inclui (Mousepad + Glasspad).
  const lockedCategories = useMemo(() => (lockedCategory ? categoryPageScope(lockedCategory) : null), [lockedCategory])
  const lockedBrand = banner?.type === "brand" ? banner.value : null
  // Página de categoria com catálogo próprio (Mouse, Teclado, Mousepad): tipos,
  // facetas do Database, chips rápidos e barra lateral. Ver lib/store-catalog.ts.
  const catalogConfig = useMemo(() => catalogConfigFor(lockedCategory), [lockedCategory])
  const isCategoryPage = Boolean(lockedCategory)

  // Na página de categoria os filtros moram na URL (`?tipo=ultraleves&marca=Lamzu`):
  // é para onde o mega menu aponta, e é o que faz "voltar" do produto
  // reencontrar a grade como estava.
  const [initialUrlState] = useState<CatalogUrlState | null>(() =>
    lockedCategory ? parseCatalogParams(new URLSearchParams(searchParams.toString()), lockedCategory) : null
  )

  // `?ofertas=1` é o destino do botão "Ver ofertas" do Hero: abre a vitrine
  // já recortada nos produtos em promoção.
  const [filters, setFilters] = useState<StoreFilterState>(() => ({
    ...EMPTY_STORE_FILTERS,
    query: searchParams.get("q") ?? "",
    categories: lockedCategories ?? (initialCategory ? [initialCategory] : []),
    brands: lockedBrand ? [lockedBrand] : initialUrlState?.brands ?? [],
    collections: initialUrlState?.collections ?? [],
    catalogFacets: initialUrlState?.facets ?? {},
    priceBand: initialUrlState?.priceBand ?? null,
    promoOnly: searchParams.get("ofertas") === "1",
  }))
  const patchFilters = (patch: Partial<StoreFilterState>) => setFilters((prev) => ({ ...prev, ...patch }))
  const resetFilters = () =>
    setFilters({
      ...EMPTY_STORE_FILTERS,
      categories: lockedCategories ?? [],
      brands: lockedBrand ? [lockedBrand] : [],
    })

  const debouncedQuery = useDebouncedValue(filters.query, 400)
  // "Mais relevantes" é o padrão, mas só existe com busca: sem termo não há o
  // que ranquear, e a ordem cai em "Mais recentes". Se a pessoa escolher outra
  // ordem, ela vale com ou sem busca.
  const [sortKey, setSortKey] = useState<StoreSortKey>(initialUrlState?.sort ?? "relevance")
  const hasQuery = debouncedQuery.trim().length > 0
  const effectiveSort: StoreSortKey = sortKey === "relevance" && !hasQuery ? "recent" : sortKey
  const [page, setPage] = useState(1)
  // Barra de filtros do desktop começa recolhida: o espaço vai para os
  // produtos, e o botão "Filtros" a abre. Chegar por um link já filtrado
  // (URL com filtro) abre de cara, para a pessoa ver o que está aplicado.
  const [showFilterSidebar, setShowFilterSidebar] = useState(
    () => initialUrlState != null && countActiveFilters(filters, lockedCategory, null) > 0
  )

  // Buscar de novo estando já em /loja não remonta o componente — sem isso o
  // `?q=` novo entrava na URL e a grade continuava mostrando a busca anterior.
  const urlQuery = searchParams.get("q") ?? ""
  useEffect(() => {
    setFilters((prev) => (prev.query === urlQuery ? prev : { ...prev, query: urlQuery }))
  }, [urlQuery])

  // Link do mega menu clicado já DENTRO da categoria (de "Ultraleves" para
  // "Magnésio") não remonta a página: os filtros da URL entram aqui. O link
  // do menu substitui o recorte inteiro, não soma ao que estava marcado.
  // Chave em string: o objeto do searchParams muda a cada render.
  const catalogSearch = lockedCategory ? searchParams.toString() : ""
  useEffect(() => {
    if (!lockedCategory) return
    const url = parseCatalogParams(new URLSearchParams(catalogSearch), lockedCategory)
    setFilters((prev) => {
      const next = {
        ...prev,
        brands: url.brands,
        collections: url.collections,
        catalogFacets: url.facets,
        priceBand: url.priceBand,
        price: url.priceBand ? null : prev.price,
      }
      const same =
        JSON.stringify([prev.brands, prev.collections, prev.catalogFacets, prev.priceBand]) ===
        JSON.stringify([next.brands, next.collections, next.catalogFacets, next.priceBand])
      return same ? prev : next
    })
    if (url.sort) setSortKey(url.sort)
  }, [catalogSearch, lockedCategory])

  // Mesmo motivo para `?ofertas=1`: o botão do Hero navega dentro de /loja.
  // Só LIGA o filtro: sair do parâmetro não desfaz uma escolha feita na barra.
  const urlOffers = searchParams.get("ofertas") === "1"
  useEffect(() => {
    if (urlOffers) setFilters((prev) => (prev.promoOnly ? prev : { ...prev, promoOnly: true }))
  }, [urlOffers])

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

  // Estado → URL na página de categoria. `replaceState` (e não push): marcar
  // cinco filtros não pode virar cinco "voltar" até sair da página. O Next
  // sincroniza o `useSearchParams` com ele, e o efeito acima vê o mesmo
  // recorte e não mexe em nada.
  useEffect(() => {
    if (!lockedCategory) return
    const current = new URLSearchParams(window.location.search)
    const next = writeCatalogParams(
      current,
      {
        collections: filters.collections,
        brands: filters.brands,
        priceBand: filters.priceBand,
        facets: filters.catalogFacets,
        sort: sortKey,
      },
      lockedCategory
    )
    if (next.toString() === current.toString()) return
    const search = next.toString()
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${search ? `?${search}` : ""}${window.location.hash}`)
  }, [filters.collections, filters.brands, filters.priceBand, filters.catalogFacets, sortKey, lockedCategory])

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
  // Página que já nasce filtrada (link do mega menu, `?ofertas=1`, ordem na
  // URL) recebeu do SSR a grade SEM o recorte — a página é ISR e não lê a URL.
  // Começa em "buscando" para mostrar o esqueleto, e não produtos que o filtro
  // vai tirar da tela meio segundo depois. Mesma condição do primeiro fetch abaixo.
  const [isFetching, setIsFetching] = useState(
    () => countActiveFilters(filters, lockedCategory ?? initialCategory, lockedBrand) > 0 || effectiveSort !== "recent"
  )
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
  }, [filterKey, effectiveSort])

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
    const band = filters.priceBand && catalogConfig ? findPriceBand(catalogConfig, filters.priceBand) : null
    if (band) {
      if (band.minCents != null) params.set("priceMin", String(band.minCents))
      if (band.maxCents != null) params.set("priceMax", String(band.maxCents))
    } else if (filters.price) {
      params.set("priceMin", String(filters.price[0] * 100))
      params.set("priceMax", String(filters.price[1] * 100))
    }
    if (filters.collections.length > 0) params.set("tipo", filters.collections.join(","))
    for (const [key, values] of Object.entries(filters.catalogFacets)) {
      if (values.length > 0) params.set(`f.${key}`, values.join(","))
    }
    if (effectiveSort !== "recent") params.set("sort", effectiveSort)
    params.set("page", String(page))
    params.set("pageSize", String(pageSize))

    // Na primeira renderização os dados já vieram do SSR com os mesmos
    // filtros padrão — evita um fetch redundante assim que a página monta.
    // Página que já nasce filtrada (`?ofertas=1`, link do mega menu, ordem
    // na URL) precisa buscar: o SSR mandou a grade sem recorte.
    if (isFirstRun.current) {
      isFirstRun.current = false
      // `?categoria=` da landing de marca já veio recortado do SSR, então não conta.
      if (page === 1 && countActiveFilters(filters, lockedCategory ?? initialCategory, lockedBrand) === 0 && effectiveSort === "recent") {
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
      .finally(() => {
        // Busca cancelada por outra mais nova NÃO desliga o "carregando": a
        // nova ainda está no ar, e desligar aqui fazia a grade voltar aos
        // `items` antigos (a lista SEM filtro que veio do SSR) por meio
        // segundo antes da resposta certa chegar.
        if (controller.signal.aborted) return
        if (appending) setIsLoadingMore(false)
        else setIsFetching(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey, effectiveSort, page, pageSize])

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

  // Na página de categoria é ela, mesmo listando mais de uma (Mousepad + Glasspad).
  const activeCategory = lockedCategory ?? (filters.categories.length === 1 ? filters.categories[0] : null)
  const activeFiltersCount = countActiveFilters(filters, lockedCategory, lockedBrand)

  // Catálogo: aparece em toda página da Loja. Na Home ele fecha a página
  // depois das seções (no lugar do antigo "Comprar por categoria") e é o
  // destino da busca (?q=...#produtos) e do "Ver ofertas" do Hero
  // (?ofertas=1#produtos).
  const catalogRef = useRef<HTMLElement>(null)

  // A âncora #produtos chega antes de o catálogo existir (ele só aparece
  // depois que o filtro da URL entra no estado), então a rolagem do navegador
  // não acha o alvo. Rola aqui, quando a seção passa a existir.
  useEffect(() => {
    if (banner || window.location.hash !== "#produtos") return
    catalogRef.current?.scrollIntoView({ block: "start" })
  }, [banner, urlQuery, urlOffers])

  // Com poucos itens todos já cabem na tela sem rolar — "ver tudo" e as setas
  // de carrossel não fazem sentido até que sobre item fora da área visível.
  const showFeaturedCarouselControls = featuredItems.length > 5

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const catalogCounts = lockedCategory ? filterOptions.catalogFacetsByCategory?.[lockedCategory] ?? null : null

  /** Grade + paginação: a mesma nos dois layouts do catálogo (com e sem barra lateral). */
  const catalogResults = (gridClass: string) => (
    <>
          {isFetching ? (
            <div className={gridClass}>
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
            <div className={gridClass}>
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
    </>
  )

  return (
    <div>
      {/* Faixa de aviso + categorias — vive na página, não é chrome global
          (sidebar cuida da navegação do site). Hover mostra marcas + 1 produto
          de exemplo, tudo a partir do que já está carregado no cliente. */}
      <StoreCategoryNav data={filterOptions} activeCategory={activeCategory} />

      {banner?.type === "category" && categoryBanners.length > 0 ? (
        /* Banner da categoria (/admin/store/banners) no lugar do cabeçalho
           padrão. O h1 fica para leitor de tela e busca: o título do banner
           é arte, não diz em que página a pessoa está. */
        <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:pt-6 lg:px-8">
          <h1 className="sr-only">{getCategoryLabel(banner.value)}</h1>
          <SectionBannerCarousel banners={toCarouselBanners(categoryBanners)} />
        </div>
      ) : banner ? (
        <StoreBannerHero
          banner={banner}
          productCount={
            lockedCategories
              ? lockedCategories.reduce((sum, category) => sum + (initialFilterOptions.categoryCounts[category] ?? 0), 0)
              : total
          }
          activeCategory={activeCategory}
        />
      ) : (
        /* Hero administrável (/admin/store/hero). Sem slide no ar, ele mesmo
           cai na arte estática de sempre. "Meus pedidos", que ficava em cima
           do banner, agora é "Pedidos" no menu da Loja. Os selos de
           curadoria vêm colados nele. */
        <StoreHero slides={heroSlides} trust={heroTrust} />
      )}

      <div className={cn(
        "mx-auto flex w-full max-w-7xl flex-col px-4 pb-10 sm:pb-[72px] lg:px-8",
        banner?.type === "category" ? "gap-5 pt-5 sm:gap-7 sm:pt-6" : "gap-9 pt-5 sm:gap-14 sm:pt-6"
      )}>
        {/* Argumentos de autoridade só na landing de marca. Na Home quem diz
            isso são os selos colados no Hero (mesma mensagem, administrável);
            na de categoria o banner já deixa a área densa com as tags. */}
        {banner?.type === "brand" && <StoreAuthorityStrip />}

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

        {/* Seções dinâmicas da Home, só na Loja geral (sem banner). Cada uma
            só existe se tiver produto (ProductCarouselSection já retorna null
            vazia). Pré-venda vem primeiro. */}
        {!banner && (
          <>
            {/* Só produto aqui. Banner de vitrine mora no topo da landing
                de cada categoria (`categoryBanners`); no meio da Home ele
                tomava o lugar dos cards. */}
            <LaunchPreorderSection preorders={preOrderItems} launches={launchItems} />
            <ProductCarouselSection
              items={bestSellingItems}
              eyebrow="Popularidade"
              title="Mais vendidos"
              icon={Flame}
              iconClassName="fill-current text-orange-500"
            />
            <ProductCarouselSection
              items={siteItems}
              eyebrow="Sunano"
              title="Itens para o site 🤝"
              icon={Handshake}
              iconClassName="text-sky-400"
            />
            <ProductCarouselSection
              items={serviceItems}
              eyebrow="Sunano"
              title="Serviços"
              icon={Wrench}
              iconClassName="text-violet-400"
              showcase
            />
          </>
        )}

        {/* Catálogo: ver o comentário de `catalogRef`. */}
        {isCategoryPage && (
        <section ref={catalogRef} id="produtos" className="flex scroll-mt-20 flex-col gap-4">
          {/* Topo: filtros rápidos ("Para FPS", "Ultraleves", "Até R$500"). */}
          <StoreQuickFilters config={catalogConfig} counts={catalogCounts} state={filters} onChange={patchFilters} />

          <div
            className={cn(
              "grid gap-6",
              showFilterSidebar && "lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[256px_minmax(0,1fr)]"
            )}
          >
            {/* Desktop: filtros completos na esquerda, presos ao rolar — só
                quando a pessoa abre pelo botão "Filtros". Fechada, a grade
                usa a largura toda. */}
            <div className={cn("hidden", showFilterSidebar && "lg:block")}>
              <div className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[16px] border border-[#262626] bg-card px-4 py-3.5 [scrollbar-width:thin]">
                <StoreCatalogSidebar
                  config={catalogConfig}
                  counts={catalogCounts}
                  facets={facets}
                  state={filters}
                  onChange={patchFilters}
                  onReset={resetFilters}
                  lockedCategory={lockedCategory}
                />
              </div>
            </div>

            <div className="flex min-w-0 flex-col gap-3.5">
              <div className="flex items-center gap-2.5">
                <div className="lg:hidden">
                  <StoreCatalogMobileFilters
                    config={catalogConfig}
                    counts={catalogCounts}
                    facets={facets}
                    state={filters}
                    onChange={patchFilters}
                    onReset={resetFilters}
                    lockedCategory={lockedCategory}
                    total={total}
                    isFetching={isFetching}
                  />
                </div>
                <div className="hidden lg:block">
                  <StoreFiltersButton
                    activeCount={countActiveFilters(filters, lockedCategory, null)}
                    pressed={showFilterSidebar}
                    onClick={() => setShowFilterSidebar((value) => !value)}
                  />
                </div>
                <span className="flex items-center gap-2 text-[12.5px] font-semibold text-[#8a8a8a]">
                  <b className="text-white">{total}</b> produto{total !== 1 ? "s" : ""}
                  {isFetching && <span className="size-1.5 animate-pulse rounded-full bg-emerald-400" />}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <span className="hidden text-[12px] font-semibold text-[#7a7a7a] sm:inline">Ordenar por</span>
                  <StoreSortSelect
                    value={effectiveSort}
                    onChange={setSortKey}
                    hasQuery={hasQuery}
                    className="flex h-10 w-auto items-center gap-[7px] whitespace-nowrap rounded-xl border border-[#2a2a2a] bg-[#141414] px-3.5 text-[12.5px] font-bold text-white hover:border-foreground/25"
                  />
                </div>
              </div>

              <ActiveFilterChips
                chips={buildActiveChips(filters, patchFilters, lockedCategory, lockedBrand, catalogConfig)}
              />

              {catalogResults(
                cn(
                  "grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5",
                  !showFilterSidebar && "lg:grid-cols-4"
                )
              )}
            </div>
          </div>
        </section>
        )}

        {!isCategoryPage && (
        <section ref={catalogRef} id="produtos" className="flex scroll-mt-20 flex-col gap-3.5 sm:gap-[18px]">
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
            sortKey={effectiveSort}
            onSortChange={setSortKey}
            total={total}
            isFetching={isFetching}
          />

          {catalogResults("grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4")}
        </section>
        )}

        {/* Categorias — só na landing de marca. Na Home o fim da página é o
            catálogo de produtos, e na de categoria a navegação já vive inteira
            no menu do header (StoreCategoryNav). */}
        {filterOptions.categories.length > 0 && banner?.type === "brand" && (
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
