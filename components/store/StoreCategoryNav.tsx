"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, Home, LifeBuoy, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon, classifyStoreNavGroup, type StoreNavGroup } from "@/lib/store-category-icons"
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

export function StoreCategoryNav({
  categories,
  categoryCounts,
  brandsByCategory,
  activeCategory,
  previewPool,
}: StoreCategoryNavProps) {
  const [hovered, setHovered] = useState<StoreNavGroup | null>(null)
  if (categories.length === 0) return null

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
  const previewProduct = openCategories.length
    ? previewPool.find((p) => p.category != null && openCategories.includes(p.category) && p.promo_price_cents != null && p.promo_price_cents < p.price_cents)
      ?? previewPool.find((p) => p.category != null && openCategories.includes(p.category))
      ?? null
    : null

  return (
    <div className="relative" onMouseLeave={() => setHovered(null)}>
      {/* Desktop: layout space-between em 3 blocos — Home | Categorias | Busca+Suporte. */}
      <nav className="hidden items-center justify-between border-b border-[#262626] bg-card px-4 md:flex lg:px-8">
        <Link
          href="/loja"
          className={cn(
            "flex h-[54px] shrink-0 items-center gap-[5px] border-b-2 text-[13.5px] transition-colors",
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
                onMouseEnter={() => setHovered(group)}
                style={{ borderColor: highlighted ? tint : "transparent" }}
                className={sharedClass}
              >
                {content}
              </Link>
            ) : (
              <button
                key={group}
                type="button"
                onMouseEnter={() => setHovered(group)}
                style={{ borderColor: highlighted ? tint : "transparent" }}
                className={sharedClass}
              >
                {content}
              </button>
            )
          })}
        </div>

        {/* Busca vive aqui, na faixa de categorias — é onde o mock a coloca,
            em vez de ocupar uma linha inteira dentro da barra de filtros.
            O carrinho não duplica aqui: já vive na TopBar. */}
        <div className="flex shrink-0 items-center gap-[22px]">
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
          href="/suporte"
          className="inline-flex h-[34px] shrink-0 items-center rounded-full border border-[#2a2a2a] bg-[#141414] px-[15px] text-[12.5px] font-semibold text-[#cfcfcf] transition-colors"
        >
          Suporte
        </Link>
      </div>

      {openGroup && (
        <div className="absolute inset-x-0 top-full z-10 hidden border-b border-[#262626] bg-card shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)] md:block">
          <div className="mx-auto grid max-w-7xl grid-cols-[1.35fr_0.75fr_1fr] gap-[34px] px-4 pb-8 pt-7 lg:px-8">
            {/* Coluna 1: se o grupo tem 1 categoria só, mostra o card grande de
                sempre; se agrupa várias (Audio, Outros...), lista cada uma. */}
            <div className="flex flex-col gap-3.5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">
                {openCategories.length > 1 ? GROUP_LABEL[openGroup] : "Categoria"}
              </span>
              {openCategories.length === 1 ? (
                (() => {
                  const cat = openCategories[0]
                  const { icon: Icon, tint } = getCategoryIcon(cat)
                  return (
                    <Link
                      href={`/loja/categoria/${encodeURIComponent(cat)}`}
                      className="flex items-center gap-[13px] rounded-[13px] border border-[#262626] bg-[#0e0e0e] px-[15px] py-[13px] text-left transition-colors hover:border-foreground/25"
                    >
                      <span
                        className="flex size-[46px] shrink-0 items-center justify-center rounded-[11px]"
                        style={{ background: `radial-gradient(110% 110% at 50% 20%, color-mix(in oklab, ${tint} 22%, #171717), #171717)` }}
                      >
                        <Icon className="size-6" style={{ color: tint }} strokeWidth={1.4} />
                      </span>
                      <span className="flex flex-col gap-0.5">
                        <span className="text-[13px] font-bold capitalize text-white">{cat}</span>
                        <span className="text-[11px] font-medium text-[#7a7a7a]">
                          {categoryCounts[cat] ?? 0} produto{categoryCounts[cat] === 1 ? "" : "s"}
                        </span>
                      </span>
                    </Link>
                  )
                })()
              ) : (
                <div className="flex flex-col gap-1.5">
                  {openCategories.map((cat) => {
                    const { icon: Icon, tint } = getCategoryIcon(cat)
                    return (
                      <Link
                        key={cat}
                        href={`/loja/categoria/${encodeURIComponent(cat)}`}
                        className="flex items-center gap-2.5 rounded-[11px] border border-[#262626] bg-[#0e0e0e] px-[13px] py-2.5 text-left transition-colors hover:border-foreground/25"
                      >
                        <Icon className="size-4 shrink-0" style={{ color: tint }} strokeWidth={1.6} />
                        <span className="flex-1 text-[13px] font-semibold capitalize text-white">{cat}</span>
                        <span className="text-[11px] text-[#7a7a7a]">{categoryCounts[cat] ?? 0}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Coluna 2: marcas reais do grupo */}
            <div className="flex flex-col gap-3">
              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">Marcas</span>
              <div className="flex flex-col">
                {openBrands.slice(0, 6).map(({ brand, count: brandCount }) => (
                  <Link
                    key={brand}
                    href={`/loja/marca/${encodeURIComponent(brand)}`}
                    className="flex items-center justify-between gap-2.5 py-[7px] text-left text-[13px] font-medium text-[#b4b4b4] transition-colors hover:text-white"
                  >
                    <span>{brand}</span>
                    <span className="text-[11px] text-[#5e5e5e]">{brandCount}</span>
                  </Link>
                ))}
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
                <Link
                  href={`/loja/${previewProduct.slug}`}
                  className="flex gap-4 rounded-2xl border border-[#262626] p-4 transition-colors hover:border-foreground/25"
                  style={{ background: `radial-gradient(90% 120% at 100% 0%, color-mix(in oklab, ${getCategoryIcon(previewProduct.category).tint} 12%, #0e0e0e), #0e0e0e)` }}
                >
                  {previewProduct.images?.[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={previewProduct.images[0]}
                      alt=""
                      className="size-[108px] shrink-0 rounded-[13px] bg-[#171717] object-contain p-2"
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
