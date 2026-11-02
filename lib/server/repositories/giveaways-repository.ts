import "server-only"

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache"

import {
  GIVEAWAY_RARITIES,
  type GiveawayJoinCode,
  type GiveawayRarity,
  type GiveawayStatus,
  type PublicGiveaway,
  type ViewerGiveaways,
} from "@/lib/giveaways"
import { ANONYMOUS_FLAG_CONTEXT } from "@/lib/feature-flags"
import { buildPeripheralSlug } from "@/lib/peripheral-slug"
import { getFeatureFlagContext, isFeatureEnabled } from "@/lib/server/feature-flags"
import { onlyUuids } from "@/lib/server/repositories/_shared"
import { removeImageIfUnreferenced, removeReplacedStorageObjects } from "@/lib/server/storage-cleanup"
import { isOwnStorageObject } from "@/lib/server/storage-origin"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Sorteios (`giveaways` + `giveaway_entries`). Nenhuma das tabelas tem grant
 * para cliente: a Home lê por aqui (ISR ou `/api/giveaways`), o painel escreve
 * por `/api/admin/giveaways`. A participação passa pela RPC `join_giveaway`,
 * que trava a linha do sorteio antes de conferir a vaga.
 */

/** Escritas vêm de Route Handler: `revalidateTag(..., { expire: 0 })`, como em events-repository. */
const GIVEAWAYS_TAG = "giveaways:list"

/** Bucket e formato EXATO do nome que a rota de upload gera (`giveaway-<timestamp>-<uuid>.<ext>`). */
export const GIVEAWAY_IMAGE_BUCKET = "peripherals"
const GIVEAWAY_IMAGE_NAME = /^giveaway-\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(webp|png|jpe?g|gif)$/

export function giveawayImageFileName(extension: string) {
  return `giveaway-${Date.now()}-${crypto.randomUUID()}.${extension}`
}

/** A URL gravada é uma foto de sorteio enviada pelo painel — e só isso. */
export function isGiveawayImageUrl(url: string) {
  return isOwnStorageObject(url, GIVEAWAY_IMAGE_BUCKET, (name) => GIVEAWAY_IMAGE_NAME.test(name))
}

const canRemoveGiveawayImage = ({ bucket, path }: { bucket: string; path: string }) =>
  bucket === GIVEAWAY_IMAGE_BUCKET && GIVEAWAY_IMAGE_NAME.test(path)

/** Sorteio já sorteado continua na Home por estes dias, com o nome de quem ganhou. */
const SHOW_DRAWN_FOR_DAYS = 14

const GIVEAWAY_COLUMNS =
  "id, title, category, rarity, peripheral_id, image_url, max_participants, entries_count, status, ends_at, winner_user_id, drawn_at, sort_order, created_at"

type GiveawayRow = {
  id: string
  title: string
  category: string
  rarity: GiveawayRarity
  peripheral_id: string | null
  image_url: string | null
  max_participants: number
  entries_count: number
  status: GiveawayStatus
  ends_at: string | null
  winner_user_id: string | null
  drawn_at: string | null
  sort_order: number
  created_at: string
}

type PeripheralRef = { id: string; name: string; image_url: string | null; category: string }

async function getPeripheralRefs(ids: string[]): Promise<Map<string, PeripheralRef>> {
  const valid = onlyUuids(ids)
  if (valid.length === 0) return new Map()
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("peripherals").select("id, name, image_url, category").in("id", valid)
  if (error) throw error
  return new Map(((data ?? []) as PeripheralRef[]).map((row) => [row.id, row]))
}

async function getDisplayNames(ids: string[]): Promise<Map<string, string>> {
  const valid = onlyUuids(ids)
  if (valid.length === 0) return new Map()
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("user_profiles").select("id, display_name").in("id", valid)
  if (error) throw error
  return new Map(
    ((data ?? []) as { id: string; display_name: string | null }[]).map((row) => [row.id, row.display_name || "Membro"])
  )
}

function byRarityThenOrder(a: GiveawayRow, b: GiveawayRow) {
  const statusRank = (status: GiveawayStatus) => (status === "open" ? 0 : 1)
  return (
    statusRank(a.status) - statusRank(b.status) ||
    GIVEAWAY_RARITIES.indexOf(a.rarity) - GIVEAWAY_RARITIES.indexOf(b.rarity) ||
    a.sort_order - b.sort_order ||
    b.created_at.localeCompare(a.created_at)
  )
}

async function fetchPublicGiveaways(): Promise<PublicGiveaway[]> {
  const db = createSupabaseAdminClient()
  const drawnSince = new Date(Date.now() - SHOW_DRAWN_FOR_DAYS * 86_400_000).toISOString()
  const { data, error } = await db
    .from("giveaways")
    .select(GIVEAWAY_COLUMNS)
    .or(`status.in.(open,closed),and(status.eq.drawn,drawn_at.gte."${drawnSince}")`)
    .limit(24)
  if (error) throw error

  const rows = ((data ?? []) as GiveawayRow[]).sort(byRarityThenOrder).slice(0, 12)
  const [peripherals, winners] = await Promise.all([
    getPeripheralRefs(rows.map((row) => row.peripheral_id).filter((id): id is string => Boolean(id))),
    getDisplayNames(rows.map((row) => row.winner_user_id).filter((id): id is string => Boolean(id))),
  ])

  return rows.map((row) => {
    const peripheral = row.peripheral_id ? peripherals.get(row.peripheral_id) : undefined
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      rarity: row.rarity,
      imageUrl: row.image_url ?? peripheral?.image_url ?? null,
      peripheralHref: peripheral ? `/perifericos/${buildPeripheralSlug(peripheral.name, peripheral.id)}` : null,
      maxParticipants: row.max_participants,
      entriesCount: row.entries_count,
      status: row.status as PublicGiveaway["status"],
      endsAt: row.ends_at,
      winnerName: row.winner_user_id ? winners.get(row.winner_user_id) ?? "Membro" : null,
    }
  })
}

/**
 * Lista da Home. Cache curto e compartilhado: o contador de participantes
 * pode atrasar até 30s para quem só olha; quem participa recebe o número
 * novo na resposta da própria participação.
 */
export const listPublicGiveaways = unstable_cache(fetchPublicGiveaways, ["giveaways-repository:public"], {
  revalidate: 30,
  tags: [GIVEAWAYS_TAG],
})

/**
 * O que a Home cacheada (ISR) desenha para TODO visitante: a lista só quando
 * a flag `giveaways` está em "Todos"; nos outros modos, `null` — e a seção
 * aparece só para quem a flag libera, buscada no cliente.
 */
export async function getHomeGiveaways(): Promise<ViewerGiveaways | null> {
  try {
    if (!(await isFeatureEnabled("giveaways", ANONYMOUS_FLAG_CONTEXT))) return null
    return { giveaways: await listPublicGiveaways(), joinedIds: [], isPublic: true }
  } catch (error) {
    console.error("[giveaways] lista da Home falhou:", error)
    return null
  }
}

/**
 * Para página DINÂMICA (Central de Aura): a flag avaliada para quem está
 * vendo, a lista e as participações dela, tudo no render do servidor. Sem a
 * espera em cascata do cliente (sessão → flag → lista), a seção já chega no
 * HTML. `null` = a flag não libera para esta pessoa.
 */
export async function getViewerGiveaways(userId: string | null): Promise<ViewerGiveaways | null> {
  try {
    const [enabled, isPublic] = await Promise.all([
      getFeatureFlagContext(userId).then((context) => isFeatureEnabled("giveaways", context)),
      isFeatureEnabled("giveaways", ANONYMOUS_FLAG_CONTEXT),
    ])
    if (!enabled) return null
    const giveaways = await listPublicGiveaways()
    const joinedIds = userId ? await getMyGiveawayEntries(userId, giveaways.map((g) => g.id)) : []
    return { giveaways, joinedIds, isPublic }
  } catch (error) {
    console.error("[giveaways] lista do visitante falhou:", error)
    return null
  }
}

/** Em quais destes sorteios `userId` já está. */
export async function getMyGiveawayEntries(userId: string, giveawayIds: string[]): Promise<string[]> {
  const ids = onlyUuids(giveawayIds)
  if (ids.length === 0) return []
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("giveaway_entries")
    .select("giveaway_id")
    .eq("user_id", userId)
    .in("giveaway_id", ids)
  if (error) throw error
  return (data ?? []).map((row) => row.giveaway_id)
}

export async function joinGiveaway(
  giveawayId: string,
  userId: string
): Promise<{ code: GiveawayJoinCode; entriesCount: number | null }> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("join_giveaway", { p_giveaway_id: giveawayId, p_user_id: userId })
  if (error) throw error
  const result = (data ?? {}) as { code?: GiveawayJoinCode; entries_count?: number }
  if (result.code === "joined") revalidateTag(GIVEAWAYS_TAG, { expire: 0 })
  return { code: result.code ?? "not_found", entriesCount: result.entries_count ?? null }
}

// ── Painel ───────────────────────────────────────────────────────────────

export type AdminGiveaway = {
  id: string
  title: string
  category: string
  rarity: GiveawayRarity
  peripheral: { id: string; name: string; imageUrl: string | null } | null
  /** Foto enviada pelo painel (null = usa a do periférico). */
  imageUrl: string | null
  maxParticipants: number
  entriesCount: number
  status: GiveawayStatus
  endsAt: string | null
  winnerName: string | null
  drawnAt: string | null
  sortOrder: number
  createdAt: string
}

export async function listAdminGiveaways(): Promise<AdminGiveaway[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("giveaways")
    .select(GIVEAWAY_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) throw error

  const rows = (data ?? []) as GiveawayRow[]
  const [peripherals, winners] = await Promise.all([
    getPeripheralRefs(rows.map((row) => row.peripheral_id).filter((id): id is string => Boolean(id))),
    getDisplayNames(rows.map((row) => row.winner_user_id).filter((id): id is string => Boolean(id))),
  ])

  return rows.map((row) => {
    const peripheral = row.peripheral_id ? peripherals.get(row.peripheral_id) : undefined
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      rarity: row.rarity,
      peripheral: peripheral ? { id: peripheral.id, name: peripheral.name, imageUrl: peripheral.image_url } : null,
      imageUrl: row.image_url,
      maxParticipants: row.max_participants,
      entriesCount: row.entries_count,
      status: row.status,
      endsAt: row.ends_at,
      winnerName: row.winner_user_id ? winners.get(row.winner_user_id) ?? "Membro" : null,
      drawnAt: row.drawn_at,
      sortOrder: row.sort_order,
      createdAt: row.created_at,
    }
  })
}

export type GiveawayInput = {
  title: string
  category: string
  rarity: GiveawayRarity
  peripheralId: string | null
  imageUrl: string | null
  maxParticipants: number
  status: Exclude<GiveawayStatus, "drawn">
  endsAt: string | null
  sortOrder: number
}

type WriteResult = { ok: true } | { ok: false; error: string; status: number }

/**
 * Prêmio = periférico do catálogo OU foto enviada (pode ter os dois: a foto
 * enviada ganha). O periférico precisa existir; a foto precisa ser um upload
 * desta tela, nunca uma URL qualquer — a coluna é texto e vai parar no `src`
 * da Home e, ao apagar, no `remove` do Storage.
 */
async function validatePrize(input: Pick<GiveawayInput, "peripheralId" | "imageUrl">): Promise<string | null> {
  if (!input.peripheralId && !input.imageUrl) return "Escolha um periférico do catálogo ou envie uma foto."
  if (input.imageUrl && !isGiveawayImageUrl(input.imageUrl)) return "A foto precisa ser enviada por esta tela."
  if (input.peripheralId) {
    const found = await getPeripheralRefs([input.peripheralId])
    if (!found.has(input.peripheralId)) return "Periférico não encontrado no catálogo."
  }
  return null
}

function invalidatePublic() {
  revalidateTag(GIVEAWAYS_TAG, { expire: 0 })
  revalidatePath("/")
}

export async function createGiveaway(input: GiveawayInput, actorId: string): Promise<WriteResult> {
  const invalid = await validatePrize(input)
  if (invalid) return { ok: false, error: invalid, status: 400 }

  const db = createSupabaseAdminClient()
  const { error } = await db.from("giveaways").insert({
    title: input.title,
    category: input.category,
    rarity: input.rarity,
    peripheral_id: input.peripheralId,
    image_url: input.imageUrl,
    max_participants: input.maxParticipants,
    status: input.status,
    ends_at: input.endsAt,
    sort_order: input.sortOrder,
    created_by: actorId,
  })
  if (error) throw error
  invalidatePublic()
  return { ok: true }
}

export async function updateGiveaway(id: string, input: GiveawayInput): Promise<WriteResult> {
  const db = createSupabaseAdminClient()
  const { data: current, error: readError } = await db
    .from("giveaways")
    .select("status, image_url, entries_count")
    .eq("id", id)
    .maybeSingle()
  if (readError) throw readError
  if (!current) return { ok: false, error: "Sorteio não encontrado.", status: 404 }
  if (current.status === "drawn") {
    return { ok: false, error: "Sorteio já sorteado não pode mais ser editado.", status: 409 }
  }
  if (input.maxParticipants < current.entries_count) {
    return {
      ok: false,
      error: `Já há ${current.entries_count} participantes; o limite não pode ficar abaixo disso.`,
      status: 400,
    }
  }

  const invalid = await validatePrize(input)
  if (invalid) return { ok: false, error: invalid, status: 400 }

  const { error } = await db
    .from("giveaways")
    .update({
      title: input.title,
      category: input.category,
      rarity: input.rarity,
      peripheral_id: input.peripheralId,
      image_url: input.imageUrl,
      max_participants: input.maxParticipants,
      status: input.status,
      ends_at: input.endsAt,
      sort_order: input.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
  if (error) throw error

  await removeReplacedStorageObjects([current.image_url], [input.imageUrl], canRemoveGiveawayImage)
  invalidatePublic()
  return { ok: true }
}

export async function deleteGiveaway(id: string): Promise<WriteResult> {
  const db = createSupabaseAdminClient()
  const { data: current, error: readError } = await db
    .from("giveaways")
    .select("image_url")
    .eq("id", id)
    .maybeSingle()
  if (readError) throw readError
  if (!current) return { ok: false, error: "Sorteio não encontrado.", status: 404 }

  const { error } = await db.from("giveaways").delete().eq("id", id)
  if (error) throw error

  await removeImageIfUnreferenced(current.image_url, "giveaways", "image_url", canRemoveGiveawayImage)
  invalidatePublic()
  return { ok: true }
}

export type DrawResult =
  | { ok: true; winnerUserId: string; winnerName: string; title: string }
  | { ok: false; error: string; status: number }

export async function drawGiveaway(id: string): Promise<DrawResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("draw_giveaway", { p_giveaway_id: id })
  if (error) throw error

  const result = (data ?? {}) as { code?: string; winner_user_id?: string }
  switch (result.code) {
    case "drawn": {
      invalidatePublic()
      const winnerUserId = result.winner_user_id ?? ""
      const [names, giveaway] = await Promise.all([
        getDisplayNames([winnerUserId]),
        db.from("giveaways").select("title").eq("id", id).maybeSingle(),
      ])
      return {
        ok: true,
        winnerUserId,
        winnerName: names.get(winnerUserId) ?? "Membro",
        title: giveaway.data?.title ?? "Sorteio",
      }
    }
    case "already_drawn":
      return { ok: false, error: "Este sorteio já foi sorteado.", status: 409 }
    case "draft":
      return { ok: false, error: "Publique o sorteio antes de sortear.", status: 409 }
    case "no_entries":
      return { ok: false, error: "Ninguém participou ainda.", status: 409 }
    default:
      return { ok: false, error: "Sorteio não encontrado.", status: 404 }
  }
}
