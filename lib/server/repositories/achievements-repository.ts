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

const EMPTY_STREAK: UserStreak = {
  current: 0,
  longest: 0,
  shield: null,
  frozen: false,
  frozenUntil: null,
}

type ShieldRow = { grace_days: number; consumed_at: string | null } | null

/** Escudo guardado = linha existe e `consumed_at is null`. Sem prazo. */
function shieldFromRow(row: ShieldRow): { shield: import("@/lib/achievements").StreakShield | null } {
  if (!row || row.consumed_at !== null) return { shield: null }
  return { shield: { armed: true, graceDays: row.grace_days } }
}

/**
 * Ofensiva atual de um usuário. `current_streak` só é válido enquanto
 * `last_completed_date` for hoje ou ontem (UTC) — OU enquanto um escudo de
 * "Proteção de Ofensiva" guardado estiver cobrindo o dia perdido (ver
 * `user_streak_shields` / 20261005000000_aura_streak_shield_inventory.sql).
 * Nenhum job noturno "reseta" a linha; a expiração é sempre calculada aqui
 * na leitura.
 */
export async function getUserStreak(userId: string): Promise<UserStreak> {
  const db = createSupabaseAdminClient()
  const [{ data, error }, { data: shieldData }] = await Promise.all([
    db
      .from("user_streaks")
      .select("current_streak, longest_streak, last_completed_date")
      .eq("user_id", userId)
      .maybeSingle(),
    db
      .from("user_streak_shields")
      .select("grace_days, consumed_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ])

  if (error) {
    console.error("[achievements-repository] getUserStreak:", error)
    return EMPTY_STREAK
  }

  const { shield } = shieldFromRow((shieldData as ShieldRow) ?? null)
  if (!data) return { ...EMPTY_STREAK, shield }

  const naturallyActive = isStreakActive(data.last_completed_date)
  const shieldCovers = !naturallyActive && shieldCoversGap(data.last_completed_date, shield)
  const current = naturallyActive || shieldCovers ? data.current_streak : 0
  const frozen = current > 0 && shieldCovers

  return {
    current,
    longest: data.longest_streak,
    shield,
    frozen,
    // Perdeu D+1, tem de D+2 até D+1+graceDays para resgatar.
    frozenUntil:
      frozen && shield && data.last_completed_date
        ? shiftDate(data.last_completed_date, shield.graceDays + 1)
        : null,
  }
}

/**
 * Mesma regra de expiração de `getUserStreak`, em lote — usado para exibir a
 * ofensiva de vários autores (comentários, mini-perfil). Retorna só o número
 * de dias (o visual "congelado" é detalhe do perfil completo, não da lista).
 */
export async function getUserStreaksByUser(userIds: string[]): Promise<Record<string, number>> {
  const ids = [...new Set(userIds)]
  const map: Record<string, number> = {}
  if (ids.length === 0) return map

  const db = createSupabaseAdminClient()
  const [{ data, error }, { data: shieldRows }] = await Promise.all([
    db
      .from("user_streaks")
      .select("user_id, current_streak, last_completed_date")
      .in("user_id", ids),
    db.from("user_streak_shields").select("user_id, grace_days, consumed_at").in("user_id", ids),
  ])

  if (error) {
    console.error("[achievements-repository] getUserStreaksByUser:", error)
    return map
  }

  const shieldByUser = new Map<string, ShieldRow>()
  for (const s of shieldRows ?? []) {
    shieldByUser.set(s.user_id, { grace_days: s.grace_days, consumed_at: s.consumed_at })
  }

  for (const row of data ?? []) {
    const { shield } = shieldFromRow(shieldByUser.get(row.user_id) ?? null)
    const alive =
      isStreakActive(row.last_completed_date) || shieldCoversGap(row.last_completed_date, shield)
    map[row.user_id] = alive ? row.current_streak : 0
  }
  return map
}

function isStreakActive(lastCompletedDate: string | null): boolean {
  if (!lastCompletedDate) return false
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return lastCompletedDate === today || lastCompletedDate === yesterday
}

/**
 * Espelha `streak_shield_covers_gap` do SQL
 * (20261005000000_aura_streak_shield_inventory.sql): um escudo guardado
 * salva a ofensiva se o usuário perdeu exatamente 1 dia — `lastCompletedDate`
 * é anteontem ou antes, mas não anterior a `hoje - (graceDays + 1)`, a
 * margem de atraso. "Ontem" não entra: aí a ofensiva está viva
 * naturalmente. Perdeu 2+ dias → não cobre (é um buraco só).
 */
function shieldCoversGap(
  lastCompletedDate: string | null,
  shield: import("@/lib/achievements").StreakShield | null
): boolean {
  if (!lastCompletedDate || !shield) return false
  const today = new Date().toISOString().slice(0, 10)
  const anteontem = shiftDate(today, -2)
  const floor = shiftDate(today, -(shield.graceDays + 1))
  return lastCompletedDate <= anteontem && lastCompletedDate >= floor
}

/** `YYYY-MM-DD` + N dias (N pode ser negativo), em UTC. */
function shiftDate(isoDate: string, deltaDays: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + deltaDays)
  return d.toISOString().slice(0, 10)
}
