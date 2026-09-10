"use client"

import { useMemo } from "react"
import { ChevronDown, Clock, Info, ListChecks, Star, Tag, Tags } from "lucide-react"

import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import { formatTierlistDate } from "@/lib/format-tierlist-date"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"

type InfoSection = {
  id: string
  title: string
  icon: React.ComponentType<{ className?: string }>
  content: React.ReactNode
}

/** Seções sempre visíveis; o resto entra no dropdown "Mais". */
const PRIMARY_IDS = new Set(["about", "categories", "criteria"])

type LatestUpdate = {
  latestUpdateDescription: string
  updatedAt: string
}

/**
 * Painel "Como funciona" da Tierlist — accordion vertical, sem scroll
 * horizontal. Sobre, Categorias e Critérios ficam à mostra; Tags, Tiers e
 * Última atualização entram recolhidos num bloco "Mais".
 *
 * Vive dentro de `TierlistPageHeader` e só abre quando o visitante quer o
 * contexto — a primeira dobra fica pra tierlist em si.
 */
export function TierlistInfo({ latestUpdate }: { latestUpdate?: LatestUpdate | null }) {
  const t = useT()
  const { locale } = useLocale()

  const sections = useMemo<InfoSection[]>(() => {
    return [
      {
        id: "about",
        title: t.tierlist.about.title,
        icon: Info,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t.tierlist.about.p1}</p>
            <p>{t.tierlist.about.p2}</p>
            <p>{t.tierlist.about.p3}</p>
          </div>
        ),
      },
      {
        id: "categories",
        title: t.tierlist.categoriesTab.title,
        icon: Tag,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t.tierlist.categoriesTab.p1}</p>
            <p>{t.tierlist.categoriesTab.p2}</p>
          </div>
        ),
      },
      {
        id: "tags",
        title: t.tierlist.tagsTab.title,
        icon: Tags,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t.tierlist.tagsTab.p1}</p>
            <p>{t.tierlist.tagsTab.p2}</p>
          </div>
        ),
      },
      {
        id: "tiers",
        title: t.tierlist.tiers.title,
        icon: Star,
        content: (
          <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
            <p>{t.tierlist.tiers.intro}</p>
            <ul className="space-y-1.5">
              <li>{t.tierlist.tiers.goat}</li>
              <li>{t.tierlist.tiers.ss}</li>
              <li>{t.tierlist.tiers.s}</li>
              <li>{t.tierlist.tiers.a}</li>
              <li>{t.tierlist.tiers.b}</li>
              <li>{t.tierlist.tiers.c}</li>
              <li>{t.tierlist.tiers.l}</li>
              <li>{t.tierlist.tiers.u}</li>
            </ul>
          </div>
        ),
      },
      {
        id: "criteria",
        title: t.tierlist.criteria.title,
        icon: ListChecks,
        content: (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>{t.tierlist.criteria.intro}</p>
            <ul className="space-y-1.5">
              <li>{t.tierlist.criteria.item1}</li>
              <li>{t.tierlist.criteria.item2}</li>
              <li>{t.tierlist.criteria.item3}</li>
              <li>{t.tierlist.criteria.item4}</li>
            </ul>
          </div>
        ),
      },
      {
        id: "update",
        title: t.tierlist.latestUpdate.title,
        icon: Clock,
        content: (
          <div className="space-y-2 text-sm text-muted-foreground">
            {latestUpdate?.updatedAt && (
              <p className="font-medium text-foreground">
                {formatTierlistDate(latestUpdate.updatedAt, locale)}
              </p>
            )}
            <p>{latestUpdate?.latestUpdateDescription || t.tierlist.latestUpdate.description}</p>
          </div>
        ),
      },
    ]
  }, [t, latestUpdate, locale])

  const primary = sections.filter((s) => PRIMARY_IDS.has(s.id))
  const secondary = sections.filter((s) => !PRIMARY_IDS.has(s.id))

  const renderItem = (section: InfoSection) => {
    const Icon = section.icon
    return (
      <AccordionItem key={section.id} value={section.id}>
        <AccordionTrigger className="hover:no-underline">
          <span className="flex items-center gap-2.5">
            <Icon className="size-4 text-primary" />
            <span className="font-semibold text-foreground">{section.title}</span>
          </span>
        </AccordionTrigger>
        <AccordionContent>{section.content}</AccordionContent>
      </AccordionItem>
    )
  }

  return (
    <div className="w-full">
      <Accordion type="single" collapsible className="w-full">
        {primary.map(renderItem)}
      </Accordion>

      <details className="group border-t border-border/60">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 py-3 text-xs font-semibold text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
          {t.tierlist.moreInfo}
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
        </summary>
        <Accordion type="single" collapsible className="w-full">
          {secondary.map(renderItem)}
        </Accordion>
      </details>
    </div>
  )
}
