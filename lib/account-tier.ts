/**
 * Tier de conta e as capacidades que ele libera no perfil público.
 *
 * Módulo puro (sem I/O, sem `server-only`): pode ser importado tanto pelos
 * repositórios quanto por Client Components. Toda regra de "quanto o usuário
 * pode exibir" vive aqui — nenhum componente deve repetir esses números.
 */

export const ACCOUNT_TIERS = ["common", "vip", "vip_plus"] as const

export type AccountTier = (typeof ACCOUNT_TIERS)[number]

export type TierCapabilities = {
  /** Rótulo exibido no badge do perfil. */
  label: string
  /** Máximo de medalhas exibidas no perfil. */
  maxMedals: number
  /** Máximo de periféricos favoritos exibidos no perfil. */
  maxFavorites: number
  /** Se GIF anima no banner e na foto de perfil. */
  animatedMedia: boolean
}

export const TIER_CAPABILITIES: Record<AccountTier, TierCapabilities> = {
  common:   { label: "Membro", maxMedals: 3, maxFavorites: 3, animatedMedia: false },
  vip:      { label: "VIP",    maxMedals: 5, maxFavorites: 5, animatedMedia: true },
  vip_plus: { label: "VIP+",   maxMedals: 8, maxFavorites: 8, animatedMedia: true },
}

/** Normaliza um valor vindo do banco (ou de um payload) para um tier válido. */
export function coerceAccountTier(value: unknown): AccountTier {
  return ACCOUNT_TIERS.includes(value as AccountTier) ? (value as AccountTier) : "common"
}

export function getTierCapabilities(tier: AccountTier): TierCapabilities {
  return TIER_CAPABILITIES[tier]
}

/** Quantas medalhas este tier exibe no perfil. */
export function getMedalLimit(tier: AccountTier): number {
  return TIER_CAPABILITIES[tier].maxMedals
}

/** Quantos periféricos favoritos este tier exibe no perfil. */
export function getFavoriteLimit(tier: AccountTier): number {
  return TIER_CAPABILITIES[tier].maxFavorites
}

/** Se o tier pode exibir mídia animada (GIF) no banner e na foto. */
export function canUseAnimatedMedia(tier: AccountTier): boolean {
  return TIER_CAPABILITIES[tier].animatedMedia
}

/** Detecta GIF pela extensão da URL (ignora querystring). */
export function isAnimatedMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const [path] = url.split("?")
  return /\.gif$/i.test(path)
}

export type ProfileMedia = {
  src: string | null
  /**
   * `true` só quando o arquivo é animado E o tier libera animação.
   *
   * Os componentes repassam este valor para `unoptimized` do `next/image`:
   * o GIF de um VIP pula o redimensionamento e chega exatamente como foi
   * enviado, sem perder quadros na reamostragem.
   *
   * Atenção: isto não é mais o que *impede* um GIF de animar. O
   * redimensionamento agora é feito pelo Supabase Storage (ver
   * `lib/image-loader.ts`), que preserva a animação — diferente do otimizador
   * da Vercel, que servia só o primeiro quadro. Quem garante a regra de
   * "animado só para VIP" é o upload (`app/api/profile/upload-avatar`), que
   * recusa GIF de conta comum.
   */
  animated: boolean
}

/** Resolve como renderizar banner/avatar conforme o tier de quem os enviou. */
export function resolveProfileMedia(
  url: string | null | undefined,
  tier: AccountTier
): ProfileMedia {
  return {
    src: url ?? null,
    animated: isAnimatedMediaUrl(url) && canUseAnimatedMedia(tier),
  }
}

/** Uma medalha conquistada, no formato mínimo exigido pela seleção. */
export type AwardedMedalLike = {
  awarded_at: string
  pinned: boolean
  pinned_order: number | null
}

/**
 * Decide quais medalhas aparecem no perfil.
 *
 * Regra: só as fixadas pelo usuário, na ordem que ele escolheu, até o limite
 * do tier — quem não selecionou nada não mostra nenhuma. Rebaixar de tier
 * apenas esconde as excedentes — nunca as perde.
 */
export function selectVisibleMedals<T extends AwardedMedalLike>(
  medals: T[],
  tier: AccountTier
): T[] {
  const limit = getMedalLimit(tier)
  if (limit <= 0) return []

  const byRecency = (a: T, b: T) =>
    new Date(b.awarded_at).getTime() - new Date(a.awarded_at).getTime()

  const pinned = medals
    .filter((m) => m.pinned)
    .sort((a, b) => {
      const orderA = a.pinned_order ?? Number.MAX_SAFE_INTEGER
      const orderB = b.pinned_order ?? Number.MAX_SAFE_INTEGER
      return orderA === orderB ? byRecency(a, b) : orderA - orderB
    })

  return pinned.slice(0, limit)
}

/** Um favorito, no formato mínimo exigido pela seleção. */
export type FavoriteLike = { position: number }

/** Aplica o limite do tier aos favoritos, respeitando a ordem escolhida. */
export function selectVisibleFavorites<T extends FavoriteLike>(
  favorites: T[],
  tier: AccountTier
): T[] {
  return [...favorites]
    .sort((a, b) => a.position - b.position)
    .slice(0, getFavoriteLimit(tier))
}

/**
 * Quantos itens excedem o limite do tier — usado para mostrar
 * "+N" e para sugerir upgrade a quem tem mais do que consegue exibir.
 */
export function countHiddenByTier(total: number, limit: number): number {
  return Math.max(0, total - limit)
}
