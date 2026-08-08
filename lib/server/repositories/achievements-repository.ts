import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  type AchievementTrack,
  type DailyMissionsState,
  type ShowcaseAchievement,
  type UserStreak,
  EMPTY_DAILY_MISSIONS,
} from "@/lib/achievements"

/**
 * Repositório de conquistas gerais, missões diárias e ofensiva.
 *
 * Toda a atomicidade (conceder conquista, marcar missão, avançar/expirar
 * ofensiva, creditar aura) vive nas funções Postgres
 * `check_and_award_track_achievements` e `complete_daily_mission` (ver
 * 20260808_achievements_streak.sql) — este repositório só chama as RPCs e
 * lê as tabelas resultantes, mesmo padrão de `aura-repository.ts`.
 */

export type { AchievementTrack, DailyMissionsState, ShowcaseAchievement, UserStreak }

type AchievementRow = {
  id: string
  slug: string
  track: ShowcaseAchievement["track"]
  tier: ShowcaseAchievement["tier"]
  threshold: number
  name: string
  description: string | null
  aura_reward: number
}

/** Conquistas gerais já desbloqueadas por um usuário. */
export async function getUserAchievements(userId: string): Promise<ShowcaseAchievement[]> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("user_achievements")
    .select("awarded_at, achievements ( id, slug, track, tier, threshold, name, description, aura_reward )")
    .eq("user_id", userId)

  if (error) {
    console.error("[achievements-repository] getUserAchievements:", error)
    return []
  }

  const rows = (data ?? []) as unknown as Array<{
    awarded_at: string
    achievements: AchievementRow | AchievementRow[] | null
  }>

  return rows.flatMap((r) => {
    const achievement = Array.isArray(r.achievements) ? r.achievements[0] : r.achievements
    if (!achievement) return []
    return [{ ...achievement, awarded_at: r.awarded_at }]
  })
}

/**
 * Confere se `count` (contagem já atualizada de posts/comentários/
 * seguidores) destrava algum nível novo da trilha, e credita o que faltar.
 * Best-effort: erro aqui não deve derrubar a ação principal (criar post,
 * comentar, seguir).
 */
export async function checkTrackAchievements(
  userId: string,
  track: AchievementTrack,
  count: number
): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("check_and_award_track_achievements", {
    p_user_id: userId,
    p_track: track,
    p_count: count,
  })
  if (error) {
    console.error("[achievements-repository] checkTrackAchievements:", error)
  }
}

export type DailyMissionKind = "post" | "aura" | "comment"

/**
 * Marca uma das 3 missões diárias como cumprida hoje (UTC). Credita +5 na
 * primeira vez que a missão específica vira `true` no dia, e, ao completar
 * as 3, +10 de bônus e avança a ofensiva — tudo dentro de
 * `complete_daily_mission`. Best-effort, mesma postura de
 * `creditForumPostCreationAura`.
 */
export async function completeDailyMission(userId: string, mission: DailyMissionKind): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("complete_daily_mission", {
    p_user_id: userId,
    p_mission: mission,
  })
  if (error) {
    console.error("[achievements-repository] completeDailyMission:", error)
  }
}

/** Estado das 3 missões diárias de hoje (UTC) para o dono do perfil. */
export async function getDailyMissionsToday(userId: string): Promise<DailyMissionsState> {
  const db = createSupabaseAdminClient()
  const today = new Date().toISOString().slice(0, 10)

  const { data, error } = await db
    .from("daily_missions")
    .select("created_post, wrote_comment, gave_aura, bonus_claimed")
    .eq("user_id", userId)
    .eq("mission_date", today)
    .maybeSingle()

  if (error) {
    console.error("[achievements-repository] getDailyMissionsToday:", error)
    return EMPTY_DAILY_MISSIONS
  }
  return data ?? EMPTY_DAILY_MISSIONS
}

/**
 * Ofensiva atual de um usuário. `current_streak` só é válido enquanto
 * `last_completed_date` for hoje ou ontem (UTC) — mais antigo que isso
 * significa que um dia foi perdido sem completar as 3 missões, e a ofensiva
 * é tratada como zerada aqui na leitura, sem depender de nenhum job noturno
 * para "resetar" a linha no banco.
 */
export async function getUserStreak(userId: string): Promise<UserStreak> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_streaks")
    .select("current_streak, longest_streak, last_completed_date")
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[achievements-repository] getUserStreak:", error)
    return { current: 0, longest: 0 }
  }
  if (!data) return { current: 0, longest: 0 }

  const current = isStreakActive(data.last_completed_date) ? data.current_streak : 0
  return { current, longest: data.longest_streak }
}

/** Mesma regra de expiração de `getUserStreak`, em lote — usado para exibir a ofensiva de vários autores (comentários, mini-perfil) sem 1 query por usuário. */
export async function getUserStreaksByUser(userIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(userIds)]
  const map: Record<string, number> = {}
  if (ids.length === 0) return map

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_streaks")
    .select("user_id, current_streak, last_completed_date")
    .in("user_id", ids)

  if (error) {
    console.error("[achievements-repository] getUserStreaksByUser:", error)
    return map
  }

  for (const row of data ?? []) {
    map[row.user_id] = isStreakActive(row.last_completed_date) ? row.current_streak : 0
  }
  return map
}

function isStreakActive(lastCompletedDate: string | null): boolean {
  if (!lastCompletedDate) return false
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return lastCompletedDate === today || lastCompletedDate === yesterday
}
