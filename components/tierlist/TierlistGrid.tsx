"use client"

import { useMemo, useState, useEffect } from "react"

import { PeripheralCard } from "./PeripheralCard"
import { useLocale } from "@/components/providers/locale-context"
import { cn } from "@/lib/utils"
import { TIER_THEMES } from "@/lib/tierlist-theme"

type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado"
type RatingMode = "oled" | "overall" | "value" | "recommended" | "soundTyping" | "mechanical"
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
    adminTierOrder?: number
    adminTierOrder_performance?: number
    adminTierOrder_value?: number
    adminTierOrder_recommended?: number
    adminTierOrder_oled?: number
    adminTierOrder_soundTyping?: number
    adminTierOrder_mechanical?: number
    mouseShape?: "symmetrical" | "ergonomic"
    keyboardLayout?: string
    connectivity?: "wired" | "wireless"
    size?: "small" | "medium" | "large"
    surface?: "cloth" | "hybrid" | "glass"
    driver?: string
    profile?: string
    panelType?: string
  }
}

const ORDER_KEY_BY_MODE: Record<RatingMode, string> = {
  overall: "adminTierOrder_performance",
  value: "adminTierOrder_value",
  recommended: "adminTierOrder_recommended",
  oled: "adminTierOrder_oled",
  soundTyping: "adminTierOrder_soundTyping",
  mechanical: "adminTierOrder_mechanical",
}

function getTierOrder(item: Peripheral, orderKey: string, allowLegacyFallback: boolean): number | null {
  const value = item.specs?.[orderKey as keyof Peripheral["specs"]]
  if (typeof value === "number" && Number.isFinite(value)) return value

  if (allowLegacyFallback) {
    const legacyValue = item.specs?.adminTierOrder
    return typeof legacyValue === "number" && Number.isFinite(legacyValue) ? legacyValue : null
  }

  return null
}

interface TierRow {
  key: Tier
  label: string
  description: string
  gradient: string
  textColor: string
}

interface ModeConfig {
  // Optional filter — only OLED mode narrows the item set.
  filterItem?: (item: Peripheral) => boolean
  fallbackSort: (items: Peripheral[]) => Peripheral[]
}

// Labels específicos por categoria para MOUSEPAD e GLASSPAD
function getRatingModeLabel(mode: RatingMode, category: string): string {
  if (category === "mousepad" || category === "glasspad") {
    if (mode === "overall") return "Geral"
    if (mode === "value") return "Nacional"
    if (mode === "recommended") return "Recomendado"
  }

  const modeMap: Record<RatingMode, string> = {
    oled: "OLED",
    overall: "Geral",
    value: "Custo-Beneficio",
    recommended: "Recomendado",
    soundTyping: "Som e Digitação",
    mechanical: "Mecânico",
  }
  return modeMap[mode]
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

function getTierSubtitle(tier: Tier, isEnglish: boolean) {
  if (isEnglish) return ""
  const subtitles: Record<Tier, string> = {
    GOAT: "Simplesmente",
    SS: "Excepcional",
    S: "Muito bom",
    A: "Bom",
    B: "Decente",
    C: "Usável",
    L: "Veio Podi",
  }
  return subtitles[tier]
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

function sortByTierThenName(items: Peripheral[], orderKey: string, allowLegacyFallback: boolean) {
  return [...items].sort((left, right) => {
    const tierDiff = getTierScore(right.tier) - getTierScore(left.tier)
    if (tierDiff !== 0) return tierDiff

    const leftOrder = getTierOrder(left, orderKey, allowLegacyFallback)
    const rightOrder = getTierOrder(right, orderKey, allowLegacyFallback)
    if (leftOrder !== null && rightOrder !== null) return leftOrder - rightOrder || left.name.localeCompare(right.name)
    if (leftOrder !== null) return -1
    if (rightOrder !== null) return 1

    return left.name.localeCompare(right.name)
  })
}

const MODE_CONFIGS: Record<RatingMode, ModeConfig> = {
  overall: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  value: {
    fallbackSort: (items) =>
      [...items].sort((left, right) => left.price - right.price || left.name.localeCompare(right.name)),
  },
  recommended: {
    fallbackSort: (items) =>
      [...items].sort(
        (left, right) => getRecommendedScore(right) - getRecommendedScore(left) || left.name.localeCompare(right.name),
      ),
  },
  oled: {
    filterItem: (item) =>
      typeof item.specs?.panelType === "string" && item.specs.panelType.toLowerCase().includes("oled"),
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  soundTyping: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  mechanical: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
}

function sortWithTierOrder(
  items: Peripheral[],
  orderKey: string,
  allowLegacyFallback: boolean,
  fallbackSort: (items: Peripheral[]) => Peripheral[],
): Peripheral[] {
  const withOrder = sortByTierThenName(items, orderKey, allowLegacyFallback)
  const hasAnyOrder = withOrder.some((item) => getTierOrder(item, orderKey, allowLegacyFallback) !== null)
  return hasAnyOrder ? withOrder : fallbackSort(items)
}

interface TierlistGridProps {
  filtered: Peripheral[]
  category: string
}

export function TierlistGrid({ filtered, category }: TierlistGridProps) {
  const { locale } = useLocale()
  const isEnglish = locale === "en-US"
  const [ratingMode, setRatingMode] = useState<RatingMode>("overall")
  const modeConfig = MODE_CONFIGS[ratingMode]
  const orderKey = ORDER_KEY_BY_MODE[ratingMode]
  const allowLegacyFallback = ratingMode === "overall"

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
    { key: "overall" as const, label: getRatingModeLabel("overall", category), color: "bg-red-400" },
    { key: "value" as const, label: getRatingModeLabel("value", category), color: "bg-emerald-400" },
    ...(category === "keyboard" ? [
      { key: "mechanical" as const, label: getRatingModeLabel("mechanical", category), color: "bg-purple-400" },
    ] : [
      { key: "recommended" as const, label: getRatingModeLabel("recommended", category), color: "bg-purple-400" },
    ]),
    ...(category === "switches" ? [
      { key: "soundTyping" as const, label: "Som e Digitação", color: "bg-cyan-500" },
    ] : []),
  ]

  const localizedModeDescription =
    ratingMode === "oled"
      ? isEnglish
        ? "Showing OLED panels"
        : "Mostrando painéis OLED"
      : ratingMode === "overall"
        ? isEnglish
          ? "Sorted by overall performance"
          : "Ordenado por desempenho geral"
        : ratingMode === "value"
          ? isEnglish
            ? "Sorted by price"
            : "Ordenado por preço"
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
        let tierItems = filtered.filter((item) => item.tier === tier.key)
        if (modeConfig.filterItem) tierItems = tierItems.filter(modeConfig.filterItem)
        return {
          ...tier,
          items: sortWithTierOrder(tierItems, orderKey, allowLegacyFallback, modeConfig.fallbackSort),
        }
      }),
    [filtered, modeConfig, tierRows, orderKey, allowLegacyFallback]
  )

  const untieredItems = useMemo(() => {
    let items = filtered.filter((item) => item.tier === null)
    if (modeConfig.filterItem) items = items.filter(modeConfig.filterItem)
    return sortWithTierOrder(items, orderKey, allowLegacyFallback, modeConfig.fallbackSort)
  }, [filtered, modeConfig, orderKey, allowLegacyFallback])

  const hasItems = filtered.length > 0

  // If category isn't monitors, don't allow OLED mode
  useEffect(() => {
    if (ratingMode === "oled" && category !== "monitors") setRatingMode("overall")
    if (ratingMode === "soundTyping" && category !== "switches") setRatingMode("overall")
    if (ratingMode === "mechanical" && category !== "keyboard") setRatingMode("overall")
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
                  {getTierSubtitle(tierRow.key, isEnglish) && (
                    <div className={cn("pb-2 text-[10px] font-medium opacity-80", tierRow.textColor)}>
                      {getTierSubtitle(tierRow.key, isEnglish)}
                    </div>
                  )}
                </td>

                <td className="align-top bg-muted/20">
                  <div className="p-2">
                    {tierRow.items.length > 0 ? (
                      <div className="grid w-full auto-rows-max grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
                        {tierRow.items.map((item) => (
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
              </tr>
            ))}
          </tbody>
        </table>

        <div className="md:hidden">
          {!hasItems ? (
            <div className="p-8 text-center">
              <p className="text-sm text-muted-foreground">{isEnglish ? "No items found with the current filters." : "Nenhum item encontrado com os filtros atuais."}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {itemsByTier.map((tierRow) => {
                if (tierRow.items.length === 0) return null

                return (
                  <div key={tierRow.key}>
                    <div className={cn("flex items-center justify-between bg-gradient-to-r px-4 py-3", tierRow.gradient)}>
                      <div className="flex items-center gap-3">
                        <span className={cn("text-xl font-black", tierRow.textColor)}>{tierRow.label}</span>
                        <span className={cn("text-xs font-medium opacity-80", tierRow.textColor)}>
                          {tierRow.description}
                        </span>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-2">
                        {tierRow.items.map((item) => (
                          <PeripheralCard key={item.id} {...item} />
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {untieredItems.length > 0 && (
          <div className="border-t border-border bg-muted/10">
            <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-xl font-black text-slate-100">-</span>
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {isEnglish ? "Under Review" : "Sob Revisão"}
                </span>
              </div>
            </div>

            <div className="hidden p-2 md:block">
              <div className="grid w-full auto-rows-max grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
                {untieredItems.map((item) => (
                  <PeripheralCard key={item.id} {...item} />
                ))}
              </div>
            </div>

            <div className="p-4 md:hidden">
              <div className="grid grid-cols-3 gap-2">
                {untieredItems.map((item) => (
                  <PeripheralCard key={item.id} {...item} />
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
