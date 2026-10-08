"use client"

import { useRef } from "react"
import { ChevronLeft, ChevronRight, Megaphone, Rocket } from "lucide-react"

import { LaunchCard } from "@/components/store/LaunchCard"
import { PreorderCard } from "@/components/store/PreorderCard"
import type { StoreProductCard } from "@/lib/server/repositories/store-repository"

function Row({
  label,
  icon: Icon,
  iconClassName,
  children,
  count,
}: {
  label: string
  icon: React.ElementType
  iconClassName: string
  children: React.ReactNode
  count: number
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[15px] font-bold text-[#dcdcdc] sm:text-[17px]">
          <Icon className={`size-4 sm:size-[18px] ${iconClassName}`} strokeWidth={2.2} />
          {label}
        </p>
        {count > 3 && (
          <div className="hidden items-center gap-2 sm:flex">
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: -320, behavior: "smooth" })}
              aria-label={`${label}: rolar para trás`}
              className="flex size-8 items-center justify-center rounded-[10px] border border-[#2a2a2a] text-[#6e6e6e] transition-colors hover:text-white"
            >
              <ChevronLeft className="size-[15px]" />
            </button>
            <button
              type="button"
              onClick={() => scrollRef.current?.scrollBy({ left: 320, behavior: "smooth" })}
              aria-label={`${label}: rolar para frente`}
              className="flex size-8 items-center justify-center rounded-[10px] border border-[#333333] text-[#dcdcdc] transition-colors hover:bg-white/5 hover:text-white"
            >
              <ChevronRight className="size-[15px]" />
            </button>
          </div>
        )}
      </div>
      <div ref={scrollRef} className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 pt-1 scrollbar-hide sm:gap-3.5 lg:-mx-8 lg:px-8">
        {children}
      </div>
    </div>
  )
}

/**
 * "DROPS com SUNANO" da Home (lançamentos e pré-venda). Pré-venda vem no card próprio
 * (`PreorderCard`: lote, previsão, quanto sobra, "Reservar na pré-venda");
 * lançamento é produto à venda, no `LaunchCard` (o mesmo card em violeta).
 * Os dois mostram a contagem do prazo (lib/store-sale-window.ts).
 * Separadas em duas fileiras porque são compras diferentes: uma chega quando
 * o lote chegar, a outra sai em até 15 dias úteis.
 */
export function LaunchPreorderSection({
  preorders,
  launches,
}: {
  preorders: StoreProductCard[]
  launches: StoreProductCard[]
}) {
  if (preorders.length === 0 && launches.length === 0) return null

  return (
    <section className="flex flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-[3px] sm:gap-1">
        <p className="flex items-center gap-[5px] text-[10px] font-extrabold uppercase leading-none tracking-[0.14em] text-[#7a7a7a] sm:gap-1.5 sm:text-[10.5px]">
          <Rocket className="size-[11px] shrink-0 text-amber-400 sm:size-3" strokeWidth={2.2} />
          Novidades
        </p>
        <h2 className="font-display text-[21px] font-bold text-white sm:text-[26px]">DROPS com SUNANO</h2>
      </div>

      {preorders.length > 0 && (
        <Row label="Pré-venda" icon={Rocket} iconClassName="text-amber-400" count={preorders.length}>
          {preorders.map((product) => (
            <div key={product.id} className="w-[250px] shrink-0 sm:w-[290px]">
              <PreorderCard {...product} />
            </div>
          ))}
        </Row>
      )}

      {launches.length > 0 && (
        <Row label="Lançamentos" icon={Megaphone} iconClassName="text-violet-400" count={launches.length}>
          {launches.map((product) => (
            <div key={product.id} className="w-[250px] shrink-0 sm:w-[290px]">
              <LaunchCard {...product} />
            </div>
          ))}
        </Row>
      )}
    </section>
  )
}
