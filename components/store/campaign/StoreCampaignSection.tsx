"use client"

import { useCallback, useRef, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

import { STORE_CARD_RAIL_CLASS, STORE_CARD_RAIL_HEADER_CLASS } from "@/components/store/card-rail"
import { CampaignHeader } from "@/components/store/campaign/CampaignHeader"
import { ProductCard } from "@/components/store/ProductCard"
import { useCardRailBleed } from "@/lib/hooks/use-card-rail-bleed"
import type { StoreLiveCampaign } from "@/lib/server/repositories/store-campaigns-repository"

/**
 * Seção da campanha sazonal no ar (Black Friday, Natal...), no topo da Home
 * da Loja, acima dos Destaques: cabeçalho do tema + os produtos escolhidos no
 * painel (/admin/store/campanhas), com a pele da campanha.
 *
 * Quem decide se há campanha é o servidor (`getLiveStoreCampaign`). Aqui só
 * se garante a saída: a Home é cacheada, então a página pode ter sido gerada
 * antes do fim do prazo. O contador zera assim que hidrata (ou na hora certa,
 * com a página aberta) e tira a seção da tela.
 */
export function StoreCampaignSection({ campaign }: { campaign: StoreLiveCampaign }) {
  const [live, setLive] = useState(true)
  const end = useCallback(() => setLive(false), [])
  const railRef = useRef<HTMLDivElement>(null)
  useCardRailBleed(railRef)

  if (!live) return null

  const arrows =
    campaign.products.length > 5 ? (
      <div className="hidden items-center gap-2.5 sm:flex">
        <button
          type="button"
          onClick={() => railRef.current?.scrollBy({ left: -300, behavior: "smooth" })}
          aria-label="Rolar para trás"
          className="flex size-8 items-center justify-center rounded-[10px] border border-white/15 text-white/60 transition-colors hover:text-white"
        >
          <ChevronLeft className="size-[15px]" />
        </button>
        <button
          type="button"
          onClick={() => railRef.current?.scrollBy({ left: 300, behavior: "smooth" })}
          aria-label="Rolar para frente"
          className="flex size-8 items-center justify-center rounded-[10px] border border-white/20 text-white/85 transition-colors hover:bg-white/5 hover:text-white"
        >
          <ChevronRight className="size-[15px]" />
        </button>
      </div>
    ) : null

  return (
    <section data-campaign-theme={campaign.theme} className="flex flex-col gap-3.5 sm:gap-[18px]">
      <CampaignHeader
        theme={campaign.theme}
        title={campaign.title}
        subtitle={campaign.subtitle}
        endsAt={campaign.endsAt}
        actions={arrows}
        onExpire={end}
        className={STORE_CARD_RAIL_HEADER_CLASS}
      />
      <div ref={railRef} className={STORE_CARD_RAIL_CLASS}>
        {campaign.products.map((product) => (
          <div key={product.id} className="w-[188px] shrink-0 sm:w-[258px]">
            <ProductCard {...product} skin="campaign" />
          </div>
        ))}
      </div>
    </section>
  )
}
