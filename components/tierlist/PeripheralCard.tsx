"use client"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useLocale } from "@/lib/locale-context"
import { cn } from "@/lib/utils"
import { CARD_TAG_STYLES, CARD_TIER_STYLES, TIER_THEMES } from "@/lib/tierlist-theme"
import { TierItemTooltipContent, type Ratings } from "./TierItemTooltipContent"

type Tag = "competitive" | "versatile" | "value" | "comfort"
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
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const tierStyle = item.tier ? CARD_TIER_STYLES[item.tier] : CARD_TIER_STYLES.L
  const tierTheme = item.tier ? TIER_THEMES[item.tier] : TIER_THEMES.L
  const primaryTag = item.tags[0]
  const tagStyle = primaryTag ? CARD_TAG_STYLES[primaryTag] : null
  const isGoat = item.tier === "GOAT"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "group relative cursor-pointer overflow-hidden rounded-lg border border-white/[0.10] bg-[#0a0e17]/90 transition-all duration-200",
            "hover:border-white/[0.22] hover:shadow-md hover:shadow-black/40",
            isGoat && "shadow-[0_0_14px_rgba(240,97,97,0.18)]",
          )}
        >
          {/* Tier accent bar */}
          <div
            className={cn("absolute bottom-0 left-0 top-0 w-[3px] bg-gradient-to-b", tierTheme.accent)}
          />

          {/* Image area */}
          <div className="relative ml-[3px] h-12 overflow-hidden bg-black/60">
            {isGoat && (
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-red-500/10 to-transparent" />
            )}
            {item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={item.name}
                className="h-full w-full object-contain p-0.5"
                src={item.image_url}
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
          <div className="ml-[3px] px-1.5 pb-1.5 pt-1">
            <p className="line-clamp-2 text-[10px] font-bold leading-tight text-slate-100">{item.name}</p>
            <div className="mt-0.5 flex items-center justify-between gap-1">
              <p className="truncate text-[8px] text-slate-500">{item.brand}</p>
              {tagStyle && (
                <div className={cn("size-1.5 shrink-0 rounded-full", tagStyle.dot)} />
              )}
            </div>
          </div>
        </div>
      </TooltipTrigger>

      <TooltipContent
        className="rounded-xl border border-white/[0.12] bg-[#0a0e17]/95 p-4 shadow-2xl backdrop-blur-md"
        sideOffset={12}
        side="bottom"
        align="center"
      >
        <TierItemTooltipContent
          name={item.name}
          brand={item.brand}
          categoryLabel={item.category}
          image_url={item.image_url}
          tier={item.tier}
          ratings={item.ratings ?? {}}
          isEnglish={isEnglish}
        />
      </TooltipContent>
    </Tooltip>
  )
}
