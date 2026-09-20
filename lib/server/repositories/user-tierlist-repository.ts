import "server-only"

import { unstable_cache } from "next/cache"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  NO_PERIPHERAL_REVIEWS,
  PERIPHERAL_SHOWCASE_COLUMNS,
  toShowcasePeripheral,
  type PeripheralShowcaseRow,
} from "@/lib/server/repositories/peripheral-showcase-mapping"
import { DEFAULT_TIER_PRESET, sortTiers } from "@/lib/personal-tierlist-theme"
import {
  TIERLIST_MAX_TIERS,
  TIERLIST_MIN_TIERS,
  TIERLIST_TIER_LABEL_MAX_LENGTH,
} from "@/lib/personal-tierlist"
import { coerceAccountTier, profileMediaProxyUrl, type AccountTier } from "@/lib/account-tier"

// Os tipos vivem em `lib/personal-tierlist.ts` (módulo puro) para que Client
// Components possam importá-los sem tocar em `lib/server/**`.
export type { TierlistTierDef, TierlistItem } from "@/lib/personal-tierlist"

import type { TierlistItem, TierlistTierDef } from "@/lib/personal-tierlist"

/** Tiers do usuário, ordenados por posição — leitura pública. */
export async function getUserTierlistTiers(userId: string): Promise<TierlistTierDef[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_tierlist_tiers")
    .select("id, label, color, position")
    .eq("user_id", userId)
    .order("position", { ascending: true })

  if (error) throw error
  return sortTiers((data ?? []) as TierlistTierDef[])
}

/**
 * Garante que o usuário tem pelo menos um tier — chamado quando o editor
 * carrega pra um dono VIP. Idempotente: só insere o preset padrão
 * (`DEFAULT_TIER_PRESET`) se ainda não existir nenhum tier; duas chamadas
 * concorrentes na primeira visita não duplicam (a unique key
 * `user_id, position` barra a segunda inserção, que aqui só ignoramos).
 */
export async function ensureUserTierlistTiers(userId: string): Promise<TierlistTierDef[]> {
  const existing = await getUserTierlistTiers(userId)
  if (existing.length > 0) return existing

  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_tierlist_tiers")
    .insert(DEFAULT_TIER_PRESET.map((tier) => ({ ...tier, user_id: userId })))

  // Corrida entre duas requisições da primeira visita: a segunda esbarra na
  // unique key (user_id, position) e falha aqui — não é erro de verdade,
  // só relemos o que a primeira já gravou.
  if (error && error.code !== "23505") throw error

  return getUserTierlistTiers(userId)
}

export class TierlistTierInUseError extends Error {
  constructor(label: string) {
    super(`O tier "${label}" ainda tem periféricos; mova ou remova eles antes de apagar o tier.`)
    this.name = "TierlistTierInUseError"
  }
}

/**
 * Substitui o conjunto inteiro de tiers do usuário numa passada — é como o
 * painel de personalização funciona (renomear/recolorir/reordenar/
 * adicionar/remover tudo de uma vez, sem estado parcial).
 *
 * O trabalho acontece todo dentro de `replace_user_tierlist_tiers` (uma
 * transação só). Fazer isso daqui, com várias chamadas do supabase-js, não
 * funciona: cada uma commita sozinha e a reordenação colide na unique
 * (user_id, position) no meio do caminho.
 *
 * Tiers que somem da lista e ainda têm item apontando pra eles derrubam a
 * operação inteira com `TierlistTierInUseError` — quem chama decide como
 * avisar o usuário.
 */
export async function replaceUserTierlistTiers(
  userId: string,
  tiers: { id?: string; label: string; color: string }[]
): Promise<TierlistTierDef[]> {
  if (tiers.length < TIERLIST_MIN_TIERS || tiers.length > TIERLIST_MAX_TIERS) {
    throw new Error(`A tierlist precisa ter entre ${TIERLIST_MIN_TIERS} e ${TIERLIST_MAX_TIERS} tiers.`)
  }

  const payload = tiers.map((tier) => {
    const label = tier.label.trim()
    if (label.length === 0 || label.length > TIERLIST_TIER_LABEL_MAX_LENGTH) {
      throw new Error(`Nome do tier precisa ter entre 1 e ${TIERLIST_TIER_LABEL_MAX_LENGTH} caracteres.`)
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(tier.color)) {
      throw new Error("Cor do tier inválida.")
    }
    // `id: null` e não `undefined`: `JSON.stringify` apaga a chave undefined,
    // e a função lê `->> 'id'` — null e chave ausente dão no mesmo lá, mas
    // ser explícito deixa o payload legível no log.
    return { id: tier.id ?? null, label, color: tier.color }
  })

  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("replace_user_tierlist_tiers", {
    p_user_id: userId,
    p_tiers: payload,
  })
  if (error) throw error

  const result = (data ?? "") as string
  if (result.startsWith("in_use:")) throw new TierlistTierInUseError(result.slice("in_use:".length))
  if (result === "bad_count") {
    throw new Error(`A tierlist precisa ter entre ${TIERLIST_MIN_TIERS} e ${TIERLIST_MAX_TIERS} tiers.`)
  }
  if (result === "bad_ids") throw new Error("Tier inválido na lista enviada.")
  if (result !== "ok") throw new Error(`replace_user_tierlist_tiers devolveu "${result}".`)

  return getUserTierlistTiers(userId)
}

/**
 * Itens da tierlist pessoal de um usuário, com dados do periférico para
 * exibição — leitura pública.
 *
 * Usa as mesmas colunas de setup/favoritos (`PERIPHERAL_SHOWCASE_COLUMNS`):
 * `tier`, `tags` e `specs` entram só para alimentar o hover reaproveitado da
 * tierlist oficial — `specs` bruto nunca sai daqui, `toShowcasePeripheral`
 * extrai apenas as notas públicas.
 */
export async function getUserTierlistItems(
  userId: string,
  opts: { limit?: number } = {}
): Promise<TierlistItem[]> {
  const db = createSupabaseAdminClient()
  let query = db
    .from("user_tierlist_items")
    .select(`peripheral_id, tier_id, position, peripherals ( ${PERIPHERAL_SHOWCASE_COLUMNS} )`)
    .eq("user_id", userId)
    .order("position", { ascending: true })

  // A listagem da comunidade só mostra os primeiros N no mini-board — não
  // precisa trazer (e fazer o join de `peripherals` de) a tierlist inteira de
  // cada membro por linha da página.
  if (opts.limit != null) query = query.limit(opts.limit)

  const { data, error } = await query

  if (error) throw error

  type Row = {
    peripheral_id: string
    tier_id: string
    position: number
    peripherals: PeripheralShowcaseRow | PeripheralShowcaseRow[] | null
  }

  return ((data as unknown as Row[]) ?? []).flatMap((row) => {
    const raw = Array.isArray(row.peripherals) ? (row.peripherals[0] ?? null) : row.peripherals
    if (!raw) return []

    // O card da tierlist não mostra contagem de review (só nome, foto e
    // tier), então o lote de `getPeripheralReviewSummaries` não é buscado aqui:
    // seria uma consulta por membro na listagem da comunidade.
    const showcase = toShowcasePeripheral(raw, NO_PERIPHERAL_REVIEWS)
    return [
      {
        peripheralId: row.peripheral_id,
        tierId: row.tier_id,
        position: row.position,
        peripheral: {
          id: showcase.id,
          name: showcase.name,
          brandName: showcase.brand || null,
          category: showcase.category,
          imageUrl: showcase.image_url,
          siteTier: showcase.tier,
          tags: showcase.tags,
          ratings: showcase.ratings,
        },
      },
    ]
  })
}

/**
 * Só quantos itens a tierlist tem — usado pelo perfil, que precisa saber
 * apenas se vale mostrar o link "Ver tierlist". Um `count` no índice
 * (`head: true`, sem trazer linha nenhuma) em vez de `getUserTierlistItems`,
 * que puxaria o join com `peripherals` inteiro em toda abertura de perfil.
 */
export async function getUserTierlistItemCount(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("user_tierlist_items")
    .select("peripheral_id", { count: "exact", head: true })
    .eq("user_id", userId)

  if (error) throw error
  return count ?? 0
}

/** Adiciona ou move um item para um tier/posição — dono só, checagem de VIP feita na rota (defesa em profundidade com a RLS). */
export async function upsertTierlistItem(
  userId: string,
  peripheralId: string,
  tierId: string,
  position: number
): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_tierlist_items")
    .upsert(
      { user_id: userId, peripheral_id: peripheralId, tier_id: tierId, position, updated_at: new Date().toISOString() },
      { onConflict: "user_id,peripheral_id" }
    )
  if (error) throw error
}

/** Remove um item da tierlist do usuário. */
export async function removeTierlistItem(userId: string, peripheralId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_tierlist_items")
    .delete()
    .eq("user_id", userId)
    .eq("peripheral_id", peripheralId)
  if (error) throw error
}

// Idem aos tipos de item: `TierlistMeta` e o limite do recado vivem no módulo
// puro para o editor (Client Component) poder importá-los.
export { TIERLIST_NOTE_MAX_LENGTH } from "@/lib/personal-tierlist"
export type { TierlistMeta } from "@/lib/personal-tierlist"

import type { TierlistMeta } from "@/lib/personal-tierlist"
import type { ProfileFrameIdentity } from "@/lib/profile-frames"
import { getProfileFramesByUser } from "@/lib/server/repositories/vip-founder-repository"

/**
 * Meta pública da tierlist de um usuário.
 *
 * `hearts_count` é o contador desnormalizado mantido por trigger
 * (`sync_user_tierlist_hearts_count`) — nunca um `count(*)` por visita, já
 * que este bloco é renderizado em toda abertura de perfil.
 */
export async function getUserTierlistMeta(
  userId: string,
  viewerId?: string | null
): Promise<TierlistMeta> {
  const db = createSupabaseAdminClient()

  const [metaResult, heartResult] = await Promise.all([
    db.from("user_tierlist_meta").select("note, hearts_count, is_hidden").eq("user_id", userId).maybeSingle(),
    viewerId && viewerId !== userId
      ? db
          .from("user_tierlist_hearts")
          .select("user_id")
          .eq("owner_id", userId)
          .eq("user_id", viewerId)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (metaResult.error) throw metaResult.error

  return {
    note: metaResult.data?.note?.trim() || null,
    heartsCount: metaResult.data?.hearts_count ?? 0,
    viewerHearted: Boolean(heartResult.data),
    isHidden: metaResult.data?.is_hidden ?? false,
  }
}

/**
 * Só a flag `is_hidden` — para os guardas de visibilidade (`/perfil/[handle]/
 * tierlist`, o link no perfil) que não precisam do resto da meta. Um
 * `maybeSingle` numa PK; sem linha = não oculta.
 */
export async function isUserTierlistHidden(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_tierlist_meta")
    .select("is_hidden")
    .eq("user_id", userId)
    .maybeSingle()
  if (error) throw error
  return data?.is_hidden ?? false
}

/** Grava (ou apaga, com `null`) o recado do dono — checagem de VIP fica na rota. */
export async function saveUserTierlistNote(userId: string, note: string | null): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_tierlist_meta")
    .upsert({ user_id: userId, note, updated_at: new Date().toISOString() }, { onConflict: "user_id" })
  if (error) throw error
}

/**
 * Liga/desliga o "ocultar tierlist" do dono.
 *
 * De propósito NÃO checa VIP: montar a tierlist é feature VIP, mas tirar a
 * própria do ar tem que funcionar mesmo com o VIP expirado (senão a tierlist
 * congelada fica pública pra sempre). A rota só confirma que é o dono.
 */
export async function setUserTierlistHidden(userId: string, hidden: boolean): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_tierlist_meta")
    .upsert(
      { user_id: userId, is_hidden: hidden, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    )
  if (error) throw error
}

/**
 * Dá ou tira o coração de um visitante na tierlist de `ownerId`.
 *
 * Devolve a contagem nova para o cliente reconciliar o estado otimista com o
 * número real (dois visitantes curtindo ao mesmo tempo, por exemplo).
 * O contador em si é escrito pela trigger, nunca daqui.
 */
export async function setTierlistHeart(
  ownerId: string,
  viewerId: string,
  hearted: boolean
): Promise<number> {
  if (ownerId === viewerId) throw new Error("Não é possível curtir a própria tierlist.")

  const db = createSupabaseAdminClient()

  if (hearted) {
    // `upsert` e não `insert`: um duplo-clique não pode virar erro 500 — a PK
    // (owner_id, user_id) já garante um coração por pessoa.
    const { error } = await db
      .from("user_tierlist_hearts")
      .upsert({ owner_id: ownerId, user_id: viewerId }, { onConflict: "owner_id,user_id", ignoreDuplicates: true })
    if (error) throw error
  } else {
    const { error } = await db
      .from("user_tierlist_hearts")
      .delete()
      .eq("owner_id", ownerId)
      .eq("user_id", viewerId)
    if (error) throw error
  }

  const { data, error } = await db
    .from("user_tierlist_meta")
    .select("hearts_count")
    .eq("user_id", ownerId)
    .maybeSingle()
  if (error) throw error

  return data?.hearts_count ?? 0
}

/* --------------------------------------------------------------------------
 * Tierlists da comunidade — listagem pública de `/tierlist/comunidade`
 * ------------------------------------------------------------------------ */

/** Quantos itens de cada tierlist entram no mini-board do card da listagem. */
const COMMUNITY_PREVIEW_ITEMS = 18

export const COMMUNITY_TIERLIST_SORTS = ["hearts", "items", "recent"] as const
export type CommunityTierlistSort = (typeof COMMUNITY_TIERLIST_SORTS)[number]

export function coerceCommunityTierlistSort(value: unknown): CommunityTierlistSort {
  return (COMMUNITY_TIERLIST_SORTS as readonly string[]).includes(value as string)
    ? (value as CommunityTierlistSort)
    : "hearts"
}

export type CommunityTierlistSummary = {
  user: {
    id: string
    displayName: string
    displaySlug: string
    avatarUrl: string | null
    accountTier: AccountTier
    vipExpiresAt: string | null
    /**
     * Moldura pronta para `ProfileAvatar` — o card da comunidade desenha a
     * MESMA moldura que o perfil da pessoa. Vem montada porque a origem é uma
     * RPC: a moldura não está na linha e é buscada em lote logo abaixo.
     */
    frame: ProfileFrameIdentity
  }
  itemCount: number
  heartsCount: number
  note: string | null
  /** `updated_at` do item mais recente — usado para ordenar "recentes". */
  updatedAt: string | null
  tiers: TierlistTierDef[]
  /** Primeiros itens (por posição), já com dados do periférico para o mini-board. */
  previewItems: TierlistItem[]
}

/**
 * Página da listagem de tierlists da comunidade.
 *
 * Passo 1: pagina/ordena sobre a view `user_tierlist_public_summary`. A
 * view já agrega contagem/data (Postgrest não faz `group by` numa query
 * normal), já traz nome/avatar/slug do perfil e já exclui quem não pode
 * aparecer (sem `display_slug` ou o perfil do site) — ver migration
 * `20261028000004`.
 *
 * Passo 2: para as ~12 linhas da página, carrega em paralelo os tiers e os
 * primeiros itens de cada tierlist (reaproveitando `getUserTierlistTiers` e
 * `getUserTierlistItems`). São poucas queries leves numa rota de nicho não
 * cacheada — aceitável, e muito mais simples que um RPC dedicado.
 */
async function listCommunityTierlistsUncached(opts: {
  sort: CommunityTierlistSort
  page: number
  pageSize: number
}): Promise<{ rows: CommunityTierlistSummary[]; total: number }> {
  const page = Math.max(1, Math.trunc(opts.page) || 1)
  const pageSize = Math.max(1, Math.trunc(opts.pageSize) || 12)
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1

  const sortColumn: Record<CommunityTierlistSort, string> = {
    hearts: "hearts_count",
    items: "item_count",
    recent: "last_item_at",
  }

  // A view `user_tierlist_public_summary` já traz as colunas do perfil e já
  // filtra quem não pode aparecer (sem slug, perfil do site) — ver a
  // migration `20261028000004`. Não há embed do PostgREST aqui de propósito:
  // uma view sem FK declarada não é embutível (`user_profiles!inner` dava
  // PGRST200).
  const db = createSupabaseAdminClient()
  const { data, error, count } = await db
    .from("user_tierlist_public_summary")
    .select(
      "user_id, item_count, last_item_at, hearts_count, note, display_name, display_slug, avatar_url, account_tier, vip_expires_at",
      { count: "exact" }
    )
    .order(sortColumn[opts.sort], { ascending: false, nullsFirst: false })
    // Desempate estável entre linhas com a mesma contagem — sem isso a ordem
    // dentro de um bloco de empate muda entre requisições e a paginação pula
    // ou repete cards.
    .order("user_id", { ascending: true })
    .range(from, to)

  if (error) throw error

  type Row = {
    user_id: string
    item_count: number
    last_item_at: string | null
    hearts_count: number
    note: string | null
    display_name: string | null
    display_slug: string | null
    avatar_url: string | null
    account_tier: string | null
    vip_expires_at: string | null
  }

  const rawRows = ((data as unknown as Row[]) ?? []).filter((row) => Boolean(row.display_slug))

  // Moldura equipada + Fundador da página inteira em duas consultas, fora do
  // `map` abaixo — dentro dele seriam duas por card.
  const frameByUser = await getProfileFramesByUser(rawRows.map((row) => row.user_id))

  const enriched = await Promise.all(
    rawRows.map(async (row) => {
      const [tiers, items] = await Promise.all([
        getUserTierlistTiers(row.user_id),
        getUserTierlistItems(row.user_id, { limit: COMMUNITY_PREVIEW_ITEMS }),
      ])

      return {
        user: {
          id: row.user_id,
          displayName: row.display_name?.trim() || `Membro ${row.user_id.slice(0, 6)}`,
          displaySlug: row.display_slug as string,
          avatarUrl: row.avatar_url ? profileMediaProxyUrl(row.user_id, "avatar") : null,
          accountTier: coerceAccountTier(row.account_tier),
          vipExpiresAt: row.vip_expires_at,
          frame: frameByUser(row.user_id, row.account_tier, row.vip_expires_at),
        },
        itemCount: row.item_count,
        heartsCount: row.hearts_count,
        note: row.note?.trim() || null,
        updatedAt: row.last_item_at,
        tiers,
        previewItems: items,
      } satisfies CommunityTierlistSummary
    })
  )

  return { rows: enriched, total: count ?? 0 }
}

/**
 * Versão cacheada (60 s) da listagem da comunidade. A página é `force-dynamic`
 * por ler `searchParams`, mas o conteúdo muda devagar (curtidas/itens); o
 * cache absorve rajada de bots e navegação entre abas/páginas sem repetir as
 * ~13 queries por request. A chave inclui sort+page+pageSize.
 */
export function listCommunityTierlists(opts: {
  sort: CommunityTierlistSort
  page: number
  pageSize: number
}): Promise<{ rows: CommunityTierlistSummary[]; total: number }> {
  const page = Math.max(1, Math.trunc(opts.page) || 1)
  const pageSize = Math.max(1, Math.trunc(opts.pageSize) || 12)
  return unstable_cache(
    () => listCommunityTierlistsUncached({ sort: opts.sort, page, pageSize }),
    ["user-tierlist-repository:listCommunityTierlists", opts.sort, String(page), String(pageSize)],
    { revalidate: 60 }
  )()
}
