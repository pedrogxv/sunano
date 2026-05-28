"use client"

import { cn } from "@/lib/utils"
import { CARD_TAG_STYLES, CARD_TIER_STYLES, RATING_LEVEL_COLORS, TIER_THEMES } from "@/lib/tierlist-theme"

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

const TAG_LABELS: Record<Tag, { en: string; pt: string }> = {
  competitive: { en: "Competitive", pt: "Competitivo" },
  versatile: { en: "Bomba", pt: "Bomba" },
  value: { en: "Value", pt: "Custo-benefício" },
  cheap: { en: "Cheap", pt: "Barato" },
  expensive: { en: "Expensive", pt: "Caro" },
  light: { en: "Light", pt: "Leve" },
  heavy: { en: "Heavy", pt: "Pesado" },
  unbalanced: { en: "Unbalanced weight", pt: "Peso Desbalanceado" },
  dpi_deviation: { en: "DPI Deviation", pt: "DPI Deviation" },
  wobble_high: { en: "High wobble", pt: "Wooble Alto" },
  wobble_low: { en: "Low wobble", pt: "Wooble Baixo" },
  scroll_hard: { en: "Hard scroll", pt: "Scroll Duro" },
  scroll_soft: { en: "Soft scroll", pt: "Scroll Mole" },
  trimode: { en: "Trimode", pt: "Trimode" },
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

function formatTagLabel(tag: Tag, isEnglish?: boolean) {
  const label = TAG_LABELS[tag]
  if (!label) return formatLabel(tag)
  return isEnglish ? label.en : label.pt
}

function RatingRow({ label, value }: { label: string; value: number }) {
  const filled = Math.max(0, Math.min(6, Math.round(value)))
  const levelColor = RATING_LEVEL_COLORS[filled]
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium text-slate-300">{label}</span>
        <span className={cn("text-[11px] font-bold tabular-nums", levelColor.text)}>
          {filled}<span className="text-slate-600">/6</span>
        </span>
      </div>
      <div className="flex h-1.5 gap-0.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex-1 rounded-sm transition-colors",
              i < filled ? levelColor.bar : "bg-white/[0.06]",
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
  const tierLabel = tier ?? (isEnglish ? "Under Review" : "Sob Revisão")

  const labels = isEnglish ? RATING_LABELS_EN : RATING_LABELS_PT
  const ratingEntries = ratings
    ? RATING_ORDER.filter((key, index) => RATING_ORDER.indexOf(key) === index)
        .filter((key) => typeof ratings[key] === "number")
        .map((key) => ({
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

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div>
          <div className="flex flex-wrap gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11px] font-semibold",
                  CARD_TAG_STYLES[tag].bg,
                  CARD_TAG_STYLES[tag].text,
                  CARD_TAG_STYLES[tag].border,
                )}
              >
                {formatTagLabel(tag, isEnglish)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ratings (public-first) */}
      {ratings && (
        <div>
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

      {/* Specs (admin only) */}
      {specs && specs.length > 0 && (
        <div>
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
