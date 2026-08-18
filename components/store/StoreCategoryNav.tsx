"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, ChevronDown, Search, ShoppingCart, Star } from "lucide-react"
import { cn } from "@/lib/utils"
import { getCategoryIcon } from "@/lib/store-category-icons"
import { formatBRL } from "@/lib/format"
import { useCart } from "@/components/providers/cart-context"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

interface StoreCategoryNavProps {
  categories: string[]
  categoryCounts: Record<string, number>
  /** Marcas por categoria, já ordenadas por frequência (vem do filter-options). */
  brandsByCategory: Record<string, { brand: string; count: number }[]>
  activeCategory: string | null
  onSelect: (category: string | null) => void
  onSelectBrand: (category: string, brand: string) => void
  query: string
  onQueryChange: (value: string) => void
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

export function StoreCategoryNav({
  categories,
  categoryCounts,
  brandsByCategory,
  activeCategory,
  onSelect,
  onSelectBrand,
  query,
  onQueryChange,
  previewPool,
}: StoreCategoryNavProps) {
  const [hovered, setHovered] = useState<string | null>(null)
  const { count, setOpen } = useCart()
  if (categories.length === 0) return null

  const openCategory = hovered
  const previewProduct = openCategory
    ? previewPool.find((p) => p.category === openCategory && p.promo_price_cents != null && p.promo_price_cents < p.price_cents)
      ?? previewPool.find((p) => p.category === openCategory)
      ?? null
    : null
  const openBrands = openCategory ? brandsByCategory[openCategory] ?? [] : []

  return (
    <div className="relative z-20" onMouseLeave={() => setHovered(null)}>
      {/* Barra de aviso — a faixa fina que abre a Loja no mock. Texto curto no
          mobile: os dois selos completos não cabem em 390px. */}
      <div className="flex h-8 items-center justify-center gap-[7px] border-b border-[#1c1c1c] bg-black text-[11px] font-semibold text-[#8a8a8a] sm:h-[34px] sm:gap-2.5 sm:text-[11.5px] sm:tracking-[0.01em]">
        <span>
          Pagamento via <span className="text-white">PIX</span>
          <span className="hidden sm:inline"> gerado na hora</span>
        </span>
        <span className="text-[#3a3a3a]">·</span>
        <span>
          <span className="hidden sm:inline">Todo produto </span>
          <span className="text-white">testado pelo Sunano</span>
        </span>
      </div>

      {/* Desktop: faixa de categorias com hover → mega menu. */}
      <nav className="hidden items-center justify-between gap-6 border-b border-[#262626] bg-card px-4 md:flex lg:px-8">
        <div className="flex items-center gap-[26px] overflow-x-auto [scrollbar-width:none]">
          {categories.map((category) => {
            const isOpen = hovered === category
            const isActive = activeCategory === category
            const { tint } = getCategoryIcon(category)
            const highlighted = isActive || isOpen
            return (
              <button
                key={category}
                type="button"
                onMouseEnter={() => setHovered(category)}
                onClick={() => onSelect(isActive ? null : category)}
                style={{ borderColor: highlighted ? tint : "transparent" }}
                className={cn(
                  "flex h-[54px] shrink-0 items-center gap-[5px] border-b-2 text-[13.5px] capitalize transition-colors",
                  highlighted ? "font-bold text-white" : "font-semibold text-[#b4b4b4] hover:text-white"
                )}
              >
                {category}
                <ChevronDown
                  className={cn("size-[13px] transition-transform", isOpen && "rotate-180")}
                  strokeWidth={2.2}
                  style={{ color: highlighted ? tint : "#6e6e6e" }}
                />
              </button>
            )
          })}
        </div>

        {/* Busca vive aqui, na faixa de categorias — é onde o mock a coloca,
            em vez de ocupar uma linha inteira dentro da barra de filtros. */}
        <div className="flex shrink-0 items-center gap-2.5">
          <div className="relative w-[260px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#6e6e6e]" />
            <input
              aria-label="Buscar produtos"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Buscar produto ou marca"
              className="h-[34px] w-full rounded-[10px] border border-[#2a2a2a] bg-[#141414] pl-[34px] pr-3 text-[12.5px] text-white outline-none placeholder:text-[#6e6e6e] focus:border-foreground/25"
            />
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir carrinho"
            className="relative flex size-[34px] items-center justify-center rounded-[10px] border border-[#2a2a2a] bg-[#141414] text-[#dcdcdc] transition-colors hover:border-foreground/25"
          >
            <ShoppingCart className="size-[15px]" />
            {count > 0 && (
              <span className="absolute -right-[5px] -top-[5px] flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-emerald-500 px-1 text-[9.5px] font-extrabold text-[#04140d]">
                {count}
              </span>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile: busca numa linha e categorias em pills, como no artboard 390. */}
      <div className="border-b border-[#1c1c1c] bg-card px-4 py-3 md:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-[15px] -translate-y-1/2 text-[#6e6e6e]" />
          <input
            aria-label="Buscar produtos"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Buscar produto ou marca"
            className="h-11 w-full rounded-xl border border-[#2a2a2a] bg-[#141414] pl-[38px] pr-3.5 text-[13px] text-white outline-none placeholder:text-[#6e6e6e] focus:border-foreground/25"
          />
        </div>
      </div>
      <div className="flex gap-2 overflow-x-auto border-b border-[#1c1c1c] bg-card px-4 pb-3.5 pt-3 [scrollbar-width:none] md:hidden">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={cn(
            "inline-flex h-[34px] shrink-0 items-center rounded-full px-[15px] text-[12.5px] transition-colors",
            activeCategory === null
              ? "bg-white font-bold text-black"
              : "border border-[#2a2a2a] bg-[#141414] font-semibold text-[#cfcfcf]"
          )}
        >
          Tudo
        </button>
        {categories.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => onSelect(activeCategory === category ? null : category)}
            className={cn(
              "inline-flex h-[34px] shrink-0 items-center rounded-full px-[15px] text-[12.5px] capitalize transition-colors",
              activeCategory === category
                ? "bg-white font-bold text-black"
                : "border border-[#2a2a2a] bg-[#141414] font-semibold text-[#cfcfcf]"
            )}
          >
            {category}
          </button>
        ))}
      </div>

      {openCategory && (
        <div className="absolute inset-x-0 top-full z-30 hidden border-b border-[#262626] bg-card shadow-[0_28px_60px_-20px_rgba(0,0,0,0.9)] md:block">
          <div className="mx-auto grid max-w-7xl grid-cols-[1.35fr_0.75fr_1fr] gap-[34px] px-4 pb-8 pt-7 lg:px-8">
            {/* Coluna 1: a categoria em si. Sem "tipos" no schema, o card grande
                da categoria ocupa o lugar da grade de subcategorias do mock. */}
            <div className="flex flex-col gap-3.5">
              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">
                Categoria
              </span>
              {(() => {
                const { icon: Icon, tint } = getCategoryIcon(openCategory)
                return (
                  <button
                    type="button"
                    onClick={() => onSelect(openCategory)}
                    className="flex items-center gap-[13px] rounded-[13px] border border-[#262626] bg-[#0e0e0e] px-[15px] py-[13px] text-left transition-colors hover:border-foreground/25"
                  >
                    <span
                      className="flex size-[46px] shrink-0 items-center justify-center rounded-[11px]"
                      style={{ background: `radial-gradient(110% 110% at 50% 20%, color-mix(in oklab, ${tint} 22%, #171717), #171717)` }}
                    >
                      <Icon className="size-6" style={{ color: tint }} strokeWidth={1.4} />
                    </span>
                    <span className="flex flex-col gap-0.5">
                      <span className="text-[13px] font-bold capitalize text-white">{openCategory}</span>
                      <span className="text-[11px] font-medium text-[#7a7a7a]">
                        {categoryCounts[openCategory] ?? 0} produto{categoryCounts[openCategory] === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                )
              })()}
            </div>

            {/* Coluna 2: marcas reais dessa categoria */}
            <div className="flex flex-col gap-3">
              <span className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">Marcas</span>
              <div className="flex flex-col">
                {openBrands.slice(0, 6).map(({ brand, count: brandCount }) => (
                  <button
                    key={brand}
                    type="button"
                    onClick={() => onSelectBrand(openCategory, brand)}
                    className="flex items-center justify-between gap-2.5 py-[7px] text-left text-[13px] font-medium text-[#b4b4b4] transition-colors hover:text-white"
                  >
                    <span>{brand}</span>
                    <span className="text-[11px] text-[#5e5e5e]">{brandCount}</span>
                  </button>
                ))}
                {openBrands.length === 0 && (
                  <p className="py-[7px] text-[13px] text-[#5e5e5e]">Sem marca cadastrada.</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onSelect(openCategory)}
                style={{ color: getCategoryIcon(openCategory).tint }}
                className="mt-1 inline-flex items-center gap-[7px] text-left text-[12.5px] font-bold transition-opacity hover:opacity-80"
              >
                Ver todos os {categoryCounts[openCategory] ?? 0}
                <ArrowRight className="size-[13px]" strokeWidth={2.2} />
              </button>
            </div>

            {/* Coluna 3: produto em destaque da categoria */}
            <div className="flex flex-col gap-3">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">
                <Star className="size-3 fill-amber-400 text-amber-400" strokeWidth={0} />
                Em destaque
              </span>
              {previewProduct ? (
                <Link
                  href={`/${previewProduct.type === "bazaar" ? "bazar" : "loja"}/${previewProduct.slug}`}
                  className="flex gap-4 rounded-2xl border border-[#262626] p-4 transition-colors hover:border-foreground/25"
                  style={{ background: `radial-gradient(90% 120% at 100% 0%, color-mix(in oklab, ${getCategoryIcon(openCategory).tint} 12%, #0e0e0e), #0e0e0e)` }}
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
                      <span className="font-display text-[19px] font-bold text-emerald-400">
                        {formatBRL(previewProduct.promo_price_cents ?? previewProduct.price_cents)}
                      </span>
                      {previewProduct.promo_price_cents != null && previewProduct.promo_price_cents < previewProduct.price_cents && (
                        <span className="text-[11.5px] text-[#6e6e6e] line-through">{formatBRL(previewProduct.price_cents)}</span>
                      )}
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
