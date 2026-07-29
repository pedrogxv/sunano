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

/**
 * Um slot do setup. Só aceita periférico do catálogo — texto livre foi
 * removido para o perfil público não virar campo aberto de escrita.
 */
export type SetupItem = {
  slot: SetupSlot
  peripheral: ShowcasePeripheral | null
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
  /** Slug único do nome — segmento da URL pública (`/perfil/<slug>`). */
  display_slug: string | null
  avatar_url: string | null
  banner_url: string | null
  /** Faixa curta atrás do avatar — o "mini perfil" do card do diretório. */
  mini_banner_url: string | null
  bio: string | null
  account_tier: import("./account-tier").AccountTier
  member_since: string
  /** Quantas pessoas seguem este perfil. */
  followers: number
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
