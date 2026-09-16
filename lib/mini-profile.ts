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
  /** Validade do VIP — `null` = sem expiração (manual/cargo). Usar sempre com `isVipActive`, nunca `account_tier` sozinho. */
  vip_expires_at: string | null
  bio: string | null
  profile_views: number
  followers: number
  aura: number
  /** Ofensiva atual (dias consecutivos completando as missões diárias) — 0 se não tem ou expirou. */
  streak: number
  /**
   * Slug do Fundo de Mini Perfil equipado (item `mini_profile_bg` da Central
   * de Aura), ou `null`. É o slug e não o id porque a arte do tema mora no
   * código, indexada por slug (ver `lib/mini-profile-backgrounds.ts`) — o
   * cartão nunca precisa do id do item.
   */
  equipped_mini_profile_bg: string | null
  /**
   * Asset da moldura de avatar equipada (item `avatar_frame`), ou `null`.
   * Aqui é a URL e não o slug — ao contrário do fundo, cuja arte mora no
   * código, a moldura cosmética É o arquivo que o admin subiu.
   */
  equipped_avatar_frame_url: string | null
  /** Slug do mesmo item — só para identificar a moldura (ver `lib/profile-frames.ts`). */
  equipped_avatar_frame_slug: string | null
  /** Se possui a Moldura de Fundador. Permanente: vale mesmo sem VIP ativo. */
  is_founder: boolean
  /** O dono escolheu não exibir moldura nenhuma. */
  avatar_frame_opt_out: boolean
  created_at: string
}
