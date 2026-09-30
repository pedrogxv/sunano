import "server-only"

import { unstable_cache } from "next/cache"

import { listAllPeripheralsForTierlist } from "@/lib/server/repositories/peripherals-repository"
import { getForumModeratorProfiles } from "@/lib/server/repositories/users-repository"
import { mapTier, type Tier } from "@/lib/tier-utils"
import type { PublicProfileSummary } from "@/lib/user-directory"

/**
 * Conteúdo real do site para o fundo das telas de sessão (login, cadastro,
 * 2FA, admin). É vitrine: nada por usuário, então um cache só serve a todos.
 */

export type AuthBackgroundPeripheral = {
  id: string
  name: string
  brand: string
  imageUrl: string
  category: string
  tier: Tier
  price: number
}

export type AuthBackgroundData = {
  /** Periféricos com foto, dos tiers mais altos, embaralhados a cada revalidação. */
  peripherals: AuthBackgroundPeripheral[]
  /** Moderadores da comunidade (os mesmos da sidebar do Fórum). */
  staff: PublicProfileSummary[]
}

export const EMPTY_AUTH_BACKGROUND: AuthBackgroundData = { peripherals: [], staff: [] }

/** Os tiers que ilustram a tierlist no fundo — o topo é o que a pessoa reconhece. */
const SHOWCASE_TIERS: readonly Tier[] = ["GOAT", "SS", "S"]
const PER_TIER = 4

function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export const getAuthBackgroundData = unstable_cache(
  async (): Promise<AuthBackgroundData> => {
    const [records, staff] = await Promise.all([
      listAllPeripheralsForTierlist().catch(() => []),
      getForumModeratorProfiles().catch(() => [] as PublicProfileSummary[]),
    ])

    const withImage = shuffle(
      records.flatMap((p) => {
        if (!p.image_url || !p.tier) return []
        const tier = mapTier(p.tier)
        if (!SHOWCASE_TIERS.includes(tier)) return []
        return [
          {
            id: p.id,
            name: p.name,
            brand: p.brand,
            imageUrl: p.image_url,
            category: p.category,
            tier,
            price: p.price,
          },
        ]
      })
    )

    // Até PER_TIER por tier: sem o corte, a lista seria dominada pelo tier
    // com mais itens e a fileira de GOAT sairia vazia.
    const peripherals = SHOWCASE_TIERS.flatMap((tier) =>
      withImage.filter((p) => p.tier === tier).slice(0, PER_TIER)
    )

    return { peripherals, staff }
  },
  ["auth-background:data"],
  { revalidate: 600 }
)
