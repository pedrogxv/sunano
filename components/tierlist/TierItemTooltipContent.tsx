"use client"

import { cn } from "@/lib/utils"
import { CARD_TAG_STYLES, CARD_TIER_STYLES, TIER_THEMES } from "@/lib/tierlist-theme"

type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode"

export type RatingKey = "overall" | "performance" | "build" | "value" | "software" | "battery" | "qc"
export type Ratings = Partial<Record<RatingKey, number>>

const RATING_ORDER: RatingKey[] = ["overall", "performance", "build", "value", "software", "battery", "qc"]

const RATING_LABELS_PT: Record<RatingKey, string> = {
  overall: "Geral",
  performance: "Performance",
  build: "Construção",
  value: "Custo-Benefício",
  software: "Software",
  battery: "Bateria",
  qc: "Controle de Qualidade",
}

const RATING_LABELS_EN: Record<RatingKey, string> = {
  overall: "Overall",
  performance: "Performance",
  build: "Build",
  value: "Value",
  software: "Software",
  battery: "Battery",
  qc: "QC",
}

export interface TierItemTooltipContentProps {
  name: string
  brand: string
  categoryLabel: string
  image_url: string | null
  tier: Tier | null
  isEnglish?: boolean
  // Public-only field (rating-first design)
  ratings?: Ratings
  // Legacy fields (admin still uses these). Render only when provided.
  tags?: Tag[]
  specs?: Array<{ label: string; value: string }>
  displayPrice?: string
  priceBand?: string
}

function formatLabel(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function ratingColor(value: number) {
  if (value >= 5) return "bg-emerald-500"
  if (value >= 4) return "bg-primary"
  if (value >= 3) return "bg-amber-500"
  if (value >= 2) return "bg-orange-500"
  return "bg-rose-500"
}

function ratingTextColor(value: number) {
  if (value >= 5) return "text-emerald-300"
  if (value >= 4) return "text-primary"
  if (value >= 3) return "text-amber-300"
  if (value >= 2) return "text-orange-300"
  return "text-rose-300"
}

function RatingRow({ label, value }: { label: string; value: number }) {
  const filled = Math.max(0, Math.min(6, value))
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-300">{label}</span>
        <span className={cn("text-[11px] font-bold tabular-nums", ratingTextColor(filled))}>
          {filled}<span className="text-slate-600">/6</span>
        </span>
      </div>
      <div className="flex h-1.5 gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm transition-colors",
              i < filled ? ratingColor(filled) : "bg-white/[0.06]",
            )}
          />
        ))}
      </div>
    </div>
  )
}

export function TierItemTooltipContent({
  name,
  brand,
  categoryLabel,
  image_url,
  tier,
  isEnglish,
  ratings,
  tags,
  specs,
  displayPrice,
  priceBand,
}: TierItemTooltipContentProps) {
  const tierStyle = tier ? CARD_TIER_STYLES[tier] : CARD_TIER_STYLES.L
  const tierTheme = tier ? TIER_THEMES[tier] : TIER_THEMES.L
  const tierLabel = tier ?? (isEnglish ? "No tier" : "Sem tier")

  const labels = isEnglish ? RATING_LABELS_EN : RATING_LABELS_PT
  const ratingEntries = ratings
    ? RATING_ORDER.filter((key) => typeof ratings[key] === "number").map((key) => ({
        key,
        label: labels[key],
        value: ratings[key] as number,
      }))
    : []

  return (
    <div className="w-[260px] space-y-3">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl text-sm font-bold shadow-lg",
            tierStyle.bg,
            tierStyle.text,
          )}
        >
          {image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image_url} alt={name} className="h-full w-full object-contain p-0.5" />
          ) : (
            brand.slice(0, 2).toUpperCase()
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-slate-100">{name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-400">{brand}</p>
          <p className="mt-0.5 text-[10px] capitalize text-slate-600">{categoryLabel}</p>
        </div>
      </div>

      {/* Rank (tier badge) */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "rounded-md bg-gradient-to-r px-2.5 py-1 text-[11px] font-black",
            tierTheme.accent,
            tierTheme.textColor,
          )}
        >
          {tierLabel}
        </span>
        {displayPrice && (
          <span className="text-sm font-bold text-emerald-400">{displayPrice}</span>
        )}
        {priceBand && (
          <span className="rounded bg-white/[0.08] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-slate-400">
            {priceBand}
          </span>
        )}
      </div>

      {/* Ratings (public-first) */}
      {ratings && (
        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {isEnglish ? "Ratings" : "Notas"}
          </p>
          {ratingEntries.length > 0 ? (
            <div className="space-y-2">
              {ratingEntries.map((entry) => (
                <RatingRow key={entry.key} label={entry.label} value={entry.value} />
              ))}
            </div>
          ) : (
            <p className="text-[11px] text-slate-500">
              {isEnglish ? "No ratings yet" : "Sem avaliações ainda"}
            </p>
          )}
        </div>
      )}

      {/* Tags (admin only) */}
      {tags && tags.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Tags</p>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  CARD_TAG_STYLES[tag].bg,
                  CARD_TAG_STYLES[tag].text,
                  CARD_TAG_STYLES[tag].border,
                )}
              >
                <span className={cn("size-1.5 rounded-full", CARD_TAG_STYLES[tag].dot)} />
                {formatLabel(tag)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Specs (admin only) */}
      {specs && specs.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            {isEnglish ? "Specifications" : "Especificações"}
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {specs.slice(0, 4).map((spec) => (
              <div
                key={spec.label}
                className="rounded-md border border-white/[0.08] bg-white/[0.04] px-2.5 py-2"
              >
                <p className="text-[9px] font-medium text-slate-500">{spec.label}</p>
                <p className="text-xs font-semibold text-slate-100">{spec.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
