"use client"

import { useEffect, useMemo, useState } from "react"
import { Bookmark } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAuthUser } from "@/components/providers/auth-context"
import { ProductCard } from "@/components/store/ProductCard"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

interface StoreProductGridProps {
  products: StoreProductCard[]
  title?: string
  description?: string
}

export function StoreProductGrid({ products, title, description }: StoreProductGridProps) {
  const { user } = useAuthUser()
  const userId = user?.id ?? null
  const [wishlistedIds, setWishlistedIds] = useState<Set<string> | null>(null)
  const [onlyWishlisted, setOnlyWishlisted] = useState(false)

  function handleWishlistChange(productId: string, wishlisted: boolean) {
    setWishlistedIds((prev) => {
      const next = new Set(prev ?? [])
      if (wishlisted) next.add(productId)
      else next.delete(productId)
      return next
    })
  }

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

  const visibleProducts = useMemo(() => {
    if (!onlyWishlisted || !wishlistedIds) return products
    return products.filter((product) => wishlistedIds.has(product.id))
  }, [products, onlyWishlisted, wishlistedIds])

  return (
    <div>
      {(title || user) && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          {title && (
            <div className="space-y-1">
              <h1 className="text-2xl font-black tracking-tight text-foreground">{title}</h1>
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          )}

          {user && (
            <button
              type="button"
              onClick={() => setOnlyWishlisted((prev) => !prev)}
              disabled={!wishlistedIds}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all",
                onlyWishlisted
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-border bg-transparent text-muted-foreground hover:border-primary/40 hover:bg-primary/10 hover:text-primary",
                !wishlistedIds && "opacity-60"
              )}
            >
              <Bookmark className={cn("size-3.5", onlyWishlisted && "fill-current")} />
              Só itens na minha lista de compras
            </button>
          )}
        </div>
      )}

      {onlyWishlisted && visibleProducts.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
          Nenhum produto da sua lista de compras está disponível aqui.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {visibleProducts.map((product) => (
            <ProductCard
              key={product.id}
              {...product}
              wishlisted={wishlistedIds?.has(product.id) ?? false}
              onWishlistChange={handleWishlistChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}
