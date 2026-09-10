import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
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
export async function getUserTierlistItems(userId: string): Promise<TierlistItem[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_tierlist_items")
    .select(`peripheral_id, tier_id, position, peripherals ( ${PERIPHERAL_SHOWCASE_COLUMNS} )`)
    .eq("user_id", userId)
    .order("position", { ascending: true })

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

    const showcase = toShowcasePeripheral(raw)
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
    db.from("user_tierlist_meta").select("note, hearts_count").eq("user_id", userId).maybeSingle(),
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
  }
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
