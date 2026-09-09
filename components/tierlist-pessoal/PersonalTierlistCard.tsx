"use client"

import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { mapTier } from "@/lib/tier-utils"
import { tierCardVars } from "@/lib/personal-tierlist-theme"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import {
  TierItemTooltipContent,
  type TierItemTooltipContentProps,
} from "@/components/tierlist/TierItemTooltipContent"
import type { TierlistItem, TierlistTierDef } from "@/lib/personal-tierlist"

/**
 * Card de periférico da tierlist pessoal, com o mesmo hover da tierlist
 * oficial: sobe, acende na cor do tier e abre o tooltip com notas e chips
 * (`TierItemTooltipContent`, o mesmo componente usado em
 * `components/tierlist/PeripheralCard.tsx` e nos grids do perfil).
 *
 * O tooltip mostra o tier **oficial** do site (`siteTier`), não o do membro:
 * a letra colorida à esquerda da linha já diz onde o membro colocou o item, e
 * repetir isso no hover apagaria a informação mais útil — o veredito do site,
 * que é justamente com o que a opinião do membro contrasta.
 */
export function PersonalTierlistCard({
  item,
  tier,
  variant = "full",
}: {
  item: TierlistItem
  tier: TierlistTierDef
  variant?: "full" | "preview"
}) {
  const cardVars = tierCardVars(tier.color)
  const isPreview = variant === "preview"
  const href = `/perifericos/${buildPeripheralSlug(item.peripheral.name, item.peripheralId)}`

  const image = item.peripheral.imageUrl ? (
    <Image
      src={item.peripheral.imageUrl}
      alt={item.peripheral.name}
      fill
      sizes={isPreview ? "44px" : "104px"}
      className={cn(
        "object-contain",
        isPreview ? "p-1 pl-1.5" : "p-0.5 drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)] group-hover:brightness-[.67]"
      )}
    />
  ) : (
    <div className="flex size-full items-center justify-center text-[10px] font-black text-white/60">
      {(item.peripheral.brandName ?? item.peripheral.name).slice(0, 2).toUpperCase()}
    </div>
  )

  // Borda/glow do card vêm de custom properties calculadas a partir da cor
  // do tier (`tierCardVars`) — classes Tailwind arbitrárias referenciando
  // `var(--tier-*)` mantêm o hover em CSS puro, sem precisar de estado JS
  // pra cada card (mesmo efeito visual de `CARD_TIER_STYLES`, só computado).
  const card = isPreview ? (
    <Link
      href={href}
      aria-label={item.peripheral.name}
      style={cardVars}
      className={cn(
        "group relative block size-11 shrink-0 overflow-hidden rounded-lg border bg-black transition-all duration-[220ms] ease-out",
        "hover:z-10 hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "border-[color:var(--tier-border)] hover:border-[color:var(--tier-color)]",
        "shadow-[0_0_12px_var(--tier-glow)]",
        "hover:shadow-[0_0_10px_2px_var(--tier-glow-strong),0_0_28px_6px_var(--tier-glow-mid),0_0_60px_16px_var(--tier-glow-soft)]"
      )}
    >
      <div className="absolute inset-y-0 left-0 z-10 w-1 bg-[var(--tier-color)]" />
      {image}
    </Link>
  ) : (
    <Link
      href={href}
      aria-label={item.peripheral.name}
      style={cardVars}
      className={cn(
        "group relative block w-[104px] shrink-0 overflow-hidden rounded-lg border bg-black transition-all duration-[220ms] ease-out",
        // Mesmo gesto da tierlist oficial: sobe, cresce e acende no hover.
        "hover:z-10 hover:-translate-y-1 hover:scale-[1.3] hover:brightness-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
        "border-[color:var(--tier-border)] hover:border-[color:var(--tier-color)]",
        "shadow-[0_0_12px_var(--tier-glow)]",
        "hover:shadow-[0_0_10px_2px_var(--tier-glow-strong),0_0_28px_6px_var(--tier-glow-mid),0_0_60px_16px_var(--tier-glow-soft)]"
      )}
    >
      <div className="absolute inset-y-0 left-0 z-10 w-1.5 bg-[var(--tier-color)]" />

      <div className="relative ml-1.5 h-[62px] overflow-hidden" style={{ background: "var(--card-image-bg)" }}>
        {image}
      </div>

      <div className="ml-1.5 px-2 pb-2 pt-1.5">
        <p className="line-clamp-2 text-[10px] font-semibold leading-tight text-white">{item.peripheral.name}</p>
        {item.peripheral.brandName && (
          <p className="mt-1 truncate text-[8px] text-white/50">{item.peripheral.brandName}</p>
        )}
      </div>
    </Link>
  )

  return (
    <Tooltip>
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent
        className="rounded-xl border border-border bg-popover p-4 shadow-2xl backdrop-blur-md"
        sideOffset={12}
        side="bottom"
        align="center"
      >
        <Link href={href} aria-label={item.peripheral.name} className="block cursor-pointer hover:opacity-95">
          <TierItemTooltipContent
            name={item.peripheral.name}
            brand={item.peripheral.brandName ?? ""}
            categoryLabel={item.peripheral.category}
            image_url={item.peripheral.imageUrl}
            tier={item.peripheral.siteTier ? mapTier(item.peripheral.siteTier) : null}
            ratings={item.peripheral.ratings}
            tags={item.peripheral.tags as TierItemTooltipContentProps["tags"]}
          />
        </Link>
      </TooltipContent>
    </Tooltip>
  )
}
