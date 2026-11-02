import "server-only"

import { cache } from "react"

import type { AdminRole } from "@/lib/admin-permissions"
import {
  ANONYMOUS_FLAG_CONTEXT,
  FEATURE_FLAG_KEYS,
  evaluateFeatureFlag,
  type FeatureFlagContext,
  type FeatureFlagKey,
} from "@/lib/feature-flags"
import { getFeatureFlagConfigs } from "@/lib/server/repositories/feature-flags-repository"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Avaliação das feature flags para uma requisição. É AQUI que a decisão vale:
 * a seção escondida no cliente é só conforto visual, toda rota da feature
 * chama `isFeatureEnabled` antes de responder.
 */

/** Cargo no painel, por request (layout + rota no mesmo render dividem a consulta). */
const getFlagRole = cache(async (userId: string): Promise<AdminRole | null> => {
  const db = createSupabaseAdminClient()
  const { data } = await db.from("admin_profiles").select("role").eq("id", userId).maybeSingle()
  return (data?.role as AdminRole | undefined) ?? null
})

export async function getFeatureFlagContext(userId: string | null): Promise<FeatureFlagContext> {
  if (!userId) return ANONYMOUS_FLAG_CONTEXT
  return { userId, role: await getFlagRole(userId).catch(() => null) }
}

export async function isFeatureEnabled(key: FeatureFlagKey, context: FeatureFlagContext): Promise<boolean> {
  const configs = await getFeatureFlagConfigs()
  return evaluateFeatureFlag(key, configs[key], context)
}

/**
 * Só as chaves LIGADAS para este contexto. É o que vai ao cliente no payload
 * de `/api/auth/me`: uma flag desligada nem é citada, então o nome de uma
 * feature não lançada não vaza para quem não a vê.
 */
export async function getEnabledFeatureFlags(context: FeatureFlagContext): Promise<FeatureFlagKey[]> {
  const configs = await getFeatureFlagConfigs()
  return FEATURE_FLAG_KEYS.filter((key) => evaluateFeatureFlag(key, configs[key], context))
}
