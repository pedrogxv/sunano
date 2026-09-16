import "server-only"

import { coerceAccountTier, profileMediaProxyUrl, type AccountTier } from "@/lib/account-tier"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getUserStreakPairsByUser } from "@/lib/server/repositories/achievements-repository"
import { getVipFounderOwners } from "@/lib/server/repositories/vip-founder-repository"

export type EnrichedProfile = {
  display_name: string | null
  avatar_url: string | null
  account_tier: AccountTier
  vip_expires_at: string | null
  display_slug: string | null
  /** Ofensiva atual (dias consecutivos completando as missões diárias) — exibida ao lado do nome em comentários. */
  streak: number
  /**
   * RECORDE de ofensiva — decide a moldura de marco (`STREAK_FRAMES`).
   * Separado de `streak` porque aquele expira e este não: usar a atual faria
   * a moldura sumir do avatar no primeiro dia perdido.
   */
  longest_streak: number
  /**
   * Moldura equipada e posse de Fundador — o que `ProfileAvatar` precisa para
   * desenhar a MESMA moldura que o perfil da pessoa desenha.
   *
   * Entram aqui, e não em cada tela, porque este é o ponto por onde passam
   * TODOS os autores do site (fórum, notícias, reviews de periférico,
   * comentários). Enquanto a moldura não estava neste mapa, quem comprava uma
   * moldura só a via no próprio perfil — no fórum e nos comentários o avatar
   * saía sem nada, e cada tela nova repetia o esquecimento.
   */
  equipped_avatar_frame_slug: string | null
  equipped_avatar_frame_url: string | null
  is_founder: boolean
  /**
   * O dono escolheu não exibir moldura nenhuma. Sem este campo aqui, o
   * fallback de honraria (Fundador/VIP/Ofensiva) voltaria a desenhar a
   * moldura no fórum e nos comentários de quem pediu para não ter nenhuma —
   * a escolha valeria só no próprio perfil.
   */
  avatar_frame_opt_out: boolean
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
  const [{ data }, streaks, founders] = await Promise.all([
    db
      .from("user_profiles")
      .select(
        "id, display_name, avatar_url, account_tier, vip_expires_at, display_slug, avatar_frame_opt_out," +
          " equipped_avatar_frame:aura_items!user_profiles_equipped_avatar_frame_id_fkey ( slug, frame_asset_url )"
      )
      .in("id", ids),
    getUserStreakPairsByUser(ids),
    // Em lote, uma consulta para a página inteira — nunca por autor, que
    // seria um N+1 em cima da listagem do fórum.
    getVipFounderOwners(ids),
  ])
  // `as unknown as`: `Relationships` está vazio em `database.types.ts`
  // (mantido à mão), então o join embutido não é tipado — mesmo padrão de
  // `getProfileShowcase`/`getMiniProfileBySlug`.
  const rows = (data ?? []) as unknown as Array<{
    id: string
    display_name: string | null
    avatar_url: string | null
    account_tier: string | null
    vip_expires_at: string | null
    display_slug: string | null
    avatar_frame_opt_out: boolean | null
    equipped_avatar_frame:
      | { slug: string; frame_asset_url: string | null }
      | { slug: string; frame_asset_url: string | null }[]
      | null
  }>

  for (const row of rows) {
    const frame = Array.isArray(row.equipped_avatar_frame)
      ? row.equipped_avatar_frame[0]
      : row.equipped_avatar_frame

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
      streak: streaks[row.id]?.current ?? 0,
      longest_streak: streaks[row.id]?.longest ?? 0,
      equipped_avatar_frame_slug: frame?.slug ?? null,
      equipped_avatar_frame_url: frame?.frame_asset_url ?? null,
      is_founder: founders.has(row.id),
      avatar_frame_opt_out: Boolean(row.avatar_frame_opt_out),
    }
  }
  return map
}

/**
 * Os campos de moldura de um autor, no formato `author_*` que posts,
 * comentários e reviews já usam para nome/avatar/tier.
 *
 * Existe para que as ~8 listagens que enriquecem autor não repitam os três
 * campos à mão — repetir era como metade delas ficava para trás.
 */
export type AuthorFrameFields = {
  author_equipped_frame_slug: string | null
  author_equipped_frame_url: string | null
  author_is_founder: boolean
  /** Recorde de ofensiva do autor — decide a moldura de marco dele. */
  author_longest_streak: number
  /** O autor escolheu não exibir moldura nenhuma. */
  author_frame_opt_out: boolean
}

/**
 * Extrai os campos de moldura de um perfil enriquecido. Aceita `null`/
 * `undefined` (autor convidado ou removido, que não tem moldura) porque os
 * chamadores têm um ou outro conforme a consulta.
 */
export function authorFrameFields(profile: EnrichedProfile | null | undefined): AuthorFrameFields {
  return {
    author_equipped_frame_slug: profile?.equipped_avatar_frame_slug ?? null,
    author_equipped_frame_url: profile?.equipped_avatar_frame_url ?? null,
    author_is_founder: profile?.is_founder ?? false,
    author_longest_streak: profile?.longest_streak ?? 0,
    author_frame_opt_out: profile?.avatar_frame_opt_out ?? false,
  }
}
