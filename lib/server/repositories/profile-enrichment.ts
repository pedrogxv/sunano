import "server-only"

import { coerceAccountTier, type AccountTier } from "@/lib/account-tier"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

export type EnrichedProfile = {
  display_name: string | null
  avatar_url: string | null
  account_tier: AccountTier
  display_slug: string | null
}

/**
 * Perfis públicos (`user_profiles`) indexados por id — usado para enriquecer
 * autores de posts/comentários (fórum e notícias) com nome, avatar, tier e
 * slug de exibição a partir do `user_id` gravado no registro.
 */
export async function buildProfileMap(userIds: (string | null)[]): Promise<Record<string, EnrichedProfile>> {
  const map: Record<string, EnrichedProfile> = {}
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return map
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("id, display_name, avatar_url, account_tier, display_slug")
    .in("id", ids)
  for (const row of data ?? []) {
    map[row.id] = {
      display_name: row.display_name,
      avatar_url: row.avatar_url,
      account_tier: coerceAccountTier(row.account_tier),
      display_slug: row.display_slug,
    }
  }
  return map
}
