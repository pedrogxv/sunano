/**
 * Tipos do perfil público (vitrine).
 *
 * Vive fora de `lib/server/**` porque Client Components também precisam
 * destas formas (editor de setup, seletor de medalhas). O módulo é puro:
 * só tipos e constantes, nenhum acesso a dados.
 */

export const SETUP_SLOTS = ["mouse", "keyboard", "headset", "monitor", "mousepad"] as const

export type SetupSlot = (typeof SETUP_SLOTS)[number]

export type MedalRarity = "common" | "rare" | "epic" | "legendary"

export type ShowcasePeripheral = {
  id: string
  name: string
  brand: string
  category: string
  image_url: string | null
  tier: string | null
}

export type SetupItem = {
  slot: SetupSlot
  peripheral: ShowcasePeripheral | null
  custom_label: string | null
}

export type ShowcaseMedal = {
  id: string
  slug: string
  name: string
  description: string | null
  icon_url: string | null
  rarity: MedalRarity
  awarded_at: string
  pinned: boolean
  pinned_order: number | null
}

export type ProfileShowcase = {
  id: string
  display_name: string
  avatar_url: string | null
  banner_url: string | null
  bio: string | null
  account_tier: import("./account-tier").AccountTier
  member_since: string
  setup: SetupItem[]
  /** Medalhas já filtradas pelo limite do tier. */
  medals: ShowcaseMedal[]
  /** Total conquistado, para exibir "+N" quando exceder o limite. */
  medals_total: number
  /** Favoritos já filtrados pelo limite do tier. */
  favorites: ShowcasePeripheral[]
  favorites_total: number
}

/** Limite de caracteres da bio (espelha o CHECK constraint da tabela). */
export const BIO_MAX_LENGTH = 160
