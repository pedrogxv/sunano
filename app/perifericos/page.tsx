import { PublicSidebar } from "@/components/layout/PublicSidebar"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { PerifericosContent } from "./perifericos-content"

export default async function PerifericosPage() {
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
    tier: p.tier as "T0" | "T0.5" | "T1" | "T2",
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

  return (
    <div className="min-h-screen bg-background text-foreground pt-16">
      <div className="flex">
        <div className="hidden md:flex md:sticky md:top-16 md:h-[calc(100vh-64px)] md:shrink-0">
          <PublicSidebar />
        </div>

        <main className="flex-1 min-w-0">
          <PerifericosContent initialData={items} />
        </main>
      </div>

      <div className="md:hidden">
        <PublicSidebar />
      </div>
    </div>
  )
}
