import { listAllPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { getTierlistMeta } from "@/lib/server/repositories/tierlist-meta-repository"
import { TierlistInfo } from "@/components/tierlist/TierlistInfo"
import { TierlistContent } from "@/components/tierlist/TierlistContent"
import { mapTier } from "@/lib/tier-utils"

// ISR: serve do cache e revalida em background a cada 30s, em vez de
// re-renderizar (com nova query ao banco) em toda requisição.
export const revalidate = 30

export default async function TierlistPage() {
  const [peripheralsList, tierlistMeta] = await Promise.all([
    listAllPeripherals(),
    getTierlistMeta(),
  ])

  const items = peripheralsList.map((p) => {
    const specs = (p.specs || {}) as Record<string, unknown> & {
      details?: { ratings?: Record<string, number> }
    }
    const rawRatings = specs.details?.ratings ?? {}
    const ratings: Partial<Record<"overall" | "performance" | "build" | "value" | "software" | "battery" | "qc", number>> = {}
    for (const key of ["overall", "performance", "build", "value", "software", "battery", "qc"] as const) {
      if (typeof rawRatings[key] === "number") ratings[key] = rawRatings[key]
    }

    return {
      id: p.id,
      name: p.name,
      brand: p.brand,
      image_url: p.image_url,
      category: p.category as "keyboard" | "pcb" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp",
      tier: p.tier ? mapTier(p.tier) : null,
      price: p.price,
      tags: (p.tags || []) as ("competitive" | "versatile" | "value" | "cheap" | "expensive" | "light" | "heavy" | "unbalanced" | "dpi_deviation" | "wobble_high" | "wobble_low" | "scroll_hard" | "scroll_soft" | "trimode" | "stable" | "unstable" | "8_80")[],
      ratings,
      specs: specs as {
        mouseShape?: "symmetrical" | "ergonomic"
        keyboardLayout?: string
        connectivity?: "wired" | "wireless"
        size?: "small" | "medium" | "large"
        surface?: "cloth" | "hybrid" | "glass"
        driver?: string
        profile?: string
        adminValueBand?: string
        adminRecommendedBand?: string
        adminTier_value?: "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L" | null
        adminTier_recommended?: "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L" | null
        adminTier_oled?: "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L" | null
        adminTier_soundTyping?: "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L" | null
        adminTier_mechanical?: "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L" | null
        adminTier_pcb?: "GOAT" | "SS" | "S" | "A" | "B" | "C" | "L" | null
        tierlistCategories?: string[]
      },
    }
  })

  const CATEGORY_LABELS: Record<string, string> = {
    all: "Geral",
    keyboard: "Teclados",
    pcb: "PCB",
    mouse: "Mouses",
    mousepad: "Mousepads",
    glasspad: "Glasspads",
    iem: "IEMs",
    headset: "Headsets",
    feet: "Feet",
    chairs: "Cadeiras",
    monitors: "Monitores",
    switches: "Switches",
    dac_amp: "DAC/AMP",
  }

  return (
    <div className="mx-auto max-w-6xl px-3 py-5 md:px-6 md:py-6 lg:px-8 space-y-4 md:space-y-5">
      <TierlistContent initialData={items as any} categoryLabels={CATEGORY_LABELS} />
      <TierlistInfo latestUpdate={tierlistMeta} />
    </div>
  )
}
