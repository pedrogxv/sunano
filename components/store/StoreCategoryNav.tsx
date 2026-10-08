"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, ChevronLeft, ChevronRight, Home, LifeBuoy, Package, ShoppingCart, Star, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon, getCategoryLabel, classifyStoreNavGroup, type StoreNavGroup } from "@/lib/store-category-icons"
import { catalogConfigForGroup, catalogHref, navGroupLanding } from "@/lib/store-catalog"
import { formatBRL } from "@/lib/format"
import { computeCardDisplayPrice } from "@/lib/store-pricing"
import { useCart } from "@/components/providers/cart-context"
import { StoreSearchBox } from "@/components/store/StoreSearchBox"
import { StoreCommerceBarSlot } from "@/components/store/StoreCommerceBar"
import { RouteLink } from "@/components/ui/route-link"
import type { StoreFilterOptions } from "@/lib/server/repositories/store-repository"

/** O que o menu precisa das opções de filtro: categorias, marcas, contagens do catálogo e destaques. */
export type StoreNavData = Pick<
  StoreFilterOptions,
  "categories" | "categoryCounts" | "brandsByCategory" | "catalogFacetsByCategory" | "menuHighlights"
>

interface StoreCategoryNavProps {
  /** Vem de `getStoreFilterOptions`: igual em toda página da Loja, sem fetch próprio. */
  data: StoreNavData
  activeCategory: string | null
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  opened: "Emb. aberta",
  used: "Usado",
}

const CONDITION_TINT: Record<string, string> = {
  new: "oklch(0.7 0.15 160)",
  opened: "oklch(0.8 0.15 85)",
  used: "oklch(0.7 0.18 45)",
}

const GROUP_LABEL: Record<StoreNavGroup, string> = {
  mouse: "Mouse",
  teclado: "Teclado",
  mousepad: "Mousepad",
  audio: "Áudio",
  outros: "Outros",
}

/** Ordem fixa do menu — não segue mais a lista alfabética de categorias do banco. */
const GROUP_ORDER: StoreNavGroup[] = ["mouse", "teclado", "mousepad", "audio", "outros"]

/** Intervalo de troca do card "Em destaque" enquanto o menu está aberto. */
const PREVIEW_ROTATE_MS = 4500
/** Quantos produtos entram no rodízio por grupo — o suficiente pra variar sem virar slideshow infinito. */
const PREVIEW_MAX_CANDIDATES = 3
/** Linhas por coluna do mega menu: mais que isso vira lista, não atalho. */
const MENU_COLUMN_MAX = 8

/** Título de coluna do mega menu. */
function MenuHeading({ children }: { children: React.ReactNode }) {
  return <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">{children}</span>
}

/** Atalho de uma coluna (tipo, marca, faixa): texto + contagem, link de conteúdo para a categoria filtrada. */
function MenuLink({ href, label, count, onNavigate }: { href: string; label: string; count?: number; onNavigate: () => void }) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className="group/menu flex items-center justify-between gap-2.5 rounded-lg py-[6px] text-left text-[13px] font-medium text-[#b4b4b4] transition-colors hover:text-white"
    >
      <span className="truncate">{label}</span>
      {count != null && <span className="text-[11px] tabular-nums text-[#5e5e5e] group-hover/menu:text-[#8a8a8a]">{count}</span>}
    </Link>
  )
}

/**
 * Ação da direita do menu (Carrinho, Pedidos, Suporte). O rótulo
 * só aparece quando o MENU tem largura para ele (container query, não
 * viewport): com a sidebar do site aberta, 1440px de tela não sobram 1240px
 * para o menu, e o rótulo empurraria as categorias para fora.
 */
function NavAction({
  icon: Icon,
  label,
  href,
  onClick,
  badge = 0,
  active = false,
}: {
  icon: LucideIcon
  label: string
  href?: string
  onClick?: () => void
  badge?: number
  active?: boolean
}) {
  const className = cn(
    "flex h-[54px] shrink-0 items-center gap-2 border-b-2 px-2 text-[13px] transition-colors",
    active ? "border-white font-bold text-white" : "border-transparent font-semibold text-[#b4b4b4] hover:text-white"
  )
  const content = (
    <>
      <span className="relative flex">
        <Icon className="size-[15px]" strokeWidth={2.1} />
        {badge > 0 && (
          <span className="absolute -right-2.5 -top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-bold leading-none text-white ring-2 ring-card">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </span>
      <span className="hidden @min-[1240px]:inline">{label}</span>
    </>
  )
  const accessibleLabel = badge > 0 ? `${label} (${badge})` : label

  return href ? (
    <Link href={href} aria-label={accessibleLabel} title={label} aria-current={active ? "page" : undefined} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} aria-label={accessibleLabel} title={label} className={className}>
      {content}
    </button>
  )
}

export function StoreCategoryNav({ data, activeCategory }: StoreCategoryNavProps) {
  const { categories, categoryCounts, brandsByCategory } = data
  const pathname = usePathname()
  const { count: cartCount, setOpen: setCartOpen } = useCart()
  const isHome = pathname === "/loja"
  const [hovered, setHovered] = useState<StoreNavGroup | null>(null)
  const [previewIndex, setPreviewIndex] = useState(0)
  const [previewPaused, setPreviewPaused] = useState(false)

  const hoverGroup = (group: StoreNavGroup | null) => {
    setHovered(group)
    setPreviewIndex(0)
  }

  const grouped = new Map<StoreNavGroup, string[]>()
  for (const category of categories) {
    const group = classifyStoreNavGroup(category)
    grouped.set(group, [...(grouped.get(group) ?? []), category])
  }
  const groupsWithCategories = GROUP_ORDER.filter((group) => (grouped.get(group)?.length ?? 0) > 0)

  // Categoria "principal" do grupo (a com mais produtos): é para onde vão o
  // clique no nome do grupo e os atalhos de tipo e de preço. Mousepad junta
  // mousepad + glasspad; o glasspad entra como item próprio na coluna de tipos.
  const primaryCategoryOf = (groupCategories: string[]) =>
    [...groupCategories].sort((a, b) => (categoryCounts[b] ?? 0) - (categoryCounts[a] ?? 0))[0] ?? null

  const openGroup = hovered
  const openCategories = openGroup ? grouped.get(openGroup) ?? [] : []
  const openCount = openCategories.reduce((sum, c) => sum + (categoryCounts[c] ?? 0), 0)
  const primaryCategory = primaryCategoryOf(openCategories)
  const openLanding = openGroup && primaryCategory ? navGroupLanding(openGroup, openCategories, primaryCategory) : null
  const catalog = openGroup ? catalogConfigForGroup(openGroup) : null
  const catalogCounts = primaryCategory ? data.catalogFacetsByCategory?.[primaryCategory] : undefined
  const openBrands = openCategories.length
    ? Object.values(
        openCategories
          .flatMap((c) => brandsByCategory[c] ?? [])
          .reduce<Record<string, { brand: string; count: number }>>((acc, { brand, count }) => {
            acc[brand] = { brand, count: (acc[brand]?.count ?? 0) + count }
            return acc
          }, {})
      ).sort((a, b) => b.count - a.count)
    : []
  const primaryBrands = new Set((primaryCategory ? brandsByCategory[primaryCategory] ?? [] : []).map((item) => item.brand))

  // "Por tipo": tipos do catálogo com produto + as outras categorias do grupo.
  // Grupo sem catálogo próprio (Áudio, Outros) lista as categorias, como antes.
  const typeLinks: { key: string; label: string; count: number; href: string }[] = []
  if (catalog && primaryCategory) {
    for (const collection of catalog.collections) {
      const count = catalogCounts?.collections[collection.key] ?? 0
      if (count > 0) {
        typeLinks.push({ key: collection.key, label: collection.label, count, href: catalogHref(primaryCategory, { tipo: collection.key }) })
      }
    }
  }
  for (const category of openCategories) {
    if (catalog && category === primaryCategory) continue
    typeLinks.push({ key: `cat:${category}`, label: getCategoryLabel(category), count: categoryCounts[category] ?? 0, href: catalogHref(category) })
  }

  const priceLinks =
    catalog && primaryCategory
      ? catalog.priceBands
          .map((band) => ({ ...band, count: catalogCounts?.priceBands[band.key] ?? 0 }))
          .filter((band) => band.count > 0)
      : []

  // Destaques vêm do servidor (`menuHighlights`), já na ordem: marcados pelo
  // admin, maior desconto, mais recentes. A principal do grupo vem primeiro.
  const previewCandidates = (primaryCategory ? [primaryCategory, ...openCategories.filter((c) => c !== primaryCategory)] : [])
    .flatMap((category) => data.menuHighlights?.[category] ?? [])
    .slice(0, PREVIEW_MAX_CANDIDATES)
  const previewProduct = previewCandidates.length ? previewCandidates[previewIndex % previewCandidates.length] : null

  useEffect(() => {
    if (!hovered || previewPaused || previewCandidates.length < 2) return
    const id = setInterval(() => {
      setPreviewIndex((i) => (i + 1) % previewCandidates.length)
    }, PREVIEW_ROTATE_MS)
    return () => clearInterval(id)
  }, [hovered, previewPaused, previewCandidates.length])

  if (categories.length === 0) return null

  return (
    <>
    {/* `@container`: o menu decide o layout pela PRÓPRIA largura, não pela
        da tela: a sidebar do site (aberta ou recolhida) muda quanto sobra. */}
    <div className="@container relative" onMouseLeave={() => hoverGroup(null)}>
      {/* Desktop: 3 blocos: Busca | Home + categorias (centralizados) |
          Carrinho, Pedidos, Suporte. A busca mora à esquerda para
          o bloco de categorias ficar no meio com espaço dos dois lados. */}
      <nav className="hidden grid-cols-[1fr_auto_1fr] items-center gap-x-6 border-b border-[#262626] bg-card px-4 @min-[920px]:grid @min-[1100px]:px-8">
        <div className="flex min-w-0" onMouseEnter={() => hoverGroup(null)}>
          <StoreSearchBox
            className="w-full max-w-[320px]"
            inputClassName="h-[34px] w-full rounded-[10px] border border-[#2a2a2a] bg-[#141414] pl-[34px] pr-3 text-[12.5px] text-white outline-none placeholder:text-[#6e6e6e] focus:border-foreground/25"
          />
        </div>

        <div className="flex items-center justify-center gap-[22px]">
          <Link
            href="/loja"
            onMouseEnter={() => hoverGroup(null)}
            className={cn(
              "flex h-[54px] shrink-0 items-center gap-[5px] border-b-2 text-[13.5px] transition-colors",
              isHome
                ? "border-white font-bold text-white"
                : "border-transparent font-semibold text-[#b4b4b4] hover:text-white"
            )}
          >
            <Home className="size-[13px]" strokeWidth={2.2} />
            Home
          </Link>
          {groupsWithCategories.map((group) => {
            const groupCategories = grouped.get(group) ?? []
            const isOpen = hovered === group
            // Mousepad junta mousepad + glasspad; Áudio abre a página de grupo
            // (Headset + IEM). Ver `navGroupLanding`.
            const landing = navGroupLanding(group, groupCategories, primaryCategoryOf(groupCategories) ?? groupCategories[0])
            const isActive = activeCategory != null && (groupCategories.includes(activeCategory) || activeCategory === landing)
            const highlighted = isActive || isOpen
            const tint = groupCategories.length === 1 ? getCategoryIcon(groupCategories[0]).tint : "oklch(0.75 0.15 195)"
            // Grupo com mais de uma categoria também é link: era um <button>
            // só de hover, e o clique não fazia nada.
            return (
              <Link
                key={group}
                href={catalogHref(landing)}
                onMouseEnter={() => hoverGroup(group)}
                style={{ borderColor: highlighted ? tint : "transparent" }}
                className={cn(
                  "flex h-[54px] shrink-0 items-center gap-[5px] border-b-2 text-[13.5px] transition-colors",
                  highlighted ? "font-bold text-white" : "font-semibold text-[#b4b4b4] hover:text-white"
                )}
              >
                {GROUP_LABEL[group]}
              </Link>
            )
          })}
          <Link
            href="/loja/avaliacoes"
            onMouseEnter={() => hoverGroup(null)}
            className={cn(
              "flex h-[54px] shrink-0 items-center gap-[5px] border-b-2 text-[13.5px] transition-colors",
              pathname === "/loja/avaliacoes"
                ? "border-white font-bold text-white"
                : "border-transparent font-semibold text-[#b4b4b4] hover:text-white"
            )}
          >
            <Star className="size-[13px]" strokeWidth={2.2} />
            Avaliações
          </Link>
        </div>

        {/* O carrinho aparece aqui SEMPRE (com contador), e não só quando tem
            item como na TopBar: dentro da Loja ele é navegação, não aviso. */}
        <div className="flex shrink-0 items-center justify-self-end gap-1.5" onMouseEnter={() => hoverGroup(null)}>
          <NavAction icon={ShoppingCart} label="Carrinho" onClick={() => setCartOpen(true)} badge={cartCount} />
          <NavAction icon={Package} label="Pedidos" href="/conta/pedidos" />
          <NavAction icon={LifeBuoy} label="Suporte" href="/suporte" />
        </div>
      </nav>

      {/* Mobile / menu estreito: busca numa linha e o mesmo menu fixo em pills. */}
      <div className="border-b border-[#1c1c1c] bg-card px-4 py-3 @min-[920px]:hidden">
        <StoreSearchBox
          inputClassName="h-11 w-full rounded-xl border border-[#2a2a2a] bg-[#141414] pl-[38px] pr-3.5 text-[13px] text-white outline-none placeholder:text-[#6e6e6e] focus:border-foreground/25"
          iconClassName="left-3.5 size-[15px]"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-[#1c1c1c] bg-card px-4 pb-3.5 pt-3 [scrollbar-width:none] @min-[920px]:hidden">
        <Link
          href="/loja"
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center rounded-full px-[15px] text-[12.5px] transition-colors",
            isHome
              ? "bg-white font-bold text-black"
              : "border border-[#2a2a2a] bg-[#141414] font-semibold text-[#cfcfcf]"
          )}
        >
          Home
        </Link>
        {groupsWithCategories.map((group) => {
          const groupCategories = grouped.get(group) ?? []
          const landing = navGroupLanding(group, groupCategories, primaryCategoryOf(groupCategories) ?? groupCategories[0])
          const isActive = activeCategory != null && (groupCategories.includes(activeCategory) || activeCategory === landing)
          return (
            <Link
              key={group}
              href={catalogHref(landing)}
              className={cn(
                "inline-flex h-[34px] shrink-0 items-center rounded-full px-[15px] text-[12.5px] transition-colors",
                isActive
                  ? "bg-white font-bold text-black"
                  : "border border-[#2a2a2a] bg-[#141414] font-semibold text-[#cfcfcf]"
              )}
            >
              {GROUP_LABEL[group]}
            </Link>
          )
        })}
        <Link
          href="/conta/pedidos"
          className="inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full border border-[#2a2a2a] bg-[#141414] px-[15px] text-[12.5px] font-semibold text-[#cfcfcf] transition-colors"
        >
          <Package className="size-3.5" strokeWidth={2.2} />
          Pedidos
        </Link>
        <Link
          href="/loja/avaliacoes"
          className="inline-flex h-[34px] shrink-0 items-center rounded-full border border-[#2a2a2a] bg-[#141414] px-[15px] text-[12.5px] font-semibold text-[#cfcfcf] transition-colors"
        >
          Avaliações
        </Link>
        <Link
          href="/suporte"
          className="inline-flex h-[34px] shrink-0 items-center rounded-full border border-[#2a2a2a] bg-[#141414] px-[15px] text-[12.5px] font-semibold text-[#cfcfcf] transition-colors"
        >
          Suporte
        </Link>
      </div>

      {openGroup && (
        <div className="absolute inset-x-0 top-full z-10 hidden border-b border-[#262626] bg-card shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)] @min-[920px]:block">
          <div className="mx-auto flex max-w-7xl gap-8 px-4 pb-7 pt-6 lg:px-8">
            <div
              className={cn(
                "grid min-w-0 flex-1 gap-7",
                priceLinks.length > 0 ? "grid-cols-3" : "grid-cols-2"
              )}
            >
              {/* Por tipo: tipos do catálogo (Ultraleves, FPS...) e as outras
                  categorias do grupo. Em Áudio/Outros, só as categorias. */}
              {typeLinks.length > 0 && (
                <div className="flex min-w-0 flex-col gap-2">
                  <MenuHeading>{catalog ? "Por tipo" : "Categorias"}</MenuHeading>
                  <div className="flex flex-col">
                    {typeLinks.slice(0, MENU_COLUMN_MAX).map((item) => (
                      <MenuLink key={item.key} href={item.href} label={item.label} count={item.count} onNavigate={() => hoverGroup(null)} />
                    ))}
                  </div>
                </div>
              )}

              {/* Marcas do grupo. Dentro da categoria principal, a marca abre a
                  própria categoria já filtrada (com a barra de filtros); marca
                  que só existe em outra categoria do grupo vai para a página dela. */}
              <div className="flex min-w-0 flex-col gap-2">
                <MenuHeading>Marcas</MenuHeading>
                <div className="flex flex-col">
                  {openBrands.slice(0, MENU_COLUMN_MAX).map(({ brand, count }) => (
                    <MenuLink
                      key={brand}
                      href={
                        primaryCategory && primaryBrands.has(brand)
                          ? catalogHref(primaryCategory, { marca: brand })
                          : `/loja/marca/${encodeURIComponent(brand)}`
                      }
                      label={brand}
                      count={count}
                      onNavigate={() => hoverGroup(null)}
                    />
                  ))}
                  {openBrands.length === 0 && <p className="py-[6px] text-[13px] text-[#5e5e5e]">Sem marca cadastrada.</p>}
                </div>
              </div>

              {/* Por preço: faixas do grupo que têm produto. */}
              {priceLinks.length > 0 && primaryCategory && (
                <div className="flex min-w-0 flex-col gap-2">
                  <MenuHeading>Por preço</MenuHeading>
                  <div className="flex flex-col">
                    {priceLinks.map((band) => (
                      <MenuLink
                        key={band.key}
                        href={catalogHref(primaryCategory, { preco: band.key })}
                        label={band.label}
                        count={band.count}
                        onNavigate={() => hoverGroup(null)}
                      />
                    ))}
                  </div>
                </div>
              )}

              {openLanding && openGroup && (
                <RouteLink
                  href={catalogHref(openLanding)}
                  onClick={() => hoverGroup(null)}
                  style={{ color: getCategoryIcon(openLanding).tint }}
                  className="col-span-full inline-flex w-fit cursor-pointer items-center gap-[7px] text-[12.5px] font-bold transition-opacity hover:opacity-80"
                >
                  Ver todos{openCategories.length === 1 ? ` os ${openCount}` : ` em ${GROUP_LABEL[openGroup]}`}
                  <ArrowRight className="size-[13px]" strokeWidth={2.2} />
                </RouteLink>
              )}
            </div>

            {/* Em destaque: produto com foto, preço e "Ver produto". */}
            <div className="flex w-[340px] shrink-0 flex-col gap-2.5">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">
                <Star className="size-3 fill-amber-400 text-amber-400" strokeWidth={0} />
                Em destaque
              </span>
              {previewProduct ? (
                <div
                  className="relative"
                  onMouseEnter={() => setPreviewPaused(true)}
                  onMouseLeave={() => setPreviewPaused(false)}
                >
                  {(() => {
                    const { effectiveCents, baseCents, hasDiscount, discountPercent } = computeCardDisplayPrice(previewProduct)
                    const { icon: CategoryIcon, tint } = getCategoryIcon(previewProduct.category)
                    const image = previewProduct.images?.[0] ?? null
                    return (
                      <div
                        key={previewProduct.id}
                        className="flex animate-fade-in-up flex-col gap-3 rounded-2xl border border-[#262626] p-3.5"
                        style={{ background: `radial-gradient(90% 120% at 100% 0%, color-mix(in oklab, ${tint} 12%, #0e0e0e), #0e0e0e)` }}
                      >
                        <Link
                          href={`/loja/${previewProduct.slug}`}
                          onClick={() => hoverGroup(null)}
                          className="group/preview flex gap-3.5"
                        >
                          <span className="relative flex size-[112px] shrink-0 items-center justify-center overflow-hidden rounded-[13px] bg-[#151515]">
                            {image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={image}
                                alt=""
                                className="size-full object-contain p-2 transition-transform duration-300 group-hover/preview:scale-105"
                              />
                            ) : (
                              <CategoryIcon className="size-[58px] opacity-55" style={{ color: tint }} strokeWidth={1.15} />
                            )}
                            {hasDiscount && discountPercent != null && (
                              <span className="absolute left-1.5 top-1.5 rounded-md bg-emerald-500 px-1.5 py-px text-[10px] font-extrabold text-[#03140c]">
                                -{discountPercent}%
                              </span>
                            )}
                          </span>
                          <span className="flex min-w-0 flex-col justify-center gap-1.5">
                            <span
                              className="inline-flex self-start items-center rounded-full border px-[9px] py-[3px] text-[9px] font-bold uppercase tracking-[0.06em]"
                              style={{
                                borderColor: `color-mix(in oklab, ${CONDITION_TINT[previewProduct.condition]} 32%, transparent)`,
                                background: `color-mix(in oklab, ${CONDITION_TINT[previewProduct.condition]} 14%, #000)`,
                                color: CONDITION_TINT[previewProduct.condition],
                              }}
                            >
                              {CONDITION_LABEL[previewProduct.condition]}
                            </span>
                            <span className="line-clamp-2 text-[13.5px] font-semibold leading-[1.35] text-white">{previewProduct.name}</span>
                            {previewProduct.brand && (
                              <span className="text-[11.5px] font-medium text-[#8a8a8a]">{previewProduct.brand}</span>
                            )}
                            <span className="flex flex-wrap items-baseline gap-x-2">
                              {hasDiscount && <span className="text-[11.5px] text-[#6e6e6e] line-through">{formatBRL(baseCents)}</span>}
                              <span className="font-display text-[19px] font-bold text-emerald-400">{formatBRL(effectiveCents)}</span>
                            </span>
                          </span>
                        </Link>
                        <RouteLink
                          href={`/loja/${previewProduct.slug}`}
                          onClick={() => hoverGroup(null)}
                          className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-xl bg-white text-[13px] font-bold text-black transition-transform hover:scale-[1.01]"
                        >
                          Ver produto
                          <ArrowRight className="size-4" strokeWidth={2.4} />
                        </RouteLink>
                      </div>
                    )
                  })()}
                  {/* Setas laterais: as bolinhas abaixo são só indicador de
                      posição; o chevron é o alvo de clique. */}
                  {previewCandidates.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Destaque anterior"
                        onClick={() => setPreviewIndex((i) => (i - 1 + previewCandidates.length) % previewCandidates.length)}
                        className="absolute -left-3 top-[68px] flex size-7 items-center justify-center rounded-full border border-[#2f2f2f] bg-[#141414] text-[#b4b4b4] transition-colors hover:border-foreground/30 hover:text-white"
                      >
                        <ChevronLeft className="size-4" strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        aria-label="Próximo destaque"
                        onClick={() => setPreviewIndex((i) => (i + 1) % previewCandidates.length)}
                        className="absolute -right-3 top-[68px] flex size-7 items-center justify-center rounded-full border border-[#2f2f2f] bg-[#141414] text-[#b4b4b4] transition-colors hover:border-foreground/30 hover:text-white"
                      >
                        <ChevronRight className="size-4" strokeWidth={2.2} />
                      </button>
                      <div className="mt-2.5 flex items-center justify-center gap-1.5">
                        {previewCandidates.map((p, i) => (
                          <button
                            key={p.id}
                            type="button"
                            aria-label={`Ver ${p.name}`}
                            onClick={() => setPreviewIndex(i)}
                            className={cn(
                              "h-1.5 rounded-full transition-all",
                              i === previewIndex % previewCandidates.length ? "w-4 bg-white" : "w-1.5 bg-[#3a3a3a] hover:bg-[#5a5a5a]"
                            )}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-[#5e5e5e]">Nenhum produto em destaque nesta categoria.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>

    {/* Barra comercial: benefícios ou campanha, logo abaixo do menu, em toda
        página da Loja. Fora do bloco acima de propósito: o mega-menu abre
        colado no menu (`top-full`), não embaixo da barra. */}
    <StoreCommerceBarSlot />
    </>
  )
}
