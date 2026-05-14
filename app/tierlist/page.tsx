import { createSupabaseServerClient } from "@/lib/supabase-server"
import { TierlistInfo } from "@/components/tierlist/TierlistInfo"
import { TierlistContent } from "@/components/tierlist/TierlistContent"
import { mapTier } from "@/lib/tier-utils"

export default async function TierlistPage() {
  const supabase = await createSupabaseServerClient()

  const { data: peripherals, error } = await supabase
    .from("peripherals")
    .select("id, name, brand, image_url, category, tier, price, tags, specs")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching peripherals:", error)
  }

  const peripheralsList = (peripherals ?? []) as any[]

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
      category: p.category as "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset" | "feet" | "chairs" | "monitors" | "switches" | "dac_amp",
      tier: p.tier ? mapTier(p.tier) : null,
      price: p.price,
      tags: (p.tags || []) as ("competitive" | "versatile" | "value" | "comfort")[],
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
      },
    }
  })

  const CATEGORY_LABELS: Record<string, string> = {
    all: "Geral",
    keyboard: "Teclados",
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
    <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8 space-y-5">
      <TierlistContent initialData={items as any} categoryLabels={CATEGORY_LABELS} />
      <TierlistInfo />
    </div>
  )
}
