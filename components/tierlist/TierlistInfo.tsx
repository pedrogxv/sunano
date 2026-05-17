"use client"

import { useMemo, useState } from "react"
import { Clock, Info, ListChecks, Star, Tag } from "lucide-react"

import { useLocale } from "@/lib/locale-context"
import { cn } from "@/lib/utils"

type InfoTab = {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  content: React.ReactNode
}

export function TierlistInfo() {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const [activeTab, setActiveTab] = useState<string>("about")

  const tabs = useMemo<InfoTab[]>(() => {
    return [
      {
        id: "about",
        title: isEnglish ? "About" : "Sobre",
        icon: Info,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>
              {isEnglish
                ? "Peripherals are personal. This tierlist prioritizes practical performance, value, and consistency in real usage."
                : "Periféricos são pessoais. Esta tierlist prioriza performance prática, valor e consistência no uso real."}
            </p>
            <p>
              {isEnglish
                ? "Items are grouped by tier and then organized by mode: Performance, Value, and Recommended."
                : "Os itens são agrupados por tier e organizados por modo: Performance, Custo-benefício e Recomendado."}
            </p>
          </div>
        ),
      },
      {
        id: "categories",
        title: isEnglish ? "Categories" : "Categorias",
        icon: Tag,
        content: (
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>{isEnglish ? "Primary tags:" : "Tags principais:"}</p>
              <ul className="space-y-1.5 text-muted-foreground">
              <li>{isEnglish ? "Competitive: maximum performance focus" : "Competitivo: foco em performance máxima"}</li>
              <li>{isEnglish ? "Versatile: balanced all-around usage" : "Versátil: equilíbrio para uso geral"}</li>
              <li>{isEnglish ? "Value: best cost-benefit picks" : "Valor: melhores opções de custo-benefício"}</li>
            </ul>
          </div>
        ),
      },
      {
        id: "tiers",
        title: isEnglish ? "Tiers" : "Tiers",
        icon: Star,
        content: (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{isEnglish ? "GOAT / SS: absolute top-tier and elite picks." : "GOAT / SS: opções de elite e topo absoluto."}</p>
            <p>{isEnglish ? "S / A: premium choices with very strong consistency." : "S / A: escolhas premium com consistência muito forte."}</p>
            <p>{isEnglish ? "B / C / L: solid-to-niche picks with more tradeoffs." : "B / C / L: opções sólidas até de nicho, com mais concessões."}</p>
          </div>
        ),
      },
      {
        id: "criteria",
        title: isEnglish ? "Criteria" : "Criterios",
        icon: ListChecks,
        content: (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{isEnglish ? "Evaluation considers:" : "A avaliação considera:"}</p>
            <ul className="space-y-1.5 text-muted-foreground">
              <li>{isEnglish ? "Real-game usage and daily use" : "Uso real em jogos e no dia a dia"}</li>
              <li>{isEnglish ? "Build quality and materials" : "Qualidade de construção e materiais"}</li>
              <li>{isEnglish ? "Latency and consistency" : "Latência e consistência"}</li>
              <li>{isEnglish ? "Software, firmware, and support" : "Software, firmware e suporte"}</li>
            </ul>
          </div>
        ),
      },
      {
        id: "update",
        title: isEnglish ? "Latest Update" : "Ultima Atualizacao",
        icon: Clock,
        content: (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p className="text-primary">{isEnglish ? "April 2026" : "Abril 2026"}</p>
              <p>
                {isEnglish
                  ? "Lists are updated continuously based on new releases, firmware revisions, and market price changes."
                  : "As listas são atualizadas continuamente com novos lançamentos, revisões de firmware e mudanças de preço."}
              </p>
            </div>
        ),
      },
    ]
  }, [isEnglish])

  const activeContent = tabs.find((tab) => tab.id === activeTab) ?? tabs[0]

  return (
    <section className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="border-b border-border bg-muted/30 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <span className="size-2 rounded-sm bg-primary" />
          {isEnglish ? "Tierlist Information" : "Informações da Tierlist"}
        </h2>
      </div>

      <div className="flex overflow-x-auto border-b border-border bg-muted/20">
        {tabs.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex shrink-0 items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-all",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:bg-muted/30 hover:text-foreground"
              )}
            >
              <Icon className="size-4" />
              <span className="hidden sm:inline">{tab.title}</span>
            </button>
          )
        })}
      </div>

      <div className="p-4 md:p-5">{activeContent.content}</div>
    </section>
  )
}
