"use client"

import { useMemo, useState, useEffect } from "react"

import { PeripheralCard } from "./PeripheralCard"
import { useLocale } from "@/lib/locale-context"
import { cn } from "@/lib/utils"
import {
  RECOMMENDED_COLUMN_COLORS,
  TAG_COLUMN_COLORS,
  TIER_THEMES,
  VALUE_COLUMN_COLORS,
} from "@/lib/tierlist-theme"

type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode"
type RatingMode = "oled" | "performance" | "value" | "recommended" | "soundTyping"
type PriceBand = "budget" | "mid" | "premium"
type RatingKey = "overall" | "performance" | "build" | "value" | "software" | "battery" | "qc"
type Ratings = Partial<Record<RatingKey, number>>

interface Peripheral {
  id: string
  name: string
  brand: string
  image_url: string | null
  category: string
  tier: TierValue
  price: number
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
    panelType?: string
    adminValueBand?: string
    adminRecommendedBand?: string
    adminSoundProfile?: string
    adminTypingFeel?: string
  }
}

interface TierRow {
  key: Tier
  label: string
  description: string
  gradient: string
  textColor: string
}

interface ModeColumn {
  key: string
  title: string
  color: string
}

interface ModeConfig {
  description: string
  columns: ModeColumn[]
  getColumnKeys: (item: Peripheral) => string[]
  sortItems: (items: Peripheral[]) => Peripheral[]
}

const TIER_ROWS: TierRow[] = [
  {
    key: "GOAT",
    label: "GOAT",
    description: "Elite - Referencia absoluta",
    gradient: TIER_THEMES.GOAT.accent,
    textColor: TIER_THEMES.GOAT.textColor,
  },
  {
    key: "SS",
    label: "SS",
    description: "Extremo - Quase perfeito",
    gradient: TIER_THEMES.SS.accent,
    textColor: TIER_THEMES.SS.textColor,
  },
  {
    key: "S",
    label: "S",
    description: "Top - Excelente escolha",
    gradient: TIER_THEMES.S.accent,
    textColor: TIER_THEMES.S.textColor,
  },
  {
    key: "A",
    label: "A",
    description: "Muito bom - Consistente e forte",
    gradient: TIER_THEMES.A.accent,
    textColor: TIER_THEMES.A.textColor,
  },
  {
    key: "B",
    label: "B",
    description: "Bom - Opção sólida",
    gradient: TIER_THEMES.B.accent,
    textColor: TIER_THEMES.B.textColor,
  },
  {
    key: "C",
    label: "C",
    description: "Ok - Funciona bem com limites",
    gradient: TIER_THEMES.C.accent,
    textColor: TIER_THEMES.C.textColor,
  },
  {
    key: "L",
    label: "L",
    description: "Inferior - Apenas para casos específicos",
    gradient: TIER_THEMES.L.accent,
    textColor: TIER_THEMES.L.textColor,
  },
]

const RATING_MODES: { key: RatingMode; label: string }[] = [
  { key: "oled", label: "OLED" },
  { key: "performance", label: "Performance" },
  { key: "value", label: "Custo-Beneficio" },
  { key: "recommended", label: "Recomendado" },
]

// Labels específicos por categoria para MOUSEPAD e GLASSPAD
function getRatingModeLabel(mode: RatingMode, category: string): string {
  if (category === "mousepad" || category === "glasspad") {
    if (mode === "performance") return "Geral"
    if (mode === "value") return "Nacional"
    if (mode === "recommended") return "Recomendado"
  }
  
  const modeMap: Record<RatingMode, string> = {
    oled: "OLED",
    performance: "Performance",
    value: "Custo-Beneficio",
    recommended: "Recomendado",
    soundTyping: "Som e Digitação",
  }
  return modeMap[mode]
}

const TAG_COLUMNS: { key: Tag; title: string; color: string }[] = [
  { key: "competitive", title: "Competitivo", color: TAG_COLUMN_COLORS.competitive },
  { key: "versatile", title: "Versatil", color: TAG_COLUMN_COLORS.versatile },
  { key: "value", title: "Valor", color: TAG_COLUMN_COLORS.value },
]

function getPerformanceColumnKeys(item: Peripheral) {
  const primaryTag = item.tags.find((tag) => TAG_COLUMNS.some((column) => column.key === tag))

  if (item.category === "mouse") {
    return [primaryTag ?? "versatile"]
  }

  return item.tags.filter((tag) => TAG_COLUMNS.some((column) => column.key === tag))
}

function getStoredModeColumn(item: Peripheral, fieldName: keyof Peripheral["specs"], fallbackValue: string) {
  const storedValue = item.specs?.[fieldName]
  return typeof storedValue === "string" && storedValue ? storedValue : fallbackValue
}

function getPriceBand(price: number): PriceBand {
  if (price <= 80) return "budget"
  if (price <= 160) return "mid"
  return "premium"
}

function getTierScore(tier: TierValue) {
  if (tier === "GOAT") return 7
  if (tier === "SS") return 6
  if (tier === "S") return 5
  if (tier === "A") return 4
  if (tier === "B") return 3
  if (tier === "C") return 2
  if (tier === "L") return 1
  return 0
}

function getRecommendedScore(item: Peripheral) {
    const tagScore = item.tags.reduce((accumulator, tag) => {
    if (tag === "competitive") return accumulator + 0.8
    if (tag === "versatile") return accumulator + 0.6
    if (tag === "value") return accumulator + 0.7
    return accumulator
  }, 0)

  return getTierScore(item.tier) + tagScore - Math.min(item.price / 300, 1)
}

const MODE_CONFIGS: Record<RatingMode, ModeConfig> = {
  performance: {
    description: "Ordenado por desempenho puro",
    columns: TAG_COLUMNS,
    getColumnKeys: (item) => getPerformanceColumnKeys(item),
    sortItems: (items) =>
      [...items].sort((left, right) => {
        const tierDiff = getTierScore(right.tier) - getTierScore(left.tier)
        if (tierDiff !== 0) return tierDiff

        return left.name.localeCompare(right.name)
      }),
  },
  value: {
    description: "Distribuído por faixa de preco dentro de cada tier",
    columns: [
      { key: "budget", title: "Budget", color: VALUE_COLUMN_COLORS.budget },
      { key: "mid", title: "Mid", color: VALUE_COLUMN_COLORS.mid },
      { key: "premium", title: "Premium", color: VALUE_COLUMN_COLORS.premium },
    ],
    getColumnKeys: (item) => [getStoredModeColumn(item, "adminValueBand", getPriceBand(item.price))],
    sortItems: (items) => [...items].sort((left, right) => left.price - right.price || left.name.localeCompare(right.name)),
  },
  recommended: {
    description: "Escolhas sugeridas por Sunano, priorizando equilibrio geral",
    columns: [
      { key: "top", title: "Top Picks", color: RECOMMENDED_COLUMN_COLORS.top },
      { key: "strong", title: "Strong Picks", color: RECOMMENDED_COLUMN_COLORS.strong },
      { key: "niche", title: "Niche Picks", color: RECOMMENDED_COLUMN_COLORS.niche },
    ],
    getColumnKeys: (item) => {
      const score = getRecommendedScore(item)
      const fallbackColumn = score >= 4.4 ? "top" : score >= 3.2 ? "strong" : "niche"
      return [getStoredModeColumn(item, "adminRecommendedBand", fallbackColumn)]
    },
    sortItems: (items) =>
      [...items].sort((left, right) => getRecommendedScore(right) - getRecommendedScore(left) || left.name.localeCompare(right.name)),
  },
  oled: {
    description: "Apenas painéis OLED",
    columns: [{ key: "oled", title: "OLED", color: TAG_COLUMN_COLORS.value }],
    getColumnKeys: (item) => {
      const spec = item.specs?.panelType
      return typeof spec === "string" && spec.toLowerCase().includes("oled") ? ["oled"] : []
    },
    sortItems: (items) =>
      [...items].sort((left, right) => getTierScore(right.tier) - getTierScore(left.tier) || left.name.localeCompare(right.name)),
  },
  soundTyping: {
    description: "Ordenado por som e digitação",
    columns: [
      { key: "thocky-linear", title: "Thocky Linear", color: "text-cyan-400" },
      { key: "thocky-tactile", title: "Thocky Tactile", color: "text-cyan-300" },
      { key: "clacky-linear", title: "Clacky Linear", color: "text-blue-400" },
      { key: "clacky-tactile", title: "Clacky Tactile", color: "text-blue-300" },
      { key: "hollow-linear", title: "Hollow Linear", color: "text-purple-400" },
      { key: "hollow-tactile", title: "Hollow Tactile", color: "text-purple-300" },
    ],
    getColumnKeys: (item) => {
      const sound = getStoredModeColumn(item, "adminSoundProfile", "thocky")
      const typing = getStoredModeColumn(item, "adminTypingFeel", "linear")
      return [`${sound}-${typing}`]
    },
    sortItems: (items) =>
      [...items].sort((left, right) => getTierScore(right.tier) - getTierScore(left.tier) || left.name.localeCompare(right.name)),
  },
}

interface TierlistGridProps {
  filtered: Peripheral[]
  category: string
}

export function TierlistGrid({ filtered, category }: TierlistGridProps) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const [ratingMode, setRatingMode] = useState<RatingMode>("performance")
  const modeConfig = MODE_CONFIGS[ratingMode]

  const tierRows: TierRow[] = [
    {
      key: "GOAT",
      label: "GOAT",
      description: isEnglish ? "Elite - Absolute reference" : "Elite - Referencia absoluta",
      gradient: TIER_THEMES.GOAT.accent,
      textColor: TIER_THEMES.GOAT.textColor,
    },
    {
      key: "SS",
      label: "SS",
      description: isEnglish ? "Extreme - Almost perfect" : "Extremo - Quase perfeito",
      gradient: TIER_THEMES.SS.accent,
      textColor: TIER_THEMES.SS.textColor,
    },
    {
      key: "S",
      label: "S",
      description: isEnglish ? "Top - Great choice" : "Top - Otima escolha",
      gradient: TIER_THEMES.S.accent,
      textColor: TIER_THEMES.S.textColor,
    },
    {
      key: "A",
      label: "A",
      description: isEnglish ? "Very good - Strong and consistent" : "Muito bom - Consistente e forte",
      gradient: TIER_THEMES.A.accent,
      textColor: TIER_THEMES.A.textColor,
    },
    {
      key: "B",
      label: "B",
      description: isEnglish ? "Good - Solid option" : "Bom - Opção sólida",
      gradient: TIER_THEMES.B.accent,
      textColor: TIER_THEMES.B.textColor,
    },
    {
      key: "C",
      label: "C",
      description: isEnglish ? "Okay - Works well with tradeoffs" : "Ok - Funciona bem com limites",
      gradient: TIER_THEMES.C.accent,
      textColor: TIER_THEMES.C.textColor,
    },
    {
      key: "L",
      label: "L",
      description: isEnglish ? "Lower - Only for niche cases" : "Inferior - Apenas para casos específicos",
      gradient: TIER_THEMES.L.accent,
      textColor: TIER_THEMES.L.textColor,
    },
  ]

  const ratingModes: { key: RatingMode; label: string; color: string }[] = [
    ...(category === "monitors" ? [{ key: "oled" as const, label: getRatingModeLabel("oled", category), color: "bg-amber-400" }] : []),
    { key: "performance" as const, label: getRatingModeLabel("performance", category), color: "bg-red-400" },
    { key: "value" as const, label: getRatingModeLabel("value", category), color: "bg-emerald-400" },
    { key: "recommended" as const, label: getRatingModeLabel("recommended", category), color: "bg-purple-400" },
    ...(category === "switches" ? [
      { key: "soundTyping" as const, label: "Som e Digitação", color: "bg-cyan-500" },
    ] : []),
  ]

  const localizedModeDescription =
    ratingMode === "oled"
      ? isEnglish
        ? "Showing OLED panels"
        : "Mostrando painéis OLED"
      : ratingMode === "performance"
        ? isEnglish
          ? "Sorted by pure performance"
          : "Ordenado por desempenho puro"
        : ratingMode === "value"
          ? isEnglish
            ? "Grouped by price range within each tier"
            : "Distribuído por faixa de preco dentro de cada tier"
          : ratingMode === "soundTyping"
            ? isEnglish
              ? "Sorted by sound and typing feel"
              : "Ordenado por som e digitação"
            : isEnglish
              ? "Suggested picks by Sunano, prioritizing overall balance"
              : "Escolhas sugeridas por Sunano, priorizando equilibrio geral"

  const itemsByTier = useMemo(
    () =>
      tierRows.map((tier) => {
        const tierItems = modeConfig.sortItems(filtered.filter((item) => item.tier === tier.key))

        return {
          ...tier,
          itemsByColumn: modeConfig.columns.map((column) => ({
            ...column,
            items: tierItems.filter((item) => modeConfig.getColumnKeys(item).includes(column.key)),
          })),
          totalItems: tierItems.length,
        }
      }),
    [filtered, modeConfig, tierRows]
  )

  const untieredItems = useMemo(
    () => modeConfig.sortItems(filtered.filter((item) => item.tier === null)),
    [filtered, modeConfig]
  )

  const untieredItemsByColumn = useMemo(
    () =>
      modeConfig.columns.map((column) => ({
        ...column,
        items: untieredItems.filter((item) => modeConfig.getColumnKeys(item).includes(column.key)),
      })),
    [modeConfig, untieredItems]
  )

  const hasItems = filtered.length > 0

  // If category isn't monitors, don't allow OLED mode
  useEffect(() => {
    if (ratingMode === "oled" && category !== "monitors") setRatingMode("performance")
    if (ratingMode === "soundTyping" && category !== "switches") setRatingMode("performance")
  }, [category, ratingMode])

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{isEnglish ? "You are viewing the tierlist sorted by:" : "Voce esta vendo a tierlist ordenada por:"}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{localizedModeDescription}</p>
        </div>
        <div className="flex rounded-lg border border-border bg-muted/30 p-1">
          {ratingModes.map((mode) => (
            <button
              key={mode.key}
              onClick={() => setRatingMode(mode.key)}
              className={cn(
                "rounded-md px-4 py-2 text-sm font-medium transition-all",
                ratingMode === mode.key
                  ? `bg-primary/20 text-primary ${mode.color}`
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
              type="button"
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
        <table className="hidden w-full border-collapse md:table">
          <thead>
            <tr className="border-b border-border">
              <th className="w-20 border-r border-border bg-muted/30" />
              {modeConfig.columns.map((column, colIndex) => (
                <th
                  key={column.key}
                  className={cn(
                    "border-r border-border px-3 py-2.5 text-left last:border-r-0",
                    colIndex % 2 === 0 ? "bg-muted/20" : "bg-transparent",
                  )}
                >
                  <span className={cn("text-[11px] font-bold uppercase tracking-widest", column.color)}>
                    {column.title}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itemsByTier.map((tierRow, tierIndex) => (
              <tr
                key={tierRow.key}
                className={cn(tierIndex < itemsByTier.length - 1 && "border-b border-border")}
              >
                <td
                  className={cn(
                    "border-r border-border w-20 align-middle text-center bg-gradient-to-b",
                    tierRow.gradient
                  )}
                >
                  <div className={cn("py-3 text-2xl font-black", tierRow.textColor)}>{tierRow.label}</div>
                  {tierRow.totalItems > 0 && (
                    <div className={cn("pb-2 text-[10px] font-medium opacity-80", tierRow.textColor)}>
                      {tierRow.totalItems}
                    </div>
                  )}
                </td>

                {tierRow.itemsByColumn.map((column, colIndex) => (
                  <td
                    key={`${tierRow.key}-${column.key}`}
                    className={cn(
                      "border-r border-border align-top last:border-r-0",
                      colIndex % 2 === 0 ? "bg-muted/20" : "bg-transparent"
                    )}
                  >
                    <div className="p-2">
                      {column.items.length > 0 ? (
                        <div className="grid w-full auto-rows-max grid-cols-2 gap-2">
                          {column.items.map((item) => (
                            <PeripheralCard key={item.id} {...item} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex min-h-[48px] items-center justify-center">
                          <span className="text-xs text-muted-foreground/30">—</span>
                        </div>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        {untieredItems.length > 0 && (
          <div className="border-t border-border bg-muted/10">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xl font-black text-slate-100">-</span>
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {isEnglish ? "No tier" : "Sem tier"}
                </span>
              </div>
              <span className="text-sm font-semibold text-muted-foreground">
                {untieredItems.length} {isEnglish ? "items" : "itens"}
              </span>
            </div>

            <div className="grid grid-cols-1 gap-0 md:grid-cols-[repeat(4,minmax(0,1fr))]">
              {untieredItemsByColumn.map((column, colIndex) => (
                <div
                  key={`untiered-${column.key}`}
                  className={cn(
                    "border-r border-border last:border-r-0",
                    colIndex % 2 === 0 ? "bg-muted/20" : "bg-transparent"
                  )}
                >
                  <div className="p-2">
                    {column.items.length > 0 ? (
                      <div className="grid w-full auto-rows-max grid-cols-2 gap-2">
                        {column.items.map((item) => (
                          <PeripheralCard key={item.id} {...item} />
                        ))}
                      </div>
                    ) : (
                      <div className="flex min-h-[48px] items-center justify-center">
                        <span className="text-xs text-muted-foreground/30">—</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="md:hidden">
          {!hasItems ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">{isEnglish ? "No items found with the current filters." : "Nenhum item encontrado com os filtros atuais."}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {itemsByTier.map((tierRow) => {
                const allTierItems = tierRow.itemsByColumn.flatMap((column) => column.items)

                if (allTierItems.length === 0) return null

                return (
                  <div key={tierRow.key}>
                    <div className={cn("flex items-center justify-between bg-gradient-to-r px-4 py-3", tierRow.gradient)}>
                      <div className="flex items-center gap-3">
                        <span className={cn("text-xl font-black", tierRow.textColor)}>{tierRow.label}</span>
                        <span className={cn("text-xs font-medium opacity-80", tierRow.textColor)}>
                          {tierRow.description}
                        </span>
                      </div>
                      <span className={cn("text-sm font-semibold", tierRow.textColor)}>{allTierItems.length} {isEnglish ? "items" : "itens"}</span>
                    </div>

                    <div className="space-y-4 p-4">
                      {tierRow.itemsByColumn
                        .filter((column) => column.items.length > 0)
                        .map((column) => (
                          <div key={column.key}>
                            <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-widest", column.color)}>
                              {column.title}
                            </p>
                            <div className="grid grid-cols-3 gap-2">
                              {column.items.map((item) => (
                                <PeripheralCard key={item.id} {...item} />
                              ))}
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                )
              })}

              {untieredItems.length > 0 && (
                <div>
                  <div className="flex items-center justify-between bg-gradient-to-r from-slate-700 to-slate-800 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-xl font-black text-slate-100">-</span>
                      <span className="text-xs font-medium opacity-80 text-slate-100">{isEnglish ? "No tier" : "Sem tier"}</span>
                    </div>
                    <span className="text-sm font-semibold text-slate-100">{untieredItems.length} {isEnglish ? "items" : "itens"}</span>
                  </div>

                  <div className="space-y-4 p-4">
                    {untieredItemsByColumn
                      .filter((column) => column.items.length > 0)
                      .map((column) => (
                        <div key={column.key}>
                          <p className={cn("mb-2 text-[10px] font-semibold uppercase tracking-widest", column.color)}>
                            {column.title}
                          </p>
                          <div className="space-y-2">
                            {column.items.map((item) => (
                              <PeripheralCard key={item.id} {...item} />
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
