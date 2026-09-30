"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { RouteLink } from "@/components/ui/route-link"
import { ArrowLeft, Heart } from "lucide-react"

import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { usePageHeader } from "@/components/providers/page-header-context"
import { useStoreFavorites } from "@/components/providers/store-favorites-context"
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard"
import { StoreCategoryNav } from "@/components/store/StoreCategoryNav"
import type { StoreFilterOptions, StoreProductCard } from "@/lib/server/repositories/store-repository"

/** Lista de quem pediu: trocar de conta com a página aberta não mostra a lista anterior. */
type OwnedItems = { userId: string; items: StoreProductCard[] | null }

/**
 * /loja/favoritos: os produtos que a pessoa salvou pelo coração dos cards.
 * Os cards vêm de /api/store/favorites?products=1 (só produto ativo); o
 * coração de cada card continua funcionando aqui, e desfavoritar tira o card
 * da lista na hora.
 */
export function StoreFavoritesContent({ filterOptions }: { filterOptions: StoreFilterOptions }) {
  usePageHeader("Favoritos", "Produtos que você salvou na Loja")

  const { user, loading: authLoading } = useAuthUser()
  const { openLogin } = useAuthModal()
  const { isFavorite, loading: favoritesLoading } = useStoreFavorites()
  const userId = user?.id ?? null
  const [owned, setOwned] = useState<OwnedItems | null>(null)

  useEffect(() => {
    if (!userId) return
    let active = true
    fetch("/api/store/favorites?products=1", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { items?: StoreProductCard[] } | null) => {
        if (active) setOwned({ userId, items: data?.items ?? null })
      })
      .catch(() => {
        if (active) setOwned({ userId, items: null })
      })
    return () => {
      active = false
    }
  }, [userId])

  const settled = owned !== null && owned.userId === userId
  const items = settled ? owned.items : null
  // Desfavoritou aqui mesmo? Sai da lista sem recarregar.
  const visible = items && !favoritesLoading ? items.filter((item) => isFavorite(item.id)) : items

  return (
    <div>
      <StoreCategoryNav
        categories={filterOptions.categories}
        categoryCounts={filterOptions.categoryCounts}
        brandsByCategory={filterOptions.brandsByCategory}
        activeCategory={null}
        previewPool={items ?? []}
      />

      <div className="relative overflow-hidden border-b border-[#1c1c1c] bg-[#0b0f14] py-10 sm:py-14">
        <Heart
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-8 -right-6 size-[220px] fill-rose-400/[0.07] text-rose-400/[0.07] sm:size-[280px]"
          strokeWidth={0}
        />
        <div className="relative mx-auto flex max-w-7xl flex-col gap-3 px-4 lg:px-8">
          <Link
            href="/loja"
            className="inline-flex w-fit items-center gap-1.5 text-[13px] font-semibold text-[#9a9a9a] transition-colors hover:text-white"
          >
            <ArrowLeft className="size-3.5" />
            Voltar à loja
          </Link>
          <div className="flex flex-col gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#7a7a7a]">Loja</span>
            <h1 className="font-display text-3xl font-bold leading-tight tracking-[-0.02em] text-white sm:text-[42px]">
              Seus favoritos
            </h1>
          </div>
          {visible && visible.length > 0 && (
            <p className="text-[13px] font-semibold text-[#9a9a9a]">
              {visible.length} produto{visible.length === 1 ? "" : "s"} salvo{visible.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 pb-10 pt-7 sm:pb-[72px] sm:pt-10 lg:px-8">
        {!authLoading && !userId ? (
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-[#262626] bg-card p-12 text-center">
            <Heart className="size-8 text-rose-400/70" strokeWidth={1.8} />
            <p className="text-sm text-muted-foreground">Entre na sua conta para ver e salvar seus favoritos.</p>
            <button
              type="button"
              onClick={() => openLogin("/loja/favoritos")}
              className="mt-1 inline-flex h-10 items-center rounded-xl bg-white px-5 text-[13px] font-bold text-black transition-transform hover:scale-[1.02]"
            >
              Entrar
            </button>
          </div>
        ) : !settled ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        ) : visible === null ? (
          <div className="rounded-[18px] border border-[#262626] bg-card p-12 text-center">
            <p className="text-sm text-muted-foreground">Não foi possível carregar seus favoritos. Tente de novo em instantes.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-[18px] border border-[#262626] bg-card p-12 text-center">
            <Heart className="size-8 text-[#5e5e5e]" strokeWidth={1.8} />
            <p className="text-sm text-muted-foreground">Você ainda não favoritou nenhum produto.</p>
            <p className="text-xs text-muted-foreground/70">Toque no coração de um produto para guardar ele aqui.</p>
            <RouteLink
              href="/loja"
              className="mt-1 inline-flex h-10 items-center rounded-xl border border-[#2a2a2a] bg-[#141414] px-5 text-[13px] font-bold text-[#e8e8e8] transition-colors hover:border-foreground/25"
            >
              Explorar a loja
            </RouteLink>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-3.5 lg:grid-cols-4">
            {visible.map((product) => (
              <ProductCard key={product.id} {...product} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
