import { createSupabaseServerClient } from "@/lib/supabase-server"
import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { TierlistHeader } from "@/components/tierlist/TierlistHeader"
import { TierlistInfo } from "@/components/tierlist/TierlistInfo"
import { TierlistContent } from "@/components/tierlist/TierlistContent"
import { mapTier } from "@/lib/tier-utils"

export default async function Page() {
  const supabase = await createSupabaseServerClient()

  const { data: peripherals, error } = await supabase
    .from("peripherals")
    .select("*")
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Error fetching peripherals:", error)
  }

  const peripheralsList = (peripherals ?? []) as any[]

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
  }))

  const CATEGORY_LABELS: Record<string, string> = {
    all: "Geral",
    keyboard: "Teclados",
    mouse: "Mouses",
    mousepad: "Mousepads",
    glasspad: "Glasspads",
    iem: "IEMs",
    headset: "Headsets",
  }

  return (
    <div className="min-h-screen bg-background text-foreground pt-16">
      <div className="flex">
        {/* Sidebar */}
        <div className="hidden md:flex md:sticky md:top-16 md:h-[calc(100vh-64px)] md:shrink-0">
          <PublicSidebar />
        </div>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-6xl px-4 py-6 md:px-6 lg:px-8 space-y-5">
            {/* <TierlistHeader categoryLabel={CATEGORY_LABELS.all} /> */}
            <TierlistContent initialData={items as any} categoryLabels={CATEGORY_LABELS} />
            <TierlistInfo />
          </div>
        </main>
      </div>

      {/* Mobile Sidebar */}
      <div className="md:hidden">
        <PublicSidebar />
      </div>
    </div>
  )
}
