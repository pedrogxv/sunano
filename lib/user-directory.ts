import type { AccountTier } from "@/lib/account-tier"
import type { ProfileMediaAdjustments } from "@/lib/profile-media-adjust"

/**
 * Cartão de perfil do diretório de pessoas (`/pessoas`). Tipo puro —
 * importável tanto pelo repositório (`users-repository`) quanto pelos
 * componentes client, que só falam com `/api/users/**`.
 */
export type PublicProfileSummary = {
  id: string
  display_name: string
  display_slug: string
  avatar_url: string | null
  mini_banner_url: string | null
  /** Enquadramento escolhido para cada imagem (ver `profile-media-adjust`). */
  media_adjustments: ProfileMediaAdjustments
  account_tier: AccountTier
  profile_views: number
  followers: number
  /** Saldo acumulado em `user_aura_wallet` — a mesma Aura que o fórum credita. */
  aura: number
  /** Posts + comentários (fórum e notícias) — soma usada pelo ranking "Mais Ativos". */
  activity: number
  created_at: string
}

/** Ordenações aceitas por `/api/users/directory`. */
export const DIRECTORY_SORTS = ["aura", "visited", "followed", "following", "active"] as const
export type DirectorySort = (typeof DIRECTORY_SORTS)[number]

export function coerceDirectorySort(value: unknown): DirectorySort {
  return DIRECTORY_SORTS.includes(value as DirectorySort) ? (value as DirectorySort) : "aura"
}

/** Número que o card do diretório destaca — acompanha a aba selecionada. */
export type DirectoryMetric = "aura" | "views" | "followers" | "activity"

/**
 * Cor de fundo do card quando a pessoa não subiu mini banner.
 *
 * Derivada do id, então é estável entre renders e sessões: o mesmo perfil
 * tem sempre a mesma cor. Sem isso a grade inteira fica cinza igual, já que
 * a maioria dos membros não personaliza nada.
 */
export function profileAccentHue(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 360
  }
  return hash
}
