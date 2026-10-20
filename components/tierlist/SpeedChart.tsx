"use client"

import { useMemo, useState } from "react"
import Link from "next/link"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { useLocale } from "@/components/providers/locale-context"
import { formatSpeedChartValue, readSpeedChartPoint, type SpeedChartPoint } from "@/lib/speed-chart"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { CARD_SURFACE } from "@/lib/ui-styles"
import type { Tag } from "@/lib/tag-options"
import { TierItemTooltipContent, type Ratings } from "./TierItemTooltipContent"
import { SPEED_CHART_THUMB, SpeedChartPlane, SpeedChartThumb, speedChartPosition } from "./SpeedChartPlane"

type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"

interface SpeedChartItem {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: string
  tier: Tier | null
  tags: Tag[]
  ratings?: Ratings
  specs: Record<string, unknown>
}

/**
 * Aba "Velocidade" da Tierlist de mousepad, glasspad e feet: cada periférico
 * vira a própria foto no plano velocidade × textura (lib/speed-chart.ts).
 * Recebe a lista já filtrada pela barra de filtros; quem não tem posição
 * gravada simplesmente não aparece.
 */
export function SpeedChart({ items }: { items: SpeedChartItem[] }) {
  const t = useT()
  const { locale } = useLocale()
  const labels = t.tierlist.speedChart

  // Ordem por nome: a sobreposição (quem fica por cima) não muda entre visitas.
  const placed = useMemo(
    () =>
      items
        .flatMap((item) => {
          const point = readSpeedChartPoint(item.specs)
          return point ? [{ item, point }] : []
        })
        .sort((a, b) => a.item.name.localeCompare(b.item.name)),
    [items],
  )

  if (placed.length === 0) {
    return (
      <div className={cn("rounded-xl border p-8 text-center text-sm text-muted-foreground", CARD_SURFACE)}>
        {items.length === 0 ? t.tierlist.noItems : labels.empty}
      </div>
    )
  }

  return (
    <section className="space-y-2">
      <SpeedChartPlane>
        {placed.map(({ item, point }) => (
          <SpeedChartMarker key={item.id} item={item} point={point} />
        ))}
      </SpeedChartPlane>

      <p className="px-1 text-xs text-muted-foreground">{labels.disclaimer}</p>

      <ul className="sr-only">
        {placed.map(({ item, point }) => (
          <li key={item.id}>
            {labels.itemSummary(
              item.name,
              formatSpeedChartValue(point.speed, locale),
              formatSpeedChartValue(point.texture, locale),
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

function SpeedChartMarker({ item, point }: { item: SpeedChartItem; point: SpeedChartPoint }) {
  // Tooltip controlado, como no PeripheralCard: o conteúdo só monta quando abre.
  const [open, setOpen] = useState(false)
  const href = `/perifericos/${buildPeripheralSlug(item.name, item.id)}`

  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <Link
          href={href}
          aria-label={item.name}
          style={speedChartPosition(point)}
          className={cn(
            "absolute -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-md border border-border/70 shadow-[0_4px_12px_rgba(0,0,0,0.45)] transition-[scale] duration-200",
            "hover:z-20 hover:scale-125 focus-visible:z-20 focus-visible:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            SPEED_CHART_THUMB,
          )}
        >
          <SpeedChartThumb name={item.name} brand={item.brand} imageUrl={item.image_url} />
        </Link>
      </TooltipTrigger>

      {open && (
        <TooltipContent
          className="rounded-xl border border-border bg-popover p-4 shadow-2xl backdrop-blur-md"
          sideOffset={12}
          side="bottom"
          align="center"
        >
          <Link href={href} aria-label={item.name} className="block cursor-pointer hover:opacity-95">
            <TierItemTooltipContent
              name={item.name}
              brand={item.brand}
              categoryLabel={item.category}
              image_url={item.image_url}
              tier={item.tier}
              ratings={item.ratings ?? {}}
              tags={item.tags}
            />
          </Link>
        </TooltipContent>
      )}
    </Tooltip>
  )
}
