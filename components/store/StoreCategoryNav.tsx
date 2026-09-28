"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Heart, Home, LifeBuoy, Package, ShoppingCart, Star, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon, getCategoryLabel, classifyStoreNavGroup, type StoreNavGroup } from "@/lib/store-category-icons"
import { formatBRL } from "@/lib/format"
import { useCart } from "@/components/providers/cart-context"
import { useStoreFavorites } from "@/components/providers/store-favorites-context"
import { StoreSearchBox } from "@/components/store/StoreSearchBox"
import { StoreCommerceBarSlot } from "@/components/store/StoreCommerceBar"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

interface StoreCategoryNavProps {
  categories: string[]
  categoryCounts: Record<string, number>
  /** Marcas por categoria, já ordenadas por frequência (vem do filter-options). */
  brandsByCategory: Record<string, { brand: string; count: number }[]>
  activeCategory: string | null
  /**
   * Pool de produtos já carregados no cliente, usado só pra achar 1 preview
   * por categoria no hover — nada aqui vem de fetch novo.
   */
  previewPool: StoreProductCard[]
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
const PREVIEW_ROTATE_MS = 3200
/** Quantos produtos entram no rodízio por grupo — o suficiente pra variar sem virar slideshow infinito. */
const PREVIEW_MAX_CANDIDATES = 5

/**
 * Ação da direita do menu (Favoritos, Carrinho, Pedidos, Suporte). O rótulo
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

export function StoreCategoryNav({
  categories,
  categoryCounts,
  brandsByCategory,
  activeCategory,
  previewPool,
}: StoreCategoryNavProps) {
  const pathname = usePathname()
  const { count: cartCount, setOpen: setCartOpen } = useCart()
  const { count: favoritesCount } = useStoreFavorites()
  const isHome = pathname === "/loja"
  const isFavorites = pathname === "/loja/favoritos"
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

  const openGroup = hovered
  const openCategories = openGroup ? grouped.get(openGroup) ?? [] : []
  const openCount = openCategories.reduce((sum, c) => sum + (categoryCounts[c] ?? 0), 0)
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
  // Rodízio do card "Em destaque": prioriza os marcados manualmente pelo admin
  // (`is_featured`), completa com promoções e por fim com qualquer produto da
  // categoria — sempre deduplicado e limitado pra não virar slideshow infinito.
  const previewCandidates: StoreProductCard[] = []
  if (openCategories.length) {
    const inGroup = previewPool.filter((p) => p.category != null && openCategories.includes(p.category))
    const isPromo = (p: StoreProductCard) => p.promo_price_cents != null && p.promo_price_cents < p.price_cents
    const ranked = [
      ...inGroup.filter((p) => p.is_featured),
      ...inGroup.filter((p) => !p.is_featured && isPromo(p)),
      ...inGroup.filter((p) => !p.is_featured && !isPromo(p)),
    ]
    const seen = new Set<string>()
    for (const p of ranked) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      previewCandidates.push(p)
      if (previewCandidates.length === PREVIEW_MAX_CANDIDATES) break
    }
  }
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
          Favoritos, Carrinho, Pedidos, Suporte. A busca mora à esquerda para
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
            const isActive = groupCategories.includes(activeCategory ?? "")
            const highlighted = isActive || isOpen
            const tint = groupCategories.length === 1 ? getCategoryIcon(groupCategories[0]).tint : "oklch(0.75 0.15 195)"
            const singleHref = groupCategories.length === 1 ? `/loja/categoria/${encodeURIComponent(groupCategories[0])}` : undefined

            const content = (
              <>
                {GROUP_LABEL[group]}
                <ChevronDown
                  className={cn("size-[13px] transition-transform", isOpen && "rotate-180")}
                  strokeWidth={2.2}
                  style={{ color: highlighted ? tint : "#6e6e6e" }}
                />
              </>
            )

            const sharedClass = cn(
              "flex h-[54px] shrink-0 items-center gap-[5px] border-b-2 text-[13.5px] transition-colors",
              highlighted ? "font-bold text-white" : "font-semibold text-[#b4b4b4] hover:text-white"
            )

            return singleHref ? (
              <Link
                key={group}
                href={singleHref}
                onMouseEnter={() => hoverGroup(group)}
                style={{ borderColor: highlighted ? tint : "transparent" }}
                className={sharedClass}
              >
                {content}
              </Link>
            ) : (
              <button
                key={group}
                type="button"
                onMouseEnter={() => hoverGroup(group)}
                style={{ borderColor: highlighted ? tint : "transparent" }}
                className={sharedClass}
              >
                {content}
              </button>
            )
          })}
        </div>

        {/* O carrinho aparece aqui SEMPRE (com contador), e não só quando tem
            item como na TopBar: dentro da Loja ele é navegação, não aviso. */}
        <div className="flex shrink-0 items-center justify-self-end gap-1.5" onMouseEnter={() => hoverGroup(null)}>
          <NavAction icon={Heart} label="Favoritos" href="/loja/favoritos" badge={favoritesCount} active={isFavorites} />
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
          const isActive = groupCategories.includes(activeCategory ?? "")
          return (
            <Link
              key={group}
              href={`/loja/categoria/${encodeURIComponent(groupCategories[0])}`}
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
          href="/loja/favoritos"
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center gap-1.5 rounded-full px-[15px] text-[12.5px] transition-colors",
            isFavorites
              ? "bg-white font-bold text-black"
              : "border border-[#2a2a2a] bg-[#141414] font-semibold text-[#cfcfcf]"
          )}
        >
          <Heart className="size-3.5" strokeWidth={2.2} />
          Favoritos
          {favoritesCount > 0 && <span className="text-[11px] opacity-70">{favoritesCount}</span>}
        </Link>
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
          <div
            className={cn(
              "mx-auto grid max-w-7xl gap-[34px] px-4 pb-8 pt-7 lg:px-8",
              openCategories.length === 1 ? "grid-cols-[0.9fr_1fr]" : "grid-cols-[1.35fr_0.75fr_1fr]"
            )}
          >
            {/* Coluna 1: só existe quando o grupo agrupa várias categorias
                (Audio, Outros...) — com 1 categoria só, o próprio nome no menu
                e o "Ver todos" da coluna de marcas já cobrem a navegação, então
                não duplica um card de categoria aqui. */}
            {openCategories.length > 1 && (
              <div className="flex flex-col gap-3.5">
                <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">
                  {GROUP_LABEL[openGroup]}
                </span>
                <div className="flex flex-col gap-2">
                  {openCategories.map((cat) => {
                    const { icon: Icon, tint } = getCategoryIcon(cat)
                    return (
                      <Link
                        key={cat}
                        href={`/loja/categoria/${encodeURIComponent(cat)}`}
                        className="flex items-center gap-2.5 rounded-[11px] border border-[#262626] bg-[#0e0e0e] px-[13px] py-2.5 text-left transition-colors hover:border-foreground/25"
                      >
                        <Icon className="size-4 shrink-0" style={{ color: tint }} strokeWidth={1.6} />
                        <span className="flex-1 text-[13px] font-semibold text-white">{getCategoryLabel(cat)}</span>
                        <span className="text-[11px] text-[#7a7a7a]">{categoryCounts[cat] ?? 0}</span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Coluna 2: marcas reais do grupo */}
            <div className="flex flex-col gap-3">
              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">Marcas</span>
              <div className="flex flex-col">
                {openBrands.slice(0, 6).map(({ brand }) => {
                  // Com 1 categoria só no grupo, manda a marca já filtrada por ela —
                  // senão a página de marca mostra todo o catálogo da marca (outras
                  // categorias juntas), o que não é o que o usuário veio ver aqui.
                  const brandHref =
                    openCategories.length === 1
                      ? `/loja/marca/${encodeURIComponent(brand)}?categoria=${encodeURIComponent(openCategories[0])}`
                      : `/loja/marca/${encodeURIComponent(brand)}`
                  return (
                    <Link
                      key={brand}
                      href={brandHref}
                      className="flex items-center justify-between gap-2.5 py-[7px] text-left text-[13px] font-medium text-[#b4b4b4] transition-colors hover:text-white"
                    >
                      <span>{brand}</span>
                    </Link>
                  )
                })}
                {openBrands.length === 0 && (
                  <p className="py-[7px] text-[13px] text-[#5e5e5e]">Sem marca cadastrada.</p>
                )}
              </div>
              {openCategories.length === 1 && (
                <Link
                  href={`/loja/categoria/${encodeURIComponent(openCategories[0])}`}
                  style={{ color: getCategoryIcon(openCategories[0]).tint }}
                  className="mt-1 inline-flex items-center gap-[7px] text-left text-[12.5px] font-bold transition-opacity hover:opacity-80"
                >
                  Ver todos os {openCount}
                  <ArrowRight className="size-[13px]" strokeWidth={2.2} />
                </Link>
              )}
            </div>

            {/* Coluna 3: produto em destaque do grupo */}
            <div className="flex flex-col gap-3">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">
                <Star className="size-3 fill-amber-400 text-amber-400" strokeWidth={0} />
                Em destaque
              </span>
              {previewProduct ? (
                <div
                  className="flex flex-col gap-2.5"
                  onMouseEnter={() => setPreviewPaused(true)}
                  onMouseLeave={() => setPreviewPaused(false)}
                >
                  <div className="relative">
                  <Link
                    key={previewProduct.id}
                    href={`/loja/${previewProduct.slug}`}
                    className="flex animate-fade-in-up gap-4 rounded-2xl border border-[#262626] p-4 transition-colors hover:border-foreground/25"
                    style={{ background: `radial-gradient(90% 120% at 100% 0%, color-mix(in oklab, ${getCategoryIcon(previewProduct.category).tint} 12%, #0e0e0e), #0e0e0e)` }}
                  >
                    {previewProduct.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={previewProduct.images[0]}
                        alt=""
                        className="size-[108px] shrink-0 rounded-[13px] object-contain p-2"
                      />
                    ) : (
                      (() => {
                        const { icon: Icon, tint } = getCategoryIcon(previewProduct.category)
                        return (
                          <span className="flex size-[108px] shrink-0 items-center justify-center rounded-[13px] bg-[#171717]">
                            <Icon className="size-[62px] opacity-55" style={{ color: tint }} strokeWidth={1.15} />
                          </span>
                        )
                      })()
                    )}
                    <span className="flex min-w-0 flex-col gap-[7px]">
                      <span
                        className="inline-flex self-start items-center gap-[5px] rounded-full border px-[9px] py-[3px] text-[9px] font-bold uppercase tracking-[0.06em]"
                        style={{
                          borderColor: `color-mix(in oklab, ${CONDITION_TINT[previewProduct.condition]} 32%, transparent)`,
                          background: `color-mix(in oklab, ${CONDITION_TINT[previewProduct.condition]} 14%, #000)`,
                          color: CONDITION_TINT[previewProduct.condition],
                        }}
                      >
                        {CONDITION_LABEL[previewProduct.condition]}
                      </span>
                      <span className="text-[13.5px] font-semibold leading-[1.35] text-white">{previewProduct.name}</span>
                      <span className="flex items-baseline gap-2">
                        {previewProduct.promo_price_cents != null && previewProduct.promo_price_cents < previewProduct.price_cents && (
                          <span className="text-[11.5px] text-[#6e6e6e] line-through">{formatBRL(previewProduct.price_cents)}</span>
                        )}
                        <span className="font-display text-[19px] font-bold text-emerald-400">
                          {formatBRL(previewProduct.promo_price_cents ?? previewProduct.price_cents)}
                        </span>
                      </span>
                      {previewProduct.brand && (
                        <span className="text-[11.5px] font-medium leading-[1.45] text-[#8a8a8a]">{previewProduct.brand}</span>
                      )}
                    </span>
                  </Link>
                  {/* Setas laterais: as bolinhas abaixo continuam existindo, mas
                      só como indicador de posição — quem quer passar o card
                      usa o chevron, que é alvo de clique bem maior. */}
                  {previewCandidates.length > 1 && (
                    <>
                      <button
                        type="button"
                        aria-label="Destaque anterior"
                        onClick={() => setPreviewIndex((i) => (i - 1 + previewCandidates.length) % previewCandidates.length)}
                        className="absolute -left-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#2f2f2f] bg-[#141414] text-[#b4b4b4] transition-colors hover:border-foreground/30 hover:text-white"
                      >
                        <ChevronLeft className="size-4" strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        aria-label="Próximo destaque"
                        onClick={() => setPreviewIndex((i) => (i + 1) % previewCandidates.length)}
                        className="absolute -right-3 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full border border-[#2f2f2f] bg-[#141414] text-[#b4b4b4] transition-colors hover:border-foreground/30 hover:text-white"
                      >
                        <ChevronRight className="size-4" strokeWidth={2.2} />
                      </button>
                    </>
                  )}
                  </div>
                  {previewCandidates.length > 1 && (
                    <div className="flex items-center justify-center gap-1.5">
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
                  )}
                </div>
              ) : (
                <p className="text-[13px] text-[#5e5e5e]">Nenhum produto carregado ainda.</p>
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
