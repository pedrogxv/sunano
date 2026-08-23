import Image from "next/image"
import Link from "next/link"

import { cn } from "@/lib/utils"
import type { TierlistItem, TierlistTier } from "@/lib/server/repositories/user-tierlist-repository"

const TIERS: TierlistTier[] = ["S", "A", "B", "C", "D"]

const TIER_STYLES: Record<TierlistTier, { label: string; bg: string; text: string }> = {
  S: { label: "S", bg: "bg-[var(--vip-accent)]", text: "text-white" },
  A: { label: "A", bg: "bg-emerald-500", text: "text-white" },
  B: { label: "B", bg: "bg-sky-500", text: "text-white" },
  C: { label: "C", bg: "bg-amber-500", text: "text-white" },
  D: { label: "D", bg: "bg-muted-foreground/70", text: "text-white" },
}

/** Grade de tiers read-only — reaproveitada tanto na página dedicada quanto no card resumido do perfil. */
export function PersonalTierlistPublicView({ items }: { items: TierlistItem[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Ainda não há itens nesta tierlist.</p>
  }

  const byTier = new Map<TierlistTier, TierlistItem[]>()
  for (const tier of TIERS) byTier.set(tier, [])
  for (const item of items) byTier.get(item.tier)?.push(item)

  return (
    <div className="flex flex-col gap-2 overflow-x-auto">
      {TIERS.map((tier) => {
        const rowItems = byTier.get(tier) ?? []
        if (rowItems.length === 0) return null
        const style = TIER_STYLES[tier]
        return (
          <div key={tier} className="flex min-w-fit gap-2 rounded-lg border border-border/60 bg-secondary/30 p-2">
            <div
              className={cn(
                "flex size-14 shrink-0 items-center justify-center rounded-md text-xl font-bold",
                style.bg,
                style.text
              )}
            >
              {style.label}
            </div>
            <div className="flex flex-1 flex-wrap gap-2">
              {rowItems.map((item) => (
                <Link
                  key={item.peripheralId}
                  href={`/perifericos/${item.peripheralId}`}
                  title={item.peripheral.name}
                  className="group relative size-14 shrink-0 overflow-hidden rounded-md border border-border/60 bg-[var(--card-image-bg)] transition-transform hover:-translate-y-0.5"
                >
                  {item.peripheral.imageUrl ? (
                    <Image src={item.peripheral.imageUrl} alt={item.peripheral.name} fill sizes="56px" className="object-contain p-1" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-[10px] text-muted-foreground">
                      {item.peripheral.name.slice(0, 2)}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}
