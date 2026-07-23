"use client"

import Link from "next/link"
import Image from "next/image"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { cn } from "@/lib/utils"
import { CARD_TAG_STYLES, CARD_TIER_STYLES } from "@/lib/tierlist-theme"
import { TierItemTooltipContent, type Ratings } from "./TierItemTooltipContent"

type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado"
type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null

interface PeripheralCardProps {
  id: string
  name: string
  brand: string
  image_url: string | null
  price: number
  tier: TierValue
  category: string
  tags: Tag[]
  ratings?: Ratings
  specs: {
    mouseShape?: "symmetrical" | "ergonomic"
    keyboardLayout?: string
    connectivity?: "wired" | "wireless"
    size?: "small" | "medium" | "large"
    surface?: "cloth" | "hybrid" | "glass"
    driver?: string
    profile?: string
  }
}

export function PeripheralCard({ ...item }: PeripheralCardProps) {
  const tierStyle = item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L
  const primaryTag = item.tags[0]
  const tagStyle = primaryTag ? CARD_TAG_STYLES[primaryTag] : null
  const isGoat = item.tier === "GOAT"
  const href = `/perifericos/${buildPeripheralSlug(item.name, item.id)}`

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Link e não div: o Radix Tooltip ignora input de toque por design, então no
            mobile o tooltip (que continha o único link) nunca abria e o card ficava
            sem navegação. O href aqui torna o card acessível por toque e teclado. */}
        <Link
          href={href}
          aria-label={item.name}
          className={cn(
            "group relative block cursor-pointer overflow-hidden rounded-lg border bg-card transition-all duration-[220ms] ease-out",
            "hover:z-10 hover:-translate-y-1 hover:scale-[1.3] hover:brightness-150",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            tierStyle.border,
            tierStyle.borderHover,
            tierStyle.glow,
            tierStyle.glowHover,
          )}
        >
          {/* Tier accent bar */}
          <div className={cn("absolute bottom-0 left-0 top-0 w-1.5", tierStyle.accent)} />

          {/* Image area */}
          <div className="relative ml-1.5 h-[53px] overflow-hidden bg-muted">
            {isGoat && (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-violet-500/15 to-transparent" />
            )}
            {item.image_url ? (
              <Image
                alt={item.name}
                src={item.image_url}
                fill
                sizes="(max-width: 768px) 30vw, 120px"
                className="object-contain p-0.5 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]"
              />
            ) : (
              <div
                className={cn(
                  "flex h-full items-center justify-center text-[10px] font-black",
                  tierStyle.bg,
                  tierStyle.text,
                )}
              >
                {item.brand.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="ml-1.5 px-2 pb-2 pt-1.5">
            <p className="line-clamp-2 text-[10px] font-semibold leading-tight text-foreground">{item.name}</p>
            <div className="mt-1 flex items-center justify-between gap-1">
              <p className="truncate text-[8px] text-muted-foreground">{item.brand}</p>
              {/* {tagStyle && (
                <div className={cn("size-1.5 shrink-0 rounded-full", tagStyle.dot)} />
              )} */}
            </div>
          </div>
        </Link>
      </TooltipTrigger>

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
    </Tooltip>
  )
}
