import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { addDaysIso, startOfDayUtc, todayIso } from "@/lib/server/time"

/**
 * Repositório de "Receita" e "Produtos mais vendidos" do dashboard admin —
 * únicos cards do dashboard restritos a webmaster (dado financeiro), gate
 * feito em app/api/admin/dashboard/route.ts, não aqui.
 *
 * Agrega via RPC (get_order_revenue_between / get_top_selling_products, ver
 * 20260921000021_store_revenue_top_products_rpcs.sql) em vez de trazer
 * `store_orders` inteiro pro Node — mesmo motivo de countOrdersByStatus em
 * orders-repository.ts.
 */

export type RevenuePoint = { key: string; totalCents: number }

export type RevenueSeries = {
  /** Hoje, em blocos de 3h (chave = hora inicial do bloco: "0", "3" ... "21"). */
  day: RevenuePoint[]
  /** Últimos 7 dias, um ponto por dia (chave = data ISO, o último é hoje). */
  week: RevenuePoint[]
  /** Mês corrente, agrupado por semana (chave = "week-1", "week-2", ...). */
  month: RevenuePoint[]
  /** Ano corrente, agrupado por mês (chave = "YYYY-MM"). */
  year: RevenuePoint[]
}

const HOUR_BUCKETS = Array.from({ length: 8 }, (_, i) => i * 3)

type Db = ReturnType<typeof createSupabaseAdminClient>

async function revenueBetween(db: Db, from: Date, to: Date): Promise<number> {
  const { data, error } = await db.rpc("get_order_revenue_between", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
  })
  if (error) {
    console.error("[dashboard-revenue-repository] get_order_revenue_between:", error)
    return 0
  }
  return Number(data ?? 0)
}

function daysInMonth(yearMonth: string): number {
  const [year, month] = yearMonth.split("-").map(Number)
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

async function getDaySeries(db: Db, today: string): Promise<RevenuePoint[]> {
  const dayStartUtc = startOfDayUtc(today).getTime()
  const blocks = HOUR_BUCKETS.map((h) => {
    const from = new Date(dayStartUtc + h * 3600_000)
    const to = new Date(dayStartUtc + (h + 3) * 3600_000)
    return { key: String(h), from, to }
  })

  const totals = await Promise.all(blocks.map((b) => revenueBetween(db, b.from, b.to)))
  return blocks.map((b, i) => ({ key: b.key, totalCents: totals[i] }))
}

async function getWeekSeries(db: Db, today: string): Promise<RevenuePoint[]> {
  const days = Array.from({ length: 7 }, (_, i) => addDaysIso(today, i - 6))
  const totals = await Promise.all(days.map((d) => revenueBetween(db, startOfDayUtc(d), startOfDayUtc(addDaysIso(d, 1)))))
  return days.map((d, i) => ({ key: d, totalCents: totals[i] }))
}

// Semanas do mês corrente = blocos de 7 dias a partir do dia 1, só até a
// semana que já começou (sem semanas futuras) — mesmo recorte de
// getVisitSeries (visits-repository.ts).
async function getMonthSeries(db: Db, today: string): Promise<RevenuePoint[]> {
  const monthKey = today.slice(0, 7)
  const dayOfMonth = Number(today.slice(8, 10))
  const totalDays = daysInMonth(monthKey)
  const numWeeks = Math.ceil(totalDays / 7)

  const weeks: { key: string; from: Date; to: Date }[] = []
  for (let w = 1; w <= numWeeks; w++) {
    const startDay = (w - 1) * 7 + 1
    if (startDay > dayOfMonth) break
    const endDay = Math.min(w * 7, dayOfMonth)
    weeks.push({
      key: `week-${w}`,
      from: startOfDayUtc(`${monthKey}-${String(startDay).padStart(2, "0")}`),
      to: startOfDayUtc(addDaysIso(`${monthKey}-${String(endDay).padStart(2, "0")}`, 1)),
    })
  }

  const totals = await Promise.all(weeks.map((w) => revenueBetween(db, w.from, w.to)))
  return weeks.map((w, i) => ({ key: w.key, totalCents: totals[i] }))
}

// Meses do ano corrente, de janeiro até o mês atual (o mês atual vai só até hoje).
async function getYearSeries(db: Db, today: string): Promise<RevenuePoint[]> {
  const year = today.slice(0, 4)
  const currentMonth = Number(today.slice(5, 7))

  const months: { key: string; from: Date; to: Date }[] = []
  for (let m = 1; m <= currentMonth; m++) {
    const monthKey = `${year}-${String(m).padStart(2, "0")}`
    const lastDay = m === currentMonth ? Number(today.slice(8, 10)) : daysInMonth(monthKey)
    months.push({
      key: monthKey,
      from: startOfDayUtc(`${monthKey}-01`),
      to: startOfDayUtc(addDaysIso(`${monthKey}-${String(lastDay).padStart(2, "0")}`, 1)),
    })
  }

  const totals = await Promise.all(months.map((m) => revenueBetween(db, m.from, m.to)))
  return months.map((m, i) => ({ key: m.key, totalCents: totals[i] }))
}

/**
 * Séries de receita pro card "Receita" do dashboard admin — mesmo formato e
 * mesmos quatro recortes de getVisitSeries (visits-repository.ts): hoje por
 * bloco de 3h, últimos 7 dias, mês corrente por semana e ano corrente por mês.
 */
export async function getRevenueSeries(): Promise<RevenueSeries> {
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

export type TopProductPoint = {
  productId: string
  name: string
  unitsSold: number
  revenueCents: number
}

export type TopProductsSeries = {
  /** Hoje. */
  today: TopProductPoint[]
  /** Últimos 7 dias. */
  week: TopProductPoint[]
}

async function topProductsBetween(db: Db, from: Date, to: Date): Promise<TopProductPoint[]> {
  const { data, error } = await db.rpc("get_top_selling_products", {
    p_from: from.toISOString(),
    p_to: to.toISOString(),
    p_limit: 5,
  })
  if (error) {
    console.error("[dashboard-revenue-repository] get_top_selling_products:", error)
    return []
  }
  return ((data ?? []) as { product_id: string; product_name: string | null; units_sold: number; revenue_cents: number }[]).map(
    (row) => ({
      productId: row.product_id,
      name: row.product_name ?? row.product_id,
      unitsSold: Number(row.units_sold),
      revenueCents: Number(row.revenue_cents),
    })
  )
}

/** Top 5 produtos mais vendidos pro card "Produtos mais vendidos", hoje e nos últimos 7 dias. */
export async function getTopSellingProducts(): Promise<TopProductsSeries> {
  const db = createSupabaseAdminClient()
  const today = todayIso()
  const todayStart = startOfDayUtc(today)
  const weekStart = startOfDayUtc(addDaysIso(today, -6))
  const now = new Date()

  const [todayList, weekList] = await Promise.all([
    topProductsBetween(db, todayStart, now),
    topProductsBetween(db, weekStart, now),
  ])

  return { today: todayList, week: weekList }
}
