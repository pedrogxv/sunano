import "server-only"

import crypto from "node:crypto"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { addDaysIso, startOfDayUtc, todayIso } from "@/lib/server/time"

/**
 * Repositório de contagem de visitantes — acesso à tabela `site_visits`.
 *
 * Não usamos nenhum serviço de analytics de terceiros (ver /privacidade,
 * seção 6). O "visitante" é um hash SHA-256 de IP + User-Agent + segredo do
 * servidor: irreversível, sem cookie novo, sem PII armazenada. O segredo é
 * fixo (não gira por dia) — é o que permite comparar um hash contra dias
 * anteriores e assim distinguir "único" de "recorrente".
 */

/**
 * O fallback para `SUPABASE_SERVICE_ROLE_KEY` mantém o hash funcionando sem
 * configuração, mas acopla um segredo de acesso total do banco a um valor de
 * analytics — e rotacionar essa chave (o que deve ser possível a qualquer
 * momento) mudaria todo hash e zeraria o histórico de visitantes únicos, já
 * que a comparação entre dias depende do salt ser estável para sempre.
 * Por isso ele fica só para dev; em produção a env dedicada é obrigatória.
 */
function getVisitorSalt() {
  const salt = process.env.VISITOR_HASH_SALT
  if (salt) return salt

  if (process.env.NODE_ENV === "production") {
    throw new Error("VISITOR_HASH_SALT não configurado em produção.")
  }

  const fallback = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!fallback) {
    throw new Error("VISITOR_HASH_SALT (ou SUPABASE_SERVICE_ROLE_KEY) não configurado.")
  }
  return fallback
}

/** Hash irreversível de IP + User-Agent — identifica o visitante sem guardar dado pessoal. */
export function hashVisitor(ip: string, userAgent: string): string {
  return crypto.createHash("sha256").update(`${getVisitorSalt()}:${ip}:${userAgent}`).digest("hex")
}

/**
 * Registra a visita do dia para este hash. Upsert idempotente: a mesma
 * pessoa navegando várias páginas no mesmo dia grava uma linha só, então a
 * contagem é de visitantes, não de pageviews.
 */
export async function recordVisit(visitorHash: string, date: string = todayIso()): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("site_visits")
    .upsert({ visitor_hash: visitorHash, visited_date: date }, { onConflict: "visitor_hash,visited_date", ignoreDuplicates: true })

  if (error) {
    console.error("[visits-repository] recordVisit:", error)
    throw error
  }
}

export type VisitPoint = { key: string; count: number }

export type VisitSeries = {
  /** Hoje, em blocos de 3h (chave = hora inicial do bloco: "0", "3" ... "21"). */
  day: VisitPoint[]
  /** Últimos 7 dias, um ponto por dia (chave = data ISO, o último é hoje). */
  week: VisitPoint[]
  /** Mês corrente, agrupado por semana (chave = "week-1", "week-2", ...). */
  month: VisitPoint[]
  /** Ano corrente, agrupado por mês (chave = "YYYY-MM"). */
  year: VisitPoint[]
}

const HOUR_BUCKETS = Array.from({ length: 8 }, (_, i) => i * 3)

type Db = ReturnType<typeof createSupabaseAdminClient>

function rangeCount(db: Db, from: string, to: string) {
  return db.from("site_visits").select("visitor_hash", { count: "exact", head: true }).gte("visited_date", from).lte("visited_date", to)
}

function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Um dia de tráfego alto passa fácil das 1000 linhas que o PostgREST retorna
// por padrão numa query sem paginação — `.select("created_at")` truncaria a
// contagem silenciosamente. Por isso cada bloco de 3h é uma query de
// contagem (`head: true`, sem retorno de linhas), sem esse limite, no mesmo
// padrão das outras séries abaixo.
async function getDaySeries(db: Db, today: string): Promise<VisitPoint[]> {
  const dayStartUtc = startOfDayUtc(today).getTime()
  const blocks = HOUR_BUCKETS.map((h) => {
    const from = new Date(dayStartUtc + h * 3600_000)
    const to = new Date(dayStartUtc + (h + 3) * 3600_000)
    return { key: String(h), from, to }
  })

  const results = await Promise.all(
    blocks.map(({ from, to }) =>
      db
        .from("site_visits")
        .select("visitor_hash", { count: "exact", head: true })
        .eq("visited_date", today)
        .gte("created_at", from.toISOString())
        .lt("created_at", to.toISOString())
    )
  )
  for (const { error } of results) {
    if (error) {
      console.error("[visits-repository] getVisitSeries (day):", error)
      throw error
    }
  }
  return blocks.map((b, i) => ({ key: b.key, count: results[i].count ?? 0 }))
}

async function getWeekSeries(db: Db, today: string): Promise<VisitPoint[]> {
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(today, i - 6))
  const results = await Promise.all(days.map((d) => rangeCount(db, d, d)))
  for (const { error } of results) {
    if (error) {
      console.error("[visits-repository] getVisitSeries (week):", error)
      throw error
    }
  }
  return days.map((d, i) => ({ key: d, count: results[i].count ?? 0 }))
}

// Semanas do mês corrente = blocos de 7 dias a partir do dia 1, só até a
// semana que já começou (sem semanas futuras).
async function getMonthSeries(db: Db, today: string): Promise<VisitPoint[]> {
  const monthKey = today.slice(0, 7)
  const dayOfMonth = Number(today.slice(8, 10))
  const totalDays = daysInMonth(monthKey)
  const numWeeks = Math.ceil(totalDays / 7)

  const weeks: { key: string; from: string; to: string }[] = []
  for (let w = 1; w <= numWeeks; w++) {
    const startDay = (w - 1) * 7 + 1
    if (startDay > dayOfMonth) break
    const endDay = Math.min(w * 7, dayOfMonth)
    weeks.push({
      key: `week-${w}`,
      from: `${monthKey}-${String(startDay).padStart(2, "0")}`,
      to: `${monthKey}-${String(endDay).padStart(2, "0")}`,
    })
  }

  const results = await Promise.all(weeks.map((w) => rangeCount(db, w.from, w.to)))
  for (const { error } of results) {
    if (error) {
      console.error("[visits-repository] getVisitSeries (month):", error)
      throw error
    }
  }
  return weeks.map((w, i) => ({ key: w.key, count: results[i].count ?? 0 }))
}

// Meses do ano corrente, de janeiro até o mês atual (o mês atual vai só até hoje).
async function getYearSeries(db: Db, today: string): Promise<VisitPoint[]> {
  const year = today.slice(0, 4)
  const currentMonth = Number(today.slice(5, 7))

  const months: { key: string; from: string; to: string }[] = []
  for (let m = 1; m <= currentMonth; m++) {
    const monthKey = `${year}-${String(m).padStart(2, "0")}`
    const lastDay = m === currentMonth ? Number(today.slice(8, 10)) : daysInMonth(monthKey)
    months.push({
      key: monthKey,
      from: `${monthKey}-01`,
      to: `${monthKey}-${String(lastDay).padStart(2, "0")}`,
    })
  }

  const results = await Promise.all(months.map((m) => rangeCount(db, m.from, m.to)))
  for (const { error } of results) {
    if (error) {
      console.error("[visits-repository] getVisitSeries (year):", error)
      throw error
    }
  }
  return months.map((m, i) => ({ key: m.key, count: results[i].count ?? 0 }))
}

/**
 * Séries de visitantes pro card de Visitantes do dashboard admin — mesmo
 * formato do gráfico de "atividade da comunidade" (`dashboard-performance-repository.ts`),
 * com quatro recortes calculados de uma vez: hoje por bloco de 3h, últimos 7
 * dias, mês corrente por semana e ano corrente por mês.
 */
export async function getVisitSeries(): Promise<VisitSeries> {
  const db = createSupabaseAdminClient()
  const today = todayIso()

  const [day, week, month, year] = await Promise.all([
    getDaySeries(db, today),
    getWeekSeries(db, today),
    getMonthSeries(db, today),
    getYearSeries(db, today),
  ])

  return { day, week, month, year }
}
