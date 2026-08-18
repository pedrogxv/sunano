"use client"

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
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 min-[400px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} {...product} />
        ))}
      </div>
    </div>
  )
}
