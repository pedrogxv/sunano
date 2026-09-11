import "server-only"

import { coerceAccountTier, profileMediaProxyUrl, type AccountTier } from "@/lib/account-tier"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getUserStreaksByUser } from "@/lib/server/repositories/achievements-repository"

export type EnrichedProfile = {
  display_name: string | null
  avatar_url: string | null
  account_tier: AccountTier
  vip_expires_at: string | null
  display_slug: string | null
  /** Ofensiva atual (dias consecutivos completando as missões diárias) — exibida ao lado do nome em comentários. */
  streak: number
}

/**
 * Perfis públicos (`user_profiles`) indexados por id — usado para enriquecer
 * autores de posts/comentários (fórum e notícias) com nome, avatar, tier,
 * slug de exibição e ofensiva a partir do `user_id` gravado no registro.
 */
export async function buildProfileMap(userIds: (string | null)[]): Promise<Record<string, EnrichedProfile>> {
  const map: Record<string, EnrichedProfile> = {}
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return map
  const db = createSupabaseAdminClient()
  const [{ data }, streaks] = await Promise.all([
    db.from("user_profiles").select("id, display_name, avatar_url, account_tier, vip_expires_at, display_slug").in("id", ids),
    getUserStreaksByUser(ids),
  ])
  for (const row of data ?? []) {
    map[row.id] = {
      display_name: row.display_name,
      // Nunca a coluna crua: quem lê daqui recebe posts/comentários pra um
      // Client Component (`PostCard`, `CommentRow`), e o que vira prop de
      // Client Component é serializado pro navegador tal e qual — mandar a
      // URL do Storage ali expunha o GIF original mesmo quando a UI mostrava
      // só o quadro congelado. Ver `profileMediaProxyUrl` em `lib/account-tier.ts`.
      avatar_url: row.avatar_url ? profileMediaProxyUrl(row.id, "avatar") : null,
      account_tier: coerceAccountTier(row.account_tier),
      vip_expires_at: row.vip_expires_at,
      display_slug: row.display_slug,
      streak: streaks[row.id] ?? 0,
    }
  }
  return map
}
