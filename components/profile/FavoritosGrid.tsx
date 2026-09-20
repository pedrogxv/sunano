"use client"

import Link from "next/link"
import { Heart, Plus } from "lucide-react"

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { TierItemTooltipContent, type TierItemTooltipContentProps } from "@/components/tierlist/TierItemTooltipContent"
import {
  PeripheralMiniCard,
  PeripheralMiniCardEmpty,
  type MiniCardAuthor,
} from "@/components/profile/PeripheralMiniCard"
import { getFavoriteLimit, type AccountTier } from "@/lib/account-tier"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { mapTier } from "@/lib/tier-utils"
import type { ShowcasePeripheral } from "@/lib/profile-showcase"

interface FavoritosGridProps {
  /** Já filtrados pelo limite do tier (ver `selectVisibleFavorites`). */
  favorites: ShowcasePeripheral[]
  tier: AccountTier
  /** Dono do perfil — a foto que acompanha a nota dele no rodapé do card. */
  author: MiniCardAuthor
  /** Nota do dono por periférico (`profile.own_review_ratings`). */
  ownRatings: Record<string, number>
  isOwner?: boolean
}

/**
 * Periféricos favoritos. O número de slots é o limite do tier
 * (3 comum · 8 VIP), com os não preenchidos exibidos como
 * placeholders — inclusive para deixar o ganho de upgrade visível.
 */
export function FavoritosGrid({
  favorites,
  tier,
  author,
  ownRatings,
  isOwner = false,
}: FavoritosGridProps) {
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

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
        {favorites.map((peripheral) => {
          const href = `/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}`

          return (
            <Tooltip key={peripheral.id}>
              {/* Wrapper com ref para o Radix — ver o mesmo caso em SetupGrid. */}
              <TooltipTrigger asChild>
                <div className="h-full">
                  <PeripheralMiniCard
                    peripheral={peripheral}
                    rating={ownRatings[peripheral.id] ?? null}
                    author={author}
                    className="h-full"
                  />
                </div>
              </TooltipTrigger>
              <TooltipContent
                className="rounded-xl border border-border bg-popover p-4 shadow-2xl backdrop-blur-md"
                sideOffset={12}
                side="bottom"
                align="center"
              >
                <Link href={href} aria-label={peripheral.name} className="block cursor-pointer hover:opacity-95">
                  <TierItemTooltipContent
                    name={peripheral.name}
                    brand={peripheral.brand}
                    categoryLabel={peripheral.category}
                    image_url={peripheral.image_url}
                    tier={peripheral.tier ? mapTier(peripheral.tier) : null}
                    ratings={peripheral.ratings}
                    tags={peripheral.tags as TierItemTooltipContentProps["tags"]}
                  />
                </Link>
              </TooltipContent>
            </Tooltip>
          )
        })}

        {Array.from({ length: emptySlots }, (_, i) => (
          <PeripheralMiniCardEmpty
            key={`empty-${i}`}
            icon={isOwner ? <Plus className="size-6" /> : <Heart className="size-6" />}
            label={isOwner ? "Adicionar" : "Vazio"}
          />
        ))}
      </div>
    </section>
  )
}
