import "server-only"

import {
  TRUST_BASE_SCORE,
  TRUST_EVENTS,
  canRedeemPhysicalItem,
  testerEligibility,
  trustLevelOf,
  type TesterEligibility,
  type TrustEventType,
  type TrustFlag,
  type TrustLevel,
  type TrustSeverity,
  type TrustStatus,
} from "@/lib/trust-factor"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório do Trust Factor.
 *
 * TODA escrita passa pelas RPCs (`apply_trust_event`, `set_trust_status`,
 * `raise_trust_flag`, `resolve_trust_flag`) — nunca um UPDATE direto em
 * `user_profiles.trust_score`. A nota é CACHE derivado de `trust_events`:
 * escrevê-la à mão a dessincroniza do extrato, e o próximo recálculo (que roda
 * todo dia) apaga a alteração sem deixar rastro de por quê.
 *
 * Ver `supabase/migrations/20261129000000_trust_factor.sql` para o modelo e
 * `lib/trust-factor.ts` para as faixas e o catálogo de eventos.
 */

export type TrustSummary = {
  score: number
  level: TrustLevel
  status: TrustStatus
  updatedAt: string | null
  /** Faixas e regras derivadas, para a tela não repetir a conta. */
  canRedeemPhysical: boolean
  tester: TesterEligibility
  /** Flags de segurança ABERTAS. Uma flag bloqueia função mesmo com nota alta. */
  flags: TrustFlag[]
}

const DEFAULT_SUMMARY: TrustSummary = {
  score: TRUST_BASE_SCORE,
  level: trustLevelOf(TRUST_BASE_SCORE),
  status: "active",
  updatedAt: null,
  canRedeemPhysical: canRedeemPhysicalItem(TRUST_BASE_SCORE, "active"),
  tester: testerEligibility(TRUST_BASE_SCORE, "active"),
  flags: [],
}

/**
 * Trust de um usuário, com as regras derivadas já resolvidas.
 *
 * Usado pela Central de Aura (gate do prêmio físico) e pelo perfil (faixa
 * pública). Duas consultas leves: a linha do perfil e as flags abertas.
 */
export async function getTrustSummary(userId: string): Promise<TrustSummary> {
  const db = createSupabaseAdminClient()

  const [{ data: profile }, { data: flagRows }] = await Promise.all([
    db
      .from("user_profiles")
      .select("trust_score, trust_level, trust_status, trust_updated_at")
      .eq("id", userId)
      .maybeSingle(),
    db.from("trust_flags").select("flag").eq("user_id", userId).is("resolved_at", null),
  ])

  if (!profile) return DEFAULT_SUMMARY

  const score = profile.trust_score ?? TRUST_BASE_SCORE
  const status = (profile.trust_status ?? "active") as TrustStatus

  return {
    score,
    level: (profile.trust_level as TrustLevel) ?? trustLevelOf(score),
    status,
    updatedAt: profile.trust_updated_at ?? null,
    canRedeemPhysical: canRedeemPhysicalItem(score, status),
    tester: testerEligibility(score, status),
    flags: (flagRows ?? []).map((row) => row.flag as TrustFlag),
  }
}

/**
 * Faixa pública de vários usuários de uma vez — para listagens (perfil,
 * diretório, fila de moderação).
 *
 * SEMPRE em lote: uma consulta por avatar é N+1 em cima da listagem do fórum,
 * o mesmo erro que `getVipFounderOwners` existe para evitar.
 */
export async function getTrustLevelsByUser(
  userIds: string[]
): Promise<Map<string, TrustLevel>> {
  const map = new Map<string, TrustLevel>()
  const ids = [...new Set(userIds.filter(Boolean))]
  if (ids.length === 0) return map

  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("id, trust_level, trust_score")
    .in("id", ids)

  for (const row of data ?? []) {
    map.set(row.id, (row.trust_level as TrustLevel) ?? trustLevelOf(row.trust_score ?? TRUST_BASE_SCORE))
  }
  return map
}

export type ApplyTrustEventInput = {
  userId: string
  type: TrustEventType
  /** Sobrescreve o impacto do catálogo — usado quando o evento tem faixa (ex: fraude -20 a -40). */
  points?: number
  reason?: string | null
  /** Sem chave, o evento pode entrar mais de uma vez (ajuste manual repetido é legítimo). */
  dedupeKey?: string | null
  actorId?: string | null
  metadata?: Record<string, unknown>
}

/**
 * Registra um evento de confiança e devolve a nota recalculada.
 *
 * O `points`/`severity`/`source` saem do catálogo em `lib/trust-factor.ts`
 * quando não vêm no input — é o que impede cada chamada nova de inventar um
 * peso próprio e fazer a mesma infração valer coisas diferentes em telas
 * diferentes.
 *
 * O teto de +3/dia para ganho positivo é aplicado NO BANCO, não aqui: rota,
 * trigger e cron chamam caminhos distintos, e um teto em TS só valeria para o
 * caminho que passou por este arquivo.
 */
export async function applyTrustEvent(input: ApplyTrustEventInput): Promise<number | null> {
  const definition = TRUST_EVENTS[input.type]
  const db = createSupabaseAdminClient()

  const points = input.points ?? definition.points
  // Severidade acompanha o SINAL do impacto: um "ajuste manual" positivo não
  // pode entrar como penalidade leve (que decairia e devolveria a nota
  // sozinha depois de 30 dias).
  const severity: TrustSeverity = points > 0 ? "positive" : definition.severity

  const { data, error } = await db.rpc("apply_trust_event", {
    p_user_id: input.userId,
    p_event_type: input.type,
    p_points: points,
    p_severity: severity,
    p_reason: input.reason ?? definition.label,
    p_source: definition.source,
    p_dedupe_key: input.dedupeKey ?? null,
    p_actor_id: input.actorId ?? null,
    p_metadata: (input.metadata ?? {}) as never,
  })

  if (error) return null
  return (data as number | null) ?? null
}

export async function setTrustStatus(
  userId: string,
  status: TrustStatus,
  options: { reason?: string | null; actorId?: string | null } = {}
): Promise<number | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("set_trust_status", {
    p_user_id: userId,
    p_status: status,
    p_reason: options.reason ?? null,
    p_actor_id: options.actorId ?? null,
  })
  if (error) return null
  return (data as number | null) ?? null
}

export async function raiseTrustFlag(
  userId: string,
  flag: TrustFlag,
  options: { reason?: string | null; actorId?: string | null } = {}
): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("raise_trust_flag", {
    p_user_id: userId,
    p_flag: flag,
    p_reason: options.reason ?? null,
    p_raised_by: options.actorId ?? null,
    p_metadata: {} as never,
  })
  return !error
}

export async function resolveTrustFlag(
  flagId: string,
  options: { actorId?: string | null; resolution?: string | null } = {}
): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { error } = await db.rpc("resolve_trust_flag", {
    p_flag_id: flagId,
    p_resolved_by: options.actorId ?? null,
    p_resolution: options.resolution ?? null,
  })
  return !error
}

export type TrustEventRow = {
  id: string
  eventType: string
  points: number
  severity: TrustSeverity
  reason: string | null
  source: string
  createdAt: string
  actorName: string | null
}

/**
 * Extrato de uma conta, mais recente primeiro — para o painel administrativo.
 *
 * O nome de quem aplicou vem numa segunda consulta EM LOTE, não por embed:
 * `lib/database.types.ts` é mantido à mão e não declara `Relationships`, então
 * o select aninhado não tipa. Buscar os atores distintos de uma vez também
 * evita o N+1 que um embed por linha esconderia.
 */
export async function getTrustEvents(
  userId: string,
  options: { limit?: number } = {}
): Promise<TrustEventRow[]> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("trust_events")
    .select("id, event_type, points, severity, reason, source, created_at, actor_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50)

  const rows = data ?? []
  const actorIds = [...new Set(rows.map((row) => row.actor_id).filter((id): id is string => Boolean(id)))]

  const actorNames = new Map<string, string | null>()
  if (actorIds.length > 0) {
    const { data: actors } = await db
      .from("user_profiles")
      .select("id, display_name")
      .in("id", actorIds)
    for (const actor of actors ?? []) {
      actorNames.set(actor.id, actor.display_name)
    }
  }

  return rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    points: row.points,
    severity: row.severity as TrustSeverity,
    reason: row.reason,
    source: row.source,
    createdAt: row.created_at,
    actorName: row.actor_id ? (actorNames.get(row.actor_id) ?? null) : null,
  }))
}

export type TrustFlagRow = {
  id: string
  userId: string
  flag: TrustFlag
  reason: string | null
  raisedAt: string
  resolvedAt: string | null
  resolution: string | null
  userName: string | null
  userSlug: string | null
  userAvatarUrl: string | null
}

/**
 * Fila de flags do painel. `onlyOpen` por padrão: o trabalho da moderação é a
 * pilha aberta; o histórico resolvido é consulta pontual.
 */
export async function listTrustFlags(
  options: { onlyOpen?: boolean; limit?: number } = {}
): Promise<TrustFlagRow[]> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("trust_flags")
    .select("id, user_id, flag, reason, raised_at, resolved_at, resolution")
    .order("raised_at", { ascending: false })
    .limit(options.limit ?? 100)

  if (options.onlyOpen !== false) {
    query = query.is("resolved_at", null)
  }

  const { data } = await query
  const rows = data ?? []

  // Identidade de quem foi sinalizado, EM LOTE — a fila desenha um avatar por
  // linha, e uma consulta por avatar seria N+1 em cima da listagem inteira.
  const userIds = [...new Set(rows.map((row) => row.user_id))]
  const profiles = new Map<
    string,
    { display_name: string | null; display_slug: string | null; avatar_url: string | null }
  >()

  if (userIds.length > 0) {
    const { data: users } = await db
      .from("user_profiles")
      .select("id, display_name, display_slug, avatar_url")
      .in("id", userIds)
    for (const user of users ?? []) {
      profiles.set(user.id, {
        display_name: user.display_name,
        display_slug: user.display_slug,
        avatar_url: user.avatar_url,
      })
    }
  }

  return rows.map((row) => {
    const user = profiles.get(row.user_id)
    return {
      id: row.id,
      userId: row.user_id,
      flag: row.flag as TrustFlag,
      reason: row.reason,
      raisedAt: row.raised_at,
      resolvedAt: row.resolved_at,
      resolution: row.resolution,
      userName: user?.display_name ?? null,
      userSlug: user?.display_slug ?? null,
      userAvatarUrl: user?.avatar_url ?? null,
    }
  })
}

/**
 * A rotina diária (recuperação, maturidade, expiração de penalidades e
 * padrões suspeitos). Chamada pelo cron — ver `/api/cron/trust-daily`.
 */
export async function runTrustDailyJob(): Promise<{ recalculated: number; flagged: number }> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("trust_daily_job")

  if (error || !data) return { recalculated: 0, flagged: 0 }
  const result = data as { recalculated?: number; flagged?: number }
  return {
    recalculated: result.recalculated ?? 0,
    flagged: result.flagged ?? 0,
  }
}
