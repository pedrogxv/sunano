import type { AccountTier } from "@/lib/account-tier"
import type { ProfileMediaAdjustments } from "@/lib/profile-media-adjust"

/**
 * Mini Perfil — o cartão compacto de preview rápido, no conceito de "Profile
 * Background" da Steam.
 *
 * É uma feature separada do banner grande do perfil (`banner_url`, exibido no
 * topo de `/perfil/[handle]`): aqui o fundo é o `mini_banner_url`, enviado à
 * parte, e pode ser um GIF quando o tier libera mídia animada.
 *
 * Tipo puro — importável tanto pelo repositório quanto pelos Client
 * Components, que só falam com `/api/users/mini-profile`.
 */
export type MiniProfile = {
  id: string
  display_name: string
  display_slug: string
  avatar_url: string | null
  /** Fundo próprio do cartão de preview. Nada a ver com `banner_url`. */
  mini_banner_url: string | null
  /** Enquadramento escolhido para cada imagem (ver `profile-media-adjust`). */
  media_adjustments: ProfileMediaAdjustments
  account_tier: AccountTier
  bio: string | null
  profile_views: number
  followers: number
  aura: number
  created_at: string
}
