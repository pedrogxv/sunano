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

function todayIso() {
  return new Date().toISOString().slice(0, 10)
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
  month: number
}

/**
 * Estatísticas para o dashboard: visitantes de hoje (total, únicos e
 * recorrentes) e visitantes distintos no mês corrente.
 *
 * "Único hoje" = hash sem nenhuma visita registrada antes de hoje.
 * "Recorrente hoje" = hash que já tinha visita em algum dia anterior.
 */
export async function getVisitStats(): Promise<VisitStats> {
  const db = createSupabaseAdminClient()
  const today = todayIso()
  const monthStart = `${today.slice(0, 7)}-01`

  const [{ data: todayRows, error: todayError }, { count: monthCount, error: monthError }] = await Promise.all([
    db.from("site_visits").select("visitor_hash").eq("visited_date", today),
    db
      .from("site_visits")
      .select("visitor_hash", { count: "exact", head: true })
      .gte("visited_date", monthStart)
      .lte("visited_date", today),
  ])

  if (todayError) {
    console.error("[visits-repository] getVisitStats (today):", todayError)
    throw todayError
  }
  if (monthError) {
    console.error("[visits-repository] getVisitStats (month):", monthError)
    throw monthError
  }

  const todayHashes = (todayRows ?? []).map((row) => row.visitor_hash as string)

  if (todayHashes.length === 0) {
    return { today: 0, uniqueToday: 0, returningToday: 0, month: monthCount ?? 0 }
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
    month: monthCount ?? 0,
  }
}
