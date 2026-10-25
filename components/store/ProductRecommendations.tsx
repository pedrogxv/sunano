"use client"

import { useRef } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { ProductCard } from "@/components/store/ProductCard"
import { STORE_CARD_RAIL_CLASS, STORE_CARD_RAIL_HEADER_CLASS } from "@/components/store/card-rail"
import { cn } from "@/lib/utils"
import { useCardRailBleed } from "@/lib/hooks/use-card-rail-bleed"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

/**
 * "Você também pode gostar" da página de produto. A escolha é do servidor
 * (`listProductRecommendations`); aqui é só o trilho, com cards menores que
 * os da Home para não competir com o produto aberto.
 */
export function ProductRecommendations({ items }: { items: StoreProductCard[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  useCardRailBleed(scrollRef)
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-3.5 sm:gap-4">
      <div className={cn("flex items-end justify-between gap-3", STORE_CARD_RAIL_HEADER_CLASS)}>
        <div className="flex flex-col gap-1">
          <p className="text-[10.5px] font-extrabold uppercase leading-none tracking-[0.14em] text-[#7a7a7a]">
            Recomendados para você
          </p>
          <h2 className="font-display text-2xl font-bold text-foreground">Você também pode gostar</h2>
        </div>
        {items.length > 4 && (
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: -440, behavior: "smooth" })}
              aria-label="Recomendações: rolar para trás"
              className="flex size-8 items-center justify-center rounded-[10px] border border-[#2a2a2a] text-[#6e6e6e] transition-colors hover:text-white"
            >
              <ChevronLeft className="size-[15px]" />
            </button>
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: 440, behavior: "smooth" })}
              aria-label="Recomendações: rolar para frente"
              className="flex size-8 items-center justify-center rounded-[10px] border border-[#333333] text-[#dcdcdc] transition-colors hover:bg-white/5 hover:text-white"
            >
              <ChevronRight className="size-[15px]" />
            </button>
          </div>
        )}
      </div>
      {/* A página tem `px-4 md:px-6`: sem a medida, o trilho sangra até a mesma borda. */}
      <div ref={scrollRef} className={cn(STORE_CARD_RAIL_CLASS, "md:[--rail-pad:1.5rem] lg:[--rail-pad:1.5rem]")}>
        {items.map((product) => (
          <div key={product.id} className="w-[172px] shrink-0 sm:w-[212px]">
            <ProductCard {...product} />
          </div>
        ))}
      </div>
    </section>
  )
}
