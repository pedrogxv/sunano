/**
 * Tier de conta e as capacidades que ele libera no perfil público.
 *
 * Módulo puro (sem I/O, sem `server-only`): pode ser importado tanto pelos
 * repositórios quanto por Client Components. Toda regra de "quanto o usuário
 * pode exibir" vive aqui — nenhum componente deve repetir esses números.
 */

export const ACCOUNT_TIERS = ["common", "vip"] as const

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
  /**
   * Desconto (basis points, 1000 = 10%) aplicado ao custo em Aura na Central
   * de Aura. Só documenta o número aqui — o débito real é decidido dentro
   * das RPCs `redeem_aura_item`/`change_display_name_with_aura` em SQL,
   * nunca em TS (o client nunca deve decidir o preço).
   */
  auraDiscountBps: number
  /** Quantas reações (like/dislike) o usuário pode dar por dia. */
  dailyAuraGiveLimit: number
}

export const TIER_CAPABILITIES: Record<AccountTier, TierCapabilities> = {
  common: { label: "Membro", maxMedals: 3, maxFavorites: 3, animatedMedia: false, auraDiscountBps: 0, dailyAuraGiveLimit: 50 },
  vip:    { label: "VIP",    maxMedals: 8, maxFavorites: 8, animatedMedia: true, auraDiscountBps: 1000, dailyAuraGiveLimit: 100 },
}

/**
 * VIP "ativo agora" — `vip_expires_at IS NULL` (manual/cargo, sem
 * expiração) ou ainda dentro do período pago. Espelho TS de `is_vip_active`
 * (SQL, ver migration `20260922000001_is_vip_active_helper.sql`) — mudar um,
 * mudar o outro. Único ponto de verdade: nenhum componente/repositório deve
 * checar `account_tier !== "common"` sozinho, sempre passar por aqui.
 */
export function isVipActive(
  accountTier: AccountTier | string | null | undefined,
  vipExpiresAt: string | null | undefined
): boolean {
  if (accountTier !== "vip") return false
  if (!vipExpiresAt) return true
  return new Date(vipExpiresAt).getTime() > Date.now()
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

/**
 * Detecta mídia animada pela URL.
 *
 * Mídia enviada por nós termina em `.gif` — o upload deriva a extensão dos
 * magic bytes (ver `lib/server/upload-validation.ts`), então a extensão é
 * confiável. Mas avatar de login social **não passa pelo upload**: o
 * `auth/callback` copia a URL do provedor direto para o perfil, e nenhum dos
 * dois formatos abaixo tem `.gif` no caminho. Testar só a extensão deixava
 * conta comum exibindo avatar animado do Google/Discord — foi exatamente o
 * caso que motivou os dois padrões extras:
 *
 *  - Google (`lh3.googleusercontent.com/a/…=s96-c`): sem extensão nenhuma, o
 *    tipo real só aparece no `Content-Type` da resposta. Não dá para checar
 *    isso aqui (a função é síncrona e roda no cliente), então quem sonda o
 *    `Content-Type` é `markAnimatedOAuthAvatar` (no login, veja
 *    `lib/server/oauth-avatar.ts`), gravando o sufixo `#animated` na URL.
 *    Os avatares que já existiam foram marcados pela migration
 *    20261029000003.
 *  - Discord (`cdn.discordapp.com/avatars/{id}/a_{hash}.png`): o prefixo
 *    `a_` no hash é o que marca avatar animado; a extensão continua `.png`
 *    (o CDN serve GIF na mesma URL).
 */
export function isAnimatedMediaUrl(url: string | null | undefined): boolean {
  if (!url) return false
  const [path] = url.split("?")
  if (/\.gif$/i.test(path)) return true
  if (/#animated$/.test(url)) return true
  return /\/avatars\/\d+\/a_[0-9a-f]+/i.test(path)
}

export type ProfileMedia = {
  src: string | null
  /**
   * `true` só quando o arquivo é animado E o tier VIP está ativo agora
   * (`isVipActive`) — não apenas quando `account_tier` diz "vip", que pode
   * estar desatualizado (VIP pago que venceu, cargo removido).
   *
   * Os componentes repassam este valor para `unoptimized` do `next/image`,
   * mas isto sozinho não impede a animação: o loader não redimensiona nada
   * (ver `lib/storage-image.ts`), então o navegador recebe o GIF original de
   * qualquer forma. Quem de fato barra a animação de conta não-VIP é
   * `needsFreeze` abaixo.
   */
  animated: boolean
  /**
   * `true` quando o arquivo é GIF mas o tier atual (VIP ativo ou não) não
   * libera animação — ex.: a conta era VIP quando enviou, o VIP venceu
   * depois, e o arquivo continua sendo o mesmo GIF no Storage.
   *
   * O upload (`app/api/profile/upload-avatar` etc.) recusa GIF de conta
   * comum, mas isso só protege o momento do envio — não cobre quem já tinha
   * o arquivo antes de perder o VIP. `ImageWithFallback` usa esta flag para
   * desenhar o primeiro quadro num `<canvas>` em vez de exibir o GIF animado.
   */
  needsFreeze: boolean
}

/**
 * Resolve como renderizar banner/avatar conforme o tier de quem os enviou.
 *
 * `vipExpiresAt` é obrigatório de propósito: `account_tier` sozinho não diz
 * se o VIP está ativo agora (ver `isVipActive`), e um chamador que
 * esquecesse de checar a validade voltaria a deixar GIF de conta vencida
 * animar — foi exatamente esse o bug que motivou o parâmetro.
 */
export function resolveProfileMedia(
  url: string | null | undefined,
  tier: AccountTier,
  vipExpiresAt: string | null
): ProfileMedia {
  const isGif = isAnimatedMediaUrl(url)
  const canAnimate = isVipActive(tier, vipExpiresAt) && canUseAnimatedMedia(tier)
  return {
    src: url ?? null,
    animated: isGif && canAnimate,
    needsFreeze: isGif && !canAnimate,
  }
}

/** Campo de mídia de perfil servido por `/api/profile-media/[userId]/[field]`. */
export type ProfileMediaField = "avatar" | "banner" | "mini-banner"

/**
 * URL pela qual banner/avatar/mini-banner devem ser exibidos — nunca a coluna
 * `avatar_url`/`banner_url`/`mini_banner_url` crua.
 *
 * O congelamento de GIF de conta não-VIP (`needsFreeze` acima) sempre foi só
 * decisão de renderização: o navegador recebia o arquivo original do Storage
 * (bucket público) de qualquer forma, então qualquer um com a URL direta via
 * a animação rodando, tier nenhum. Esta rota resolve tier fresco no servidor
 * (não confia no `tier`/`vipExpiresAt` que o chamador tinha em mão) e só
 * então decide se devolve o arquivo original ou um quadro estático — a
 * mesma checagem, uma única vez, no único lugar que pode de fato impedir a
 * entrega do byte.
 */
export function profileMediaProxyUrl(userId: string, field: ProfileMediaField): string {
  return `/api/profile-media/${userId}/${field}`
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
