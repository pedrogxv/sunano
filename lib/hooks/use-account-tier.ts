"use client"

import { useMemo } from "react"

import {
  canUseAnimatedMedia,
  coerceAccountTier,
  countHiddenByTier,
  getMedalLimit,
  getFavoriteLimit,
  getTierCapabilities,
  selectVisibleFavorites,
  selectVisibleMedals,
  type AccountTier,
  type AwardedMedalLike,
  type FavoriteLike,
  type TierCapabilities,
} from "@/lib/account-tier"

export type UseAccountTierResult = {
  tier: AccountTier
  capabilities: TierCapabilities
  medalLimit: number
  favoriteLimit: number
  animatedMedia: boolean
  isVip: boolean
  /** Aplica o limite do tier a uma lista de medalhas conquistadas. */
  visibleMedals: <T extends AwardedMedalLike>(medals: T[]) => T[]
  /** Aplica o limite do tier a uma lista de favoritos. */
  visibleFavorites: <T extends FavoriteLike>(favorites: T[]) => T[]
  /** Quantos itens de uma lista ficam de fora por causa do limite. */
  hiddenCount: (total: number, limit: number) => number
}

/**
 * Acesso às regras de tier em Client Components (ex.: o seletor de medalhas
 * fixadas). Envolve as funções puras de `lib/account-tier` — a fonte da
 * verdade continua sendo aquele módulo, usado também no servidor.
 */
export function useAccountTier(rawTier: unknown): UseAccountTierResult {
  return useMemo(() => {
    const tier = coerceAccountTier(rawTier)
    return {
      tier,
      capabilities: getTierCapabilities(tier),
      medalLimit: getMedalLimit(tier),
      favoriteLimit: getFavoriteLimit(tier),
      animatedMedia: canUseAnimatedMedia(tier),
      isVip: tier !== "common",
      visibleMedals: (medals) => selectVisibleMedals(medals, tier),
      visibleFavorites: (favorites) => selectVisibleFavorites(favorites, tier),
      hiddenCount: countHiddenByTier,
    }
  }, [rawTier])
}
