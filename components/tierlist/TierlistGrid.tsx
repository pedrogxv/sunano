"use client"

import { useMemo, useState, useEffect } from "react"

import { PeripheralCard } from "./PeripheralCard"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"
import { TIER_THEMES } from "@/lib/tierlist-theme"

type Tier = "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L"
type TierValue = Tier | null
type Tag = "competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80" | "poron" | "borracha" | "grosso" | "fino" | "rapido" | "devagar" | "hibrido" | "aspero" | "liso" | "mug" | "macio" | "afetado_umidade" | "ultrapassado"
type RatingMode = "oled" | "overall" | "value" | "recommended" | "soundTyping" | "mechanical" | "magnetic" | "pcb"
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
    adminTierOrder_magnetic?: number
    adminTierOrder_pcb?: number
    adminTier_value?: TierValue
    adminTier_recommended?: TierValue
    adminTier_oled?: TierValue
    adminTier_soundTyping?: TierValue
    adminTier_mechanical?: TierValue
    adminTier_pcb?: TierValue
    mouseShape?: "symmetrical" | "ergonomic"
    keyboardLayout?: string
    connectivity?: "wired" | "wireless"
    size?: "small" | "medium" | "large"
    surface?: "cloth" | "hybrid" | "glass"
    driver?: string
    profile?: string
    panelType?: string
    tierlistCategories?: string[]
  }
}

const ORDER_KEY_BY_MODE: Record<RatingMode, string> = {
  overall: "adminTierOrder_performance",
  value: "adminTierOrder_value",
  recommended: "adminTierOrder_recommended",
  oled: "adminTierOrder_oled",
  soundTyping: "adminTierOrder_soundTyping",
  mechanical: "adminTierOrder_mechanical",
  magnetic: "adminTierOrder_magnetic",
  pcb: "adminTierOrder_pcb",
}

// Modes not listed here share the `tier` column directly (the "default" mode for their
// category group: overall/Geral for most categories, magnetic for keyboards). Every other
// mode reads its own tier assignment from `specs`, matching the admin editor.
const TIER_KEY_BY_MODE: Partial<Record<RatingMode, string>> = {
  value: "adminTier_value",
  recommended: "adminTier_recommended",
  oled: "adminTier_oled",
  soundTyping: "adminTier_soundTyping",
  mechanical: "adminTier_mechanical",
  pcb: "adminTier_pcb",
}

const TIER_VALUES: Tier[] = ["GOAT", "SS", "S", "A", "B", "C", "L"]

function getModeTier(item: Peripheral, tierKey: string | null): TierValue {
  if (tierKey === null) return item.tier
  const value = item.specs?.[tierKey as keyof Peripheral["specs"]]
  return typeof value === "string" && (TIER_VALUES as string[]).includes(value) ? (value as Tier) : null
}

// Sem `tierlistCategories` definido (itens legados), o item continua visível em todas as
// abas, preservando o comportamento anterior à existência deste campo.
function participatesInMode(item: Peripheral, mode: RatingMode): boolean {
  const categories = item.specs?.tierlistCategories
  if (!Array.isArray(categories)) return true
  return categories.includes(mode)
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

  if (category === "keyboard") {
    if (mode === "magnetic") return "Magnético"
    if (mode === "value") return "Custo Benefício"
    if (mode === "mechanical") return "Mecânico"
    if (mode === "pcb") return "PCB"
  }

  const modeMap: Record<RatingMode, string> = {
    oled: "OLED",
    overall: "Geral",
    value: "Custo Benefício",
    recommended: "Recomendado",
    soundTyping: "Som e Digitação",
    mechanical: "Mecânico",
    magnetic: "Magnético",
    pcb: "PCB",
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
  magnetic: {
    fallbackSort: (items) => [...items].sort((left, right) => left.name.localeCompare(right.name)),
  },
  pcb: {
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

const COMING_SOON_CATEGORIES = ["iem", "headset", "feet", "chairs", "monitors", "switches", "dac_amp"]

const MASCOT_IMAGES: Record<string, string> = {
  iem: "/images/mascot/mascot-working.png",
  headset: "/images/mascot/mascot-digging.png",
  feet: "/images/mascot/mascot-warning.png",
  chairs: "/images/mascot/coming-soon.png",
  monitors: "/images/mascot/mascot-working.png",
  switches: "/images/mascot/mascot-digging.png",
  dac_amp: "/images/mascot/mascot-warning.png",
}

export function TierlistGrid({ filtered, category }: TierlistGridProps) {
  const t = useT()
  const [ratingMode, setRatingMode] = useState<RatingMode>("overall")
  const modeConfig = MODE_CONFIGS[ratingMode]
  const orderKey = ORDER_KEY_BY_MODE[ratingMode]
  const allowLegacyFallback = ratingMode === "overall"
  const tierKey = TIER_KEY_BY_MODE[ratingMode] ?? null
  const isComingSoon = COMING_SOON_CATEGORIES.includes(category)

  const tierRows: TierRow[] = [
    {
      key: "GOAT",
      label: "GOAT",
      description: t.tierlist.tierDescriptions.GOAT,
      gradient: TIER_THEMES.GOAT.accent,
      textColor: TIER_THEMES.GOAT.textColor,
    },
    {
      key: "SS",
      label: "SS",
      description: t.tierlist.tierDescriptions.SS,
      gradient: TIER_THEMES.SS.accent,
      textColor: TIER_THEMES.SS.textColor,
    },
    {
      key: "S",
      label: "S",
      description: t.tierlist.tierDescriptions.S,
      gradient: TIER_THEMES.S.accent,
      textColor: TIER_THEMES.S.textColor,
    },
    {
      key: "A",
      label: "A",
      description: t.tierlist.tierDescriptions.A,
      gradient: TIER_THEMES.A.accent,
      textColor: TIER_THEMES.A.textColor,
    },
    {
      key: "B",
      label: "B",
      description: t.tierlist.tierDescriptions.B,
      gradient: TIER_THEMES.B.accent,
      textColor: TIER_THEMES.B.textColor,
    },
    {
      key: "C",
      label: "C",
      description: t.tierlist.tierDescriptions.C,
      gradient: TIER_THEMES.C.accent,
      textColor: TIER_THEMES.C.textColor,
    },
    {
      key: "L",
      label: "L",
      description: t.tierlist.tierDescriptions.L,
      gradient: TIER_THEMES.L.accent,
      textColor: TIER_THEMES.L.textColor,
    },
  ]

  const ratingModes: { key: RatingMode; label: string; color: string }[] = category === "keyboard"
    ? [
        { key: "magnetic" as const, label: getRatingModeLabel("magnetic", category), color: "bg-blue-400" },
        { key: "value" as const, label: getRatingModeLabel("value", category), color: "bg-emerald-400" },
        { key: "mechanical" as const, label: getRatingModeLabel("mechanical", category), color: "bg-purple-400" },
        { key: "pcb" as const, label: getRatingModeLabel("pcb", category), color: "bg-orange-400" },
      ]
    : [
        ...(category === "monitors" ? [{ key: "oled" as const, label: getRatingModeLabel("oled", category), color: "bg-amber-400" }] : []),
        { key: "overall" as const, label: getRatingModeLabel("overall", category), color: "bg-red-400" },
        { key: "value" as const, label: getRatingModeLabel("value", category), color: "bg-emerald-400" },
        { key: "recommended" as const, label: getRatingModeLabel("recommended", category), color: "bg-purple-400" },
        ...(category === "switches" ? [
          { key: "soundTyping" as const, label: "Som e Digitação", color: "bg-cyan-500" },
        ] : []),
      ]

  const localizedModeDescription = t.tierlist.modeDescriptions[ratingMode]

  const visibleItems = useMemo(
    () => filtered.filter((item) => participatesInMode(item, ratingMode)),
    [filtered, ratingMode]
  )

  const itemsByTier = useMemo(
    () =>
      tierRows.map((tier) => {
        let tierItems = visibleItems.filter((item) => getModeTier(item, tierKey) === tier.key)
        if (modeConfig.filterItem) tierItems = tierItems.filter(modeConfig.filterItem)
        return {
          ...tier,
          items: sortWithTierOrder(tierItems, orderKey, allowLegacyFallback, modeConfig.fallbackSort).map(
            (item) => ({ ...item, tier: tier.key }),
          ),
        }
      }),
    [visibleItems, modeConfig, tierRows, orderKey, allowLegacyFallback, tierKey]
  )

  const untieredItems = useMemo(() => {
    let items = visibleItems.filter((item) => getModeTier(item, tierKey) === null)
    if (modeConfig.filterItem) items = items.filter(modeConfig.filterItem)
    return sortWithTierOrder(items, orderKey, allowLegacyFallback, modeConfig.fallbackSort).map((item) => ({
      ...item,
      tier: null,
    }))
  }, [visibleItems, modeConfig, orderKey, allowLegacyFallback, tierKey])

  const hasItems = visibleItems.length > 0

  useEffect(() => {
    if (ratingMode === "oled" && category !== "monitors") setRatingMode("overall")
    if (ratingMode === "soundTyping" && category !== "switches") setRatingMode("overall")
    if ((ratingMode === "mechanical" || ratingMode === "magnetic" || ratingMode === "pcb") && category !== "keyboard") setRatingMode("overall")
    if ((ratingMode === "overall" || ratingMode === "recommended") && category === "keyboard") setRatingMode("magnetic")
  }, [category, ratingMode])

  if (isComingSoon) {
    const mascotImage = MASCOT_IMAGES[category]
    return (
      <section className="space-y-4">
        <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-gradient-to-b from-card to-card/50 p-12 text-center">
          <div className="mb-6 h-48 w-48">
            <img
              src={mascotImage}
              alt="Coming soon"
              className="h-full w-full object-contain"
              onError={(e) => {
                e.currentTarget.style.display = "none"
              }}
            />
          </div>
          <h2 className="text-3xl font-bold text-foreground">{t.tierlist.comingSoon}</h2>
          <p className="mt-4 max-w-md text-base text-muted-foreground">
            {t.tierlist.comingSoonDesc}
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground">{t.tierlist.viewingBy}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{localizedModeDescription}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-1 rounded-lg border border-border bg-muted/30 p-1">
          {ratingModes.map((mode) => (
            <button
              key={mode.key}
              onClick={() => setRatingMode(mode.key)}
              className={cn(
                "rounded-md px-3 py-2 text-sm font-medium transition-all sm:px-4",
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


      <div className="relative overflow-visible rounded-xl border border-border bg-card shadow-lg">
        <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-xl bg-[radial-gradient(ellipse_at_top,_rgba(124,58,237,0.07),_transparent_60%)]" />

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
                  {t.tierlist.tierSubtitles[tierRow.key] && (
                    <div className={cn("pb-1 text-[10px] font-medium opacity-75", tierRow.textColor)}>
                      {t.tierlist.tierSubtitles[tierRow.key]}
                    </div>
                  )}
                </td>

                <td className="align-middle bg-muted/20">
                  <div className="p-2">
                    {tierRow.items.length > 0 ? (
                      <div className="grid w-full auto-rows-max grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5">
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
              <p className="text-sm text-muted-foreground">{t.tierlist.noItems}</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {itemsByTier.map((tierRow) => {
                if (tierRow.items.length === 0) return null

                return (
                  <div key={tierRow.key}>
                    <div className={cn("mx-3 mt-3 flex items-center justify-between rounded-[11px] bg-gradient-to-b px-4 py-3", tierRow.gradient)}>
                      <div className="flex items-center gap-3">
                        <span className={cn("text-xl font-black", tierRow.textColor)}>{tierRow.label}</span>
                        {t.tierlist.tierSubtitles[tierRow.key] && (
                          <span className={cn("text-xs font-medium opacity-75", tierRow.textColor)}>
                            {t.tierlist.tierSubtitles[tierRow.key]}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="grid grid-cols-3 gap-2.5">
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
                <span className="text-xl font-black text-foreground">-</span>
                <span className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
                  {t.tierlist.underReview}
                </span>
              </div>
            </div>

            <div className="hidden p-2 md:block">
              <div className="grid w-full auto-rows-max grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2.5">
                {untieredItems.map((item) => (
                  <PeripheralCard key={item.id} {...item} />
                ))}
              </div>
            </div>

            <div className="p-4 md:hidden">
              <div className="grid grid-cols-3 gap-2.5">
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
