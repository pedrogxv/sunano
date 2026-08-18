/**
 * Conquistas gerais (posts/comentários/seguidores) e ofensiva (streak) de
 * missões diárias.
 *
 * Módulo puro (sem I/O, sem `server-only`) — importável tanto pelos
 * repositórios quanto por Client Components, mesmo padrão de
 * `lib/profile-showcase.ts` e `lib/account-tier.ts`. Os limiares/nomes aqui
 * espelham os seeds de `20260808_achievements_streak.sql` (posts/comments/
 * followers) e `20260919000000_aura_earned_achievements.sql` (aura_earned);
 * se um seed mudar, atualizar aqui junto (é só exibição — quem decide o que
 * foi conquistado é sempre o banco).
 */

export const ACHIEVEMENT_TRACKS = ["posts", "comments", "followers", "aura_earned"] as const
export type AchievementTrack = (typeof ACHIEVEMENT_TRACKS)[number]

export const ACHIEVEMENT_TIERS = ["bronze", "silver", "gold", "platinum", "diamond"] as const
export type AchievementTier = (typeof ACHIEVEMENT_TIERS)[number]

/**
 * Limiares dos 5 níveis por trilha — posts/comments/followers compartilham a
 * mesma progressão (1/10/50/100/1000); aura_earned (total histórico de Aura
 * ganha, ver `user_aura_wallet.total_earned`) tem a sua própria
 * (10/300/1000/10000/50000).
 */
export const ACHIEVEMENT_THRESHOLDS: Record<AchievementTrack, Record<AchievementTier, number>> = {
  posts: { bronze: 1, silver: 10, gold: 50, platinum: 100, diamond: 1000 },
  comments: { bronze: 1, silver: 10, gold: 50, platinum: 100, diamond: 1000 },
  followers: { bronze: 1, silver: 10, gold: 50, platinum: 100, diamond: 1000 },
  aura_earned: { bronze: 10, silver: 300, gold: 1000, platinum: 10000, diamond: 50000 },
}

export const ACHIEVEMENT_TRACK_LABELS: Record<AchievementTrack, string> = {
  posts: "Posts",
  comments: "Comentários",
  followers: "Seguidores",
  aura_earned: "Aura farmada",
}

/** Nome de cada nível por trilha — posts/comentários usam rótulo genérico; seguidores e aura_earned têm nomes temáticos. */
export const ACHIEVEMENT_TIER_NAMES: Record<AchievementTrack, Record<AchievementTier, string>> = {
  posts: {
    bronze: "Nível Bronze",
    silver: "Nível Prata",
    gold: "Nível Ouro",
    platinum: "Nível Platina",
    diamond: "Nível Diamante",
  },
  comments: {
    bronze: "Nível Bronze",
    silver: "Nível Prata",
    gold: "Nível Ouro",
    platinum: "Nível Platina",
    diamond: "Nível Diamante",
  },
  followers: {
    bronze: "Astro",
    silver: "Ídolo",
    gold: "Famosinho",
    platinum: "Celebridade",
    diamond: "Lenda",
  },
  aura_earned: {
    bronze: "Brasa",
    silver: "Chama",
    gold: "Fogueira",
    platinum: "Incêndio",
    diamond: "Supernova",
  },
}

/** Mesma paleta de `MEDAL_RARITY_STYLES` (lib/profile-showcase.ts), mapeada por tier de conquista. */
export const ACHIEVEMENT_TIER_STYLES: Record<AchievementTier, string> = {
  bronze: "border-amber-700/40 bg-amber-700/10 text-amber-600",
  silver: "border-slate-400/40 bg-slate-400/10 text-slate-300",
  gold: "border-amber-400/50 bg-amber-400/10 text-amber-300",
  platinum: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  diamond: "border-violet-400/40 bg-violet-400/10 text-violet-300",
}

export const ACHIEVEMENT_TIER_SOLID: Record<AchievementTier, string> = {
  bronze: "#b45309",
  silver: "#94a3b8",
  gold: "#fbbf24",
  platinum: "#38bdf8",
  diamond: "#a78bfa",
}

/** Cor sólida da barra de progresso por tier — mesmo papel de `MEDAL_RARITY_BAR` (lib/profile-showcase.ts). */
export const ACHIEVEMENT_TIER_BAR: Record<AchievementTier, string> = {
  bronze: "bg-amber-700",
  silver: "bg-slate-400",
  gold: "bg-amber-400",
  platinum: "bg-sky-400",
  diamond: "bg-violet-400",
}

export type ShowcaseAchievement = {
  id: string
  slug: string
  track: AchievementTrack
  tier: AchievementTier
  threshold: number
  name: string
  description: string | null
  aura_reward: number
  awarded_at: string
}

/** Progresso de uma trilha: nível atual (se algum) + quanto falta pro próximo. */
export type TrackProgress = {
  track: AchievementTrack
  count: number
  currentTier: AchievementTier | null
  nextTier: AchievementTier | null
  nextThreshold: number | null
}

/** Monta o progresso das 3 trilhas a partir da contagem bruta e das conquistas já desbloqueadas. */
export function buildTrackProgress(
  counts: Record<AchievementTrack, number>,
  unlocked: ShowcaseAchievement[]
): TrackProgress[] {
  return ACHIEVEMENT_TRACKS.map((track) => {
    const count = counts[track] ?? 0
    const unlockedTiers = new Set(unlocked.filter((a) => a.track === track).map((a) => a.tier))
    let currentTier: AchievementTier | null = null
    let nextTier: AchievementTier | null = null
    for (const tier of ACHIEVEMENT_TIERS) {
      if (unlockedTiers.has(tier)) {
        currentTier = tier
      } else if (nextTier === null) {
        nextTier = tier
      }
    }
    return {
      track,
      count,
      currentTier,
      nextTier,
      nextThreshold: nextTier ? ACHIEVEMENT_THRESHOLDS[track][nextTier] : null,
    }
  })
}

export type DailyMissionsState = {
  created_post: boolean
  wrote_comment: boolean
  gave_aura: boolean
  bonus_claimed: boolean
}

export const EMPTY_DAILY_MISSIONS: DailyMissionsState = {
  created_post: false,
  wrote_comment: false,
  gave_aura: false,
  bonus_claimed: false,
}

export type DailyMissionKey = keyof Omit<DailyMissionsState, "bonus_claimed">

/** As 3 missões do dia, na ordem de exibição — usado por `AuraMissionsBadge` (TopBar). */
export const DAILY_MISSION_KEYS: Array<{ key: DailyMissionKey; label: string }> = [
  { key: "created_post", label: "Criar um post" },
  { key: "wrote_comment", label: "Fazer um comentário" },
  { key: "gave_aura", label: "Dar aura em algo" },
]

/** Aura creditada ao completar cada missão pela primeira vez no dia — espelha
 * o `case p_mission` de `complete_daily_mission` (ver
 * 20260811000000_daily_mission_reward_rebalance.sql); se o valor mudar no
 * banco, atualizar aqui junto (é só exibição). */
export const DAILY_MISSION_REWARDS: Record<DailyMissionKey, number> = {
  created_post: 5,
  wrote_comment: 3,
  gave_aura: 1,
}

/** Quantas das 3 missões já foram cumpridas hoje. */
export function countCompletedMissions(missions: DailyMissionsState): number {
  return DAILY_MISSION_KEYS.filter(({ key }) => missions[key]).length
}

export type UserStreak = {
  /** 0 quando a ofensiva expirou (último dia completo não foi hoje nem ontem). */
  current: number
  longest: number
}

/** Mesmo formato de `formatCount` (EstatisticasContador.tsx), reexportado aqui para o grid de conquistas não importar um Client Component. */
export function formatAchievementCount(value: number): string {
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k`
  return String(value)
}
