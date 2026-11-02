import "server-only"

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"

import {
  FEATURE_FLAG_FALLBACK,
  FEATURE_FLAG_KEYS,
  type FeatureFlagConfig,
  type FeatureFlagKey,
  type FeatureFlagMode,
} from "@/lib/feature-flags"
import { onlyUuids } from "@/lib/server/repositories/_shared"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Estado das feature flags (`feature_flags`) e a trilha de auditoria
 * (`feature_flag_events`, gravada por trigger). A regra de avaliação é pura e
 * mora em `lib/feature-flags.ts`; quem avalia para uma requisição é
 * `lib/server/feature-flags.ts`.
 */

/**
 * As escritas vêm de Route Handler, onde `updateTag` não funciona, daí
 * `revalidateTag(..., { expire: 0 })` (mesmo motivo de events-repository).
 */
export const FEATURE_FLAGS_TAG = "feature-flags"

type FlagRow = {
  key: string
  mode: FeatureFlagMode
  rollout_percent: number
  allow_user_ids: string[] | null
  note: string | null
  updated_at: string
  updated_by: string | null
}

function toConfig(row: FlagRow): FeatureFlagConfig {
  return {
    mode: row.mode,
    rolloutPercent: row.rollout_percent,
    allowUserIds: row.allow_user_ids ?? [],
    note: row.note,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
  }
}

async function fetchFeatureFlagConfigs(): Promise<Record<FeatureFlagKey, FeatureFlagConfig>> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("feature_flags")
    .select("key, mode, rollout_percent, allow_user_ids, note, updated_at, updated_by")
    .in("key", FEATURE_FLAG_KEYS)
  if (error) throw error

  const byKey = new Map((data ?? []).map((row) => [row.key, toConfig(row as FlagRow)]))
  return Object.fromEntries(
    FEATURE_FLAG_KEYS.map((key) => [key, byKey.get(key) ?? FEATURE_FLAG_FALLBACK])
  ) as Record<FeatureFlagKey, FeatureFlagConfig>
}

/**
 * Cache de 60s compartilhado por todas as requisições: a flag é lida em toda
 * chamada de `/api/auth/me`, e uma consulta por pageview seria o custo de
 * banco mais alto do site por uma tabela de uma linha. Salvar no painel
 * invalida o cache na hora; os 60s são só a rede de segurança.
 */
const getCachedFeatureFlagConfigs = unstable_cache(
  fetchFeatureFlagConfigs,
  ["feature-flags-repository:configs"],
  { revalidate: 60, tags: [FEATURE_FLAGS_TAG] }
)

/**
 * Configuração de todas as flags registradas. Se o banco falhar, devolve o
 * fallback ("off") de todas: na dúvida, a feature em construção some — nunca
 * aparece para o público.
 */
export async function getFeatureFlagConfigs(): Promise<Record<FeatureFlagKey, FeatureFlagConfig>> {
  try {
    return await getCachedFeatureFlagConfigs()
  } catch (error) {
    console.error("[feature-flags] leitura falhou, usando fallback off:", error)
    return Object.fromEntries(
      FEATURE_FLAG_KEYS.map((key) => [key, FEATURE_FLAG_FALLBACK])
    ) as Record<FeatureFlagKey, FeatureFlagConfig>
  }
}

export type FeatureFlagEvent = {
  id: number
  flagKey: string
  actorName: string | null
  before: Partial<{ mode: FeatureFlagMode; rollout_percent: number; allow_user_ids: string[]; note: string | null }> | null
  after: Partial<{ mode: FeatureFlagMode; rollout_percent: number; allow_user_ids: string[]; note: string | null }>
  createdAt: string
}

export type AllowlistUser = { id: string; name: string }

export type AdminFeatureFlagsData = {
  configs: Record<FeatureFlagKey, FeatureFlagConfig>
  events: FeatureFlagEvent[]
  /** Nome de cada id que aparece em allowlist ou como autor de mudança. */
  users: Record<string, AllowlistUser>
}

/** Painel: estado SEM cache (o WEB MASTER precisa ver o que acabou de salvar) + histórico recente. */
export async function getAdminFeatureFlagsData(): Promise<AdminFeatureFlagsData> {
  const db = createSupabaseAdminClient()
  const [configs, events] = await Promise.all([
    fetchFeatureFlagConfigs(),
    db
      .from("feature_flag_events")
      .select("id, flag_key, actor_id, before, after, created_at")
      .in("flag_key", FEATURE_FLAG_KEYS)
      .order("created_at", { ascending: false })
      .limit(60),
  ])
  if (events.error) throw events.error

  const ids = new Set<string>()
  for (const config of Object.values(configs)) {
    for (const id of config.allowUserIds) ids.add(id)
    if (config.updatedBy) ids.add(config.updatedBy)
  }
  for (const event of events.data ?? []) if (event.actor_id) ids.add(event.actor_id)

  const users = await getUserNames([...ids])

  return {
    configs,
    users,
    events: (events.data ?? []).map((event) => ({
      id: event.id,
      flagKey: event.flag_key,
      actorName: event.actor_id ? users[event.actor_id]?.name ?? null : null,
      before: event.before as FeatureFlagEvent["before"],
      after: event.after as FeatureFlagEvent["after"],
      createdAt: event.created_at,
    })),
  }
}

/** Nome de exibição: perfil do painel primeiro (é como a equipe se reconhece), senão o perfil público. */
async function getUserNames(rawIds: string[]): Promise<Record<string, AllowlistUser>> {
  const ids = onlyUuids(rawIds)
  if (ids.length === 0) return {}
  const db = createSupabaseAdminClient()
  const [admins, profiles] = await Promise.all([
    db.from("admin_profiles").select("id, display_name").in("id", ids),
    db.from("user_profiles").select("id, display_name").in("id", ids),
  ])

  const result: Record<string, AllowlistUser> = {}
  for (const row of (profiles.data ?? []) as { id: string; display_name: string | null }[]) {
    result[row.id] = { id: row.id, name: row.display_name || "Sem nome" }
  }
  for (const row of (admins.data ?? []) as { id: string; display_name: string | null }[]) {
    if (row.display_name) result[row.id] = { id: row.id, name: row.display_name }
  }
  for (const id of ids) result[id] ??= { id, name: "Conta removida" }
  return result
}

export type FeatureFlagUpdate = {
  mode: FeatureFlagMode
  rolloutPercent: number
  allowUserIds: string[]
  note: string | null
}

/**
 * Grava o ESTADO pedido (upsert). O histórico sai do trigger, com `updated_by`
 * como autor — por isso ele é obrigatório aqui.
 */
export async function saveFeatureFlag(key: FeatureFlagKey, update: FeatureFlagUpdate, actorId: string) {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("feature_flags").upsert(
    {
      key,
      mode: update.mode,
      rollout_percent: update.rolloutPercent,
      allow_user_ids: onlyUuids(update.allowUserIds, 200),
      note: update.note,
      updated_at: new Date().toISOString(),
      updated_by: actorId,
    },
    { onConflict: "key" }
  )
  if (error) throw error

  revalidateTag(FEATURE_FLAGS_TAG, { expire: 0 })
  // A Home é ISR: com a flag em "Todos" a seção sai no HTML cacheado, então a
  // mudança precisa refazer a página, senão leva até 5 min para aparecer/sumir.
  revalidatePath("/")
}
