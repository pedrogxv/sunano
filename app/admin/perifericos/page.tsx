import Link from "next/link"
import { Plus } from "lucide-react"

import { Button } from "@/components/ui/button"
import { createSupabaseServerClient } from "@/lib/supabase-server"
import { PerifericosContent } from "@/app/perifericos/perifericos-content"
import { mapTier } from "@/lib/tier-utils"

export default async function AdminPerifericosPage() {
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
    description: p.description ?? null,
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">Admin Perifericos</h1>
          <p className="text-sm text-slate-400 mt-1">Gerencie os perifericos fora da tierlist.</p>
        </div>
        <Link href="/admin/perifericos/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            Novo Periferico
          </Button>
        </Link>
      </div>
      <PerifericosContent initialData={items} />
    </div>
  )
}
