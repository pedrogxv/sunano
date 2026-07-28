import Image from "next/image"
import Link from "next/link"
import { Heart, Plus } from "lucide-react"

import { getFavoriteLimit, type AccountTier } from "@/lib/account-tier"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import type { ShowcasePeripheral } from "@/lib/profile-showcase"
import { cn } from "@/lib/utils"

interface FavoritosGridProps {
  /** Já filtrados pelo limite do tier (ver `selectVisibleFavorites`). */
  favorites: ShowcasePeripheral[]
  tier: AccountTier
  isOwner?: boolean
}

/**
 * Periféricos favoritos. O número de slots é o limite do tier
 * (3 comum · 5 VIP · 8 VIP+), com os não preenchidos exibidos como
 * placeholders — inclusive para deixar o ganho de upgrade visível.
 */
export function FavoritosGrid({ favorites, tier, isOwner = false }: FavoritosGridProps) {
  const limit = getFavoriteLimit(tier)
  const emptySlots = Math.max(0, limit - favorites.length)

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Periféricos favoritos ({limit})
        </h2>
        <span className="text-xs text-muted-foreground/60">
          {favorites.length} de {limit}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {favorites.map((peripheral) => (
          <Link
            key={peripheral.id}
            href={`/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}`}
            className="group flex flex-col gap-2 rounded-xl border border-border bg-card/60 p-3 transition-colors hover:border-primary/40 hover:bg-card"
          >
            <div className="relative flex h-20 items-center justify-center">
              {peripheral.image_url ? (
                <Image
                  src={peripheral.image_url}
                  alt={peripheral.name}
                  fill
                  sizes="200px"
                  className="object-contain"
                />
              ) : (
                <Heart className="size-8 text-muted-foreground/30" />
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[11px] uppercase tracking-wider text-muted-foreground">
                {peripheral.brand}
              </p>
              <p className="line-clamp-2 text-xs font-medium text-foreground">{peripheral.name}</p>
            </div>
          </Link>
        ))}

        {Array.from({ length: emptySlots }, (_, i) => (
          <div
            key={`empty-${i}`}
            className={cn(
              "flex h-full min-h-32 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 p-3 text-muted-foreground/40"
            )}
          >
            {isOwner ? <Plus className="size-5" /> : <Heart className="size-5" />}
            <span className="text-[11px]">{isOwner ? "Adicionar" : "Vazio"}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
