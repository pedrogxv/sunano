import "server-only"

import crypto from "node:crypto"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório de contagem de visitantes — acesso à tabela `site_visits`.
 *
 * Não usamos nenhum serviço de analytics de terceiros (ver /privacidade,
 * seção 6). O "visitante" é um hash SHA-256 de IP + User-Agent + segredo do
 * servidor: irreversível, sem cookie novo, sem PII armazenada. O segredo é
 * fixo (não gira por dia) — é o que permite comparar um hash contra dias
 * anteriores e assim distinguir "único" de "recorrente".
 */

function getVisitorSalt() {
  const salt = process.env.VISITOR_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!salt) {
    throw new Error("VISITOR_HASH_SALT (ou SUPABASE_SERVICE_ROLE_KEY) não configurado.")
  }
  return salt
}

/** Hash irreversível de IP + User-Agent — identifica o visitante sem guardar dado pessoal. */
export function hashVisitor(ip: string, userAgent: string): string {
  return crypto.createHash("sha256").update(`${getVisitorSalt()}:${ip}:${userAgent}`).digest("hex")
}

// O site é 100% BR — "hoje" precisa fechar à meia-noite em Brasília, não em
// UTC. `toISOString()` fecharia o dia às 21h de Brasília (meia-noite UTC),
// adiantando o reset em 3h e fazendo o dia parecer "não resetar": o dashboard
// ainda mostra o dia anterior por 3h depois da meia-noite local, e o contador
// de "hoje" carrega 3h do dia anterior por baixo do capô.
const SITE_TIMEZONE = "America/Sao_Paulo"

function isoDateInTimeZone(date: Date, timeZone: string): string {
  // en-CA formata como YYYY-MM-DD, o mesmo formato do tipo `date` do Postgres.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date)
}

function todayIso() {
  return isoDateInTimeZone(new Date(), SITE_TIMEZONE)
}

// Desloca uma data ISO (YYYY-MM-DD) em N dias. Ancora em meio-dia UTC antes de
// formatar de volta no fuso do site: como o Brasil não observa mais horário
// de verão (fixo em UTC-3), meio-dia UTC nunca cruza a virada do dia local,
// então a data resultante é sempre exata.
function addDaysIso(dateIso: string, days: number): string {
  const [year, month, day] = dateIso.split("-").map(Number)
  return isoDateInTimeZone(new Date(Date.UTC(year, month - 1, day + days, 12)), SITE_TIMEZONE)
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

export type VisitStats = {
  today: number
  uniqueToday: number
  returningToday: number
  yesterday: number
  week: number
  weekPrevious: number
  month: number
  monthPrevious: number
  total: number
}

/**
 * Estatísticas para o dashboard: visitantes de hoje (total, únicos e
 * recorrentes), mais os números usados pelo card de Visitantes com abas
 * Dia/Semana/Mês/Total (cada aba com seu período anterior equivalente, pra
 * variação percentual, e o par hoje/ontem pra barra comparativa).
 *
 * "Único hoje" = hash sem nenhuma visita registrada antes de hoje.
 * "Recorrente hoje" = hash que já tinha visita em algum dia anterior.
 *
 * Semana = 7 dias corridos terminando hoje (não semana ISO); a "anterior" são
 * os 7 dias imediatamente antes. Mês = mês corrente até hoje; o "anterior" é
 * o mesmo intervalo de dias (1..dia-do-mês) do mês passado, pra comparar
 * períodos de mesmo tamanho (não o mês passado inteiro). Total é cumulativo
 * desde que o rastreamento existe, sem período anterior — cada contagem aqui
 * é linha por (visitante, dia), não visitante distinto no período (mesma
 * definição que "month" já usava).
 */
export async function getVisitStats(): Promise<VisitStats> {
  const db = createSupabaseAdminClient()
  const today = todayIso()
  const yesterday = addDaysIso(today, -1)
  const weekStart = addDaysIso(today, -6)
  const weekPreviousStart = addDaysIso(today, -13)
  const weekPreviousEnd = addDaysIso(today, -7)
  const monthStart = `${today.slice(0, 7)}-01`
  const dayOfMonth = Number(today.slice(8, 10))
  const monthPreviousLastDay = addDaysIso(monthStart, -1)
  const monthPreviousStart = `${monthPreviousLastDay.slice(0, 7)}-01`
  const monthPreviousEndDay = Math.min(dayOfMonth, Number(monthPreviousLastDay.slice(8, 10)))
  const monthPreviousEnd = `${monthPreviousStart.slice(0, 7)}-${String(monthPreviousEndDay).padStart(2, "0")}`

  const rangeCount = (from: string, to: string) =>
    db.from("site_visits").select("visitor_hash", { count: "exact", head: true }).gte("visited_date", from).lte("visited_date", to)

  const [
    { data: todayRows, error: todayError },
    { count: monthCount, error: monthError },
    { count: yesterdayCount, error: yesterdayError },
    { count: weekCount, error: weekError },
    { count: weekPreviousCount, error: weekPreviousError },
    { count: monthPreviousCount, error: monthPreviousError },
    { count: totalCount, error: totalError },
  ] = await Promise.all([
    db.from("site_visits").select("visitor_hash").eq("visited_date", today),
    rangeCount(monthStart, today),
    rangeCount(yesterday, yesterday),
    rangeCount(weekStart, today),
    rangeCount(weekPreviousStart, weekPreviousEnd),
    rangeCount(monthPreviousStart, monthPreviousEnd),
    db.from("site_visits").select("visitor_hash", { count: "exact", head: true }),
  ])

  for (const [label, error] of [
    ["today", todayError],
    ["month", monthError],
    ["yesterday", yesterdayError],
    ["week", weekError],
    ["weekPrevious", weekPreviousError],
    ["monthPrevious", monthPreviousError],
    ["total", totalError],
  ] as const) {
    if (error) {
      console.error(`[visits-repository] getVisitStats (${label}):`, error)
      throw error
    }
  }

  const periodCounts = {
    yesterday: yesterdayCount ?? 0,
    week: weekCount ?? 0,
    weekPrevious: weekPreviousCount ?? 0,
    month: monthCount ?? 0,
    monthPrevious: monthPreviousCount ?? 0,
    total: totalCount ?? 0,
  }

  const todayHashes = (todayRows ?? []).map((row) => row.visitor_hash as string)

  if (todayHashes.length === 0) {
    return { today: 0, uniqueToday: 0, returningToday: 0, ...periodCounts }
  }

  // Hashes de hoje que já tinham visita em algum dia anterior — cada um
  // conta uma vez (Set), não por quantos dias passados apareceu.
  //
  // O `.in()` vai em lotes: em dias de tráfego alto, `todayHashes` inteiro
  // não cabe numa única URL de query (limite do Supabase/proxy), o que
  // derrubava essa query e, com ela, a seção inteira de visitantes no
  // dashboard (o erro é engolido por app/api/admin/dashboard/route.ts).
  const HASH_CHUNK_SIZE = 150
  const chunks: string[][] = []
  for (let i = 0; i < todayHashes.length; i += HASH_CHUNK_SIZE) {
    chunks.push(todayHashes.slice(i, i + HASH_CHUNK_SIZE))
  }

  const chunkResults = await Promise.all(
    chunks.map((chunk) => db.from("site_visits").select("visitor_hash").lt("visited_date", today).in("visitor_hash", chunk))
  )

  const returningHashes = new Set<string>()
  for (const { data, error } of chunkResults) {
    if (error) {
      console.error("[visits-repository] getVisitStats (before):", error)
      throw error
    }
    for (const row of data ?? []) returningHashes.add(row.visitor_hash as string)
  }

  return {
    today: todayHashes.length,
    uniqueToday: todayHashes.length - returningHashes.size,
    returningToday: returningHashes.size,
    ...periodCounts,
  }
}
