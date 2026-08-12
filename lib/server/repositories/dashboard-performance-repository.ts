import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { addDaysIso, hourInTimeZone, isoDateInTimeZone, startOfDayUtc, todayIso } from "@/lib/server/time"

// `key` é o dado cru (hora do bloco / data ISO); o front formata o label
// exibido de acordo com o idioma ativo (o site é bilíngue pt-BR/en-US), em
// vez de vir pré-formatado em português daqui do servidor.
export type PerformancePoint = { key: string; interactions: number; aura: number }

export type PerformanceSeries = {
  /** Hoje, em blocos de 3h (chave = hora inicial do bloco: "0", "3" ... "21"). */
  hourly: PerformancePoint[]
  /** Últimos 7 dias, um ponto por dia (chave = data ISO, o último é hoje). */
  daily: PerformancePoint[]
}

const HOUR_BUCKETS = Array.from({ length: 8 }, (_, i) => i * 3)

type Db = ReturnType<typeof createSupabaseAdminClient>

async function fetchCreatedAt(db: Db, table: string, since: Date): Promise<string[]> {
  const { data, error } = await db.from(table).select("created_at").gte("created_at", since.toISOString())
  if (error) {
    console.error(`[dashboard-performance] ${table}:`, error)
    return []
  }
  return (data ?? []).map((row) => (row as { created_at: string }).created_at)
}

async function fetchAuraDelta(db: Db, since: Date): Promise<{ created_at: string; delta: number }[]> {
  const { data, error } = await db
    .from("aura_ledger")
    .select("created_at, delta")
    .gt("delta", 0)
    .gte("created_at", since.toISOString())
  if (error) {
    console.error("[dashboard-performance] aura_ledger:", error)
    return []
  }
  return (data ?? []) as { created_at: string; delta: number }[]
}

/**
 * Série de "atividade da comunidade" pro gráfico de performance do dashboard
 * admin: novos posts + comentários (fórum e blog) e aura gerada, em dois
 * recortes — hoje por bloco de 3h e últimos 7 dias por dia. Busca tudo desde
 * o início da janela de 7 dias numa passada só e distribui nos dois recortes
 * em memória, em vez de duas rodadas de queries.
 */
export async function getPerformanceSeries(): Promise<PerformanceSeries> {
  const db = createSupabaseAdminClient()
  const today = todayIso()
  const weekStart = addDaysIso(today, -6)
  const weekStartUtc = startOfDayUtc(weekStart)

  const [forumPosts, forumComments, blogComments, auraRows] = await Promise.all([
    fetchCreatedAt(db, "forum_posts", weekStartUtc),
    fetchCreatedAt(db, "forum_comments", weekStartUtc),
    fetchCreatedAt(db, "blog_comments", weekStartUtc),
    fetchAuraDelta(db, weekStartUtc),
  ])

  const interactionTimestamps = [...forumPosts, ...forumComments, ...blogComments]

  const hourly: PerformancePoint[] = HOUR_BUCKETS.map((h) => ({
    key: String(h),
    interactions: 0,
    aura: 0,
  }))
  const hourlyBucketIndex = (date: Date) => Math.min(Math.floor(hourInTimeZone(date) / 3), HOUR_BUCKETS.length - 1)

  for (const ts of interactionTimestamps) {
    const date = new Date(ts)
    if (isoDateInTimeZone(date) !== today) continue
    hourly[hourlyBucketIndex(date)].interactions += 1
  }
  for (const row of auraRows) {
    const date = new Date(row.created_at)
    if (isoDateInTimeZone(date) !== today) continue
    hourly[hourlyBucketIndex(date)].aura += row.delta
  }

  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(weekStart, i))
  const dayIndex = new Map(days.map((d, i) => [d, i]))
  const daily: PerformancePoint[] = days.map((d) => ({ key: d, interactions: 0, aura: 0 }))

  for (const ts of interactionTimestamps) {
    const idx = dayIndex.get(isoDateInTimeZone(new Date(ts)))
    if (idx !== undefined) daily[idx].interactions += 1
  }
  for (const row of auraRows) {
    const idx = dayIndex.get(isoDateInTimeZone(new Date(row.created_at)))
    if (idx !== undefined) daily[idx].aura += row.delta
  }

  return { hourly, daily }
}
