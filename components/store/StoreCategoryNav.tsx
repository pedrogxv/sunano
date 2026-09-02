"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, ChevronLeft, ChevronRight, Home, LifeBuoy, MessageSquareText, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon, getCategoryLabel, classifyStoreNavGroup, type StoreNavGroup } from "@/lib/store-category-icons"
import { formatBRL } from "@/lib/format"
import { StoreSearchBox } from "@/components/store/StoreSearchBox"
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
  audio: "Audio",
  outros: "Outros",
}

/** Ordem fixa do menu — não segue mais a lista alfabética de categorias do banco. */
const GROUP_ORDER: StoreNavGroup[] = ["mouse", "teclado", "mousepad", "audio", "outros"]

/** Intervalo de troca do card "Em destaque" enquanto o menu está aberto. */
const PREVIEW_ROTATE_MS = 3200
/** Quantos produtos entram no rodízio por grupo — o suficiente pra variar sem virar slideshow infinito. */
const PREVIEW_MAX_CANDIDATES = 5

export function StoreCategoryNav({
  categories,
  categoryCounts,
  brandsByCategory,
  activeCategory,
  previewPool,
}: StoreCategoryNavProps) {
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
    <div className="relative" onMouseLeave={() => hoverGroup(null)}>
      {/* Desktop: layout space-between em 3 blocos — Home | Categorias | Busca+Suporte.
          gap-x garante que Avaliações nunca encoste na busca (as colunas 1fr não são
          simétricas porque a coluna da busca é bem mais larga que a do Home, mas o
          bloco de categorias já fica visualmente centralizado no espaço do meio). */}
      <nav className="hidden grid-cols-[1fr_auto_1fr] items-center gap-x-8 border-b border-[#262626] bg-card px-4 md:grid lg:px-8">
        <Link
          href="/loja"
          className={cn(
            "flex h-[54px] shrink-0 items-center justify-self-start gap-[5px] border-b-2 text-[13.5px] transition-colors",
            activeCategory === null
              ? "border-white font-bold text-white"
              : "border-transparent font-semibold text-[#b4b4b4] hover:text-white"
          )}
        >
          <Home className="size-[13px]" strokeWidth={2.2} />
          Home
        </Link>

        <div className="flex items-center justify-center gap-[26px] overflow-x-auto [scrollbar-width:none]">
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
          <Link
            href="/loja/avaliacoes"
            className="flex h-[54px] shrink-0 items-center gap-[5px] border-b-2 border-transparent text-[13.5px] font-semibold text-[#b4b4b4] transition-colors hover:text-white"
          >
            <MessageSquareText className="size-[13px]" strokeWidth={2.2} />
            Avaliações
          </Link>
        </div>

        {/* Busca vive aqui, na faixa de categorias — é onde o mock a coloca,
            em vez de ocupar uma linha inteira dentro da barra de filtros.
            O carrinho não duplica aqui: já vive na TopBar. */}
        <div className="flex shrink-0 items-center justify-self-end gap-[22px]">
          <StoreSearchBox
            className="w-[260px]"
            inputClassName="h-[34px] w-full rounded-[10px] border border-[#2a2a2a] bg-[#141414] pl-[34px] pr-3 text-[12.5px] text-white outline-none placeholder:text-[#6e6e6e] focus:border-foreground/25"
          />
          <Link
            href="/suporte"
            className="flex h-[54px] shrink-0 items-center gap-[5px] border-b-2 border-transparent text-[13.5px] font-semibold text-[#b4b4b4] transition-colors hover:text-white"
          >
            <LifeBuoy className="size-[13px]" strokeWidth={2.2} />
            Suporte
          </Link>
        </div>
      </nav>

      {/* Mobile: busca numa linha e o mesmo menu fixo em pills. */}
      <div className="border-b border-[#1c1c1c] bg-card px-4 py-3 md:hidden">
        <StoreSearchBox
          inputClassName="h-11 w-full rounded-xl border border-[#2a2a2a] bg-[#141414] pl-[38px] pr-3.5 text-[13px] text-white outline-none placeholder:text-[#6e6e6e] focus:border-foreground/25"
          iconClassName="left-3.5 size-[15px]"
        />
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-[#1c1c1c] bg-card px-4 pb-3.5 pt-3 [scrollbar-width:none] md:hidden">
        <Link
          href="/loja"
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center rounded-full px-[15px] text-[12.5px] transition-colors",
            activeCategory === null
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
        <div className="absolute inset-x-0 top-full z-10 hidden border-b border-[#262626] bg-card shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)] md:block">
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
  )
}
