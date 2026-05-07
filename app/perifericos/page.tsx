import { createSupabaseServerClient } from "@/lib/supabase-server"
import { PerifericosContent } from "./perifericos-content"
import { mapTier } from "@/lib/tier-utils"

export default async function PerifericosPage() {
  const supabase = await createSupabaseServerClient()

  const { data: peripherals, error } = await supabase
    .from("peripherals")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching peripherals:", error)
  }

  const peripheralsList = (peripherals ?? []) as Array<{
    id: string
    name: string
    brand: string
    image_url: string | null
    category: string
    tier: string | null
    price: number
    tags?: string[] | null
    specs?: Record<string, unknown> | null
    description?: string | null
  }>

  const items = peripheralsList.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    image_url: p.image_url,
    category: p.category as "keyboard" | "mouse" | "mousepad" | "glasspad" | "iem" | "headset",
    tier: p.tier ? mapTier(p.tier) : null,
    price: p.price,
    tags: (p.tags || []) as ("competitive" | "versatile" | "value" | "comfort")[],
    specs: (p.specs || {}) as {
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
    description: p.description ?? null,
  }))

  return <PerifericosContent initialData={items} />
}
