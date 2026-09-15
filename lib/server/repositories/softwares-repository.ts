import "server-only"

import type { PostgrestError } from "@supabase/supabase-js"
import { revalidateTag, unstable_cache } from "next/cache"

import {
  canReorderFavoriteSoftwares,
  getFavoriteSoftwareLimit,
  isVipActive,
  type AccountTier,
} from "@/lib/account-tier"
import { publicDbErrorMessage } from "@/lib/server/repositories/_shared"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import {
  compareSoftwareNames,
  MOST_USED_SOFTWARES_LIMIT,
  MOST_USED_SOFTWARES_WINDOW_DAYS,
  type Software,
  type SoftwareFavoritesState,
} from "@/lib/softwares"

/**
 * Repositório de /softwares: cards (`softwares`), favoritos
 * (`user_favorite_softwares`) e cliques (`software_clicks`). Nenhuma das três
 * tabelas tem grant para cliente, tudo passa por aqui com service_role.
 */

const SOFTWARE_COLUMNS = "id, brand_id, logo_url, hub_url, brands ( name )"

/**
 * Tag da lista pública. As escritas vêm de Route Handler, onde `updateTag`
 * não funciona, daí `revalidateTag(..., { expire: 0 })` (mesmo motivo de
 * events-repository).
 */
const SOFTWARES_LIST_TAG = "softwares:list"

type SoftwareRow = {
  id: string
  brand_id: string
  logo_url: string
  hub_url: string
  brands: { name: string } | { name: string }[] | null
}

function toSoftware(row: SoftwareRow): Software {
  const brand = Array.isArray(row.brands) ? row.brands[0] : row.brands
  return {
    id: row.id,
    brandId: row.brand_id,
    name: brand?.name ?? "",
    logoUrl: row.logo_url,
    hubUrl: row.hub_url,
  }
}

type WriteError = { ok: false; error: string; status: number }

export type SoftwareResult = { ok: true; software: Software } | WriteError

export type SoftwareInput = {
  brandId: string
  logoUrl: string
  hubUrl: string
}

function toWriteError(error: PostgrestError, fallback: string): WriteError {
  if (error.code === "23505") {
    return { ok: false, error: "Essa marca já tem um software cadastrado.", status: 409 }
  }
  if (error.code === "23503") {
    return { ok: false, error: "Marca não encontrada.", status: 400 }
  }
  console.error("[softwares-repository] escrita falhou:", error)
  return { ok: false, error: publicDbErrorMessage(error, fallback), status: 400 }
}

async function fetchSoftwares(): Promise<Software[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("softwares").select(SOFTWARE_COLUMNS)

  if (error) {
    console.error("[softwares-repository] fetchSoftwares:", error)
    throw error
  }
  return ((data ?? []) as unknown as SoftwareRow[]).map(toSoftware).sort(compareSoftwareNames)
}

async function fetchMostUsedSoftwareIds(): Promise<string[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("software_click_ranking", {
    p_days: MOST_USED_SOFTWARES_WINDOW_DAYS,
    p_limit: MOST_USED_SOFTWARES_LIMIT,
  })

  if (error) {
    console.error("[softwares-repository] fetchMostUsedSoftwareIds:", error)
    throw error
  }
  return (data ?? []).map((row) => row.software_id)
}

const getCachedSoftwares = unstable_cache(fetchSoftwares, ["softwares-repository:list"], {
  revalidate: 300,
  tags: [SOFTWARES_LIST_TAG],
})

// Ranking muda devagar (um clique por visitante por dia), 10 min basta.
const getCachedMostUsedSoftwareIds = unstable_cache(
  fetchMostUsedSoftwareIds,
  ["softwares-repository:mostUsed"],
  { revalidate: 600, tags: [SOFTWARES_LIST_TAG] }
)

/**
 * Dados da página pública, iguais para todo visitante. Falha de banco vira
 * lista vazia em vez de derrubar a página (erro não entra no cache).
 */
export async function getSoftwaresPageData(): Promise<{ softwares: Software[]; mostUsedIds: string[] }> {
  const [softwares, mostUsedIds] = await Promise.all([
    getCachedSoftwares().catch((): Software[] => []),
    getCachedMostUsedSoftwareIds().catch((): string[] => []),
  ])

  const existing = new Set(softwares.map((software) => software.id))
  return { softwares, mostUsedIds: mostUsedIds.filter((id) => existing.has(id)) }
}

/** Lista do admin, sem cache: quem acabou de salvar precisa ver na hora. */
export function listSoftwaresForAdmin(): Promise<Software[]> {
  return fetchSoftwares()
}

export async function getSoftwareById(id: string): Promise<Software | null> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("softwares").select(SOFTWARE_COLUMNS).eq("id", id).maybeSingle()

  if (error) {
    console.error("[softwares-repository] getSoftwareById:", error)
    return null
  }
  return data ? toSoftware(data as unknown as SoftwareRow) : null
}

export async function softwareExists(id: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { count } = await db.from("softwares").select("id", { count: "exact", head: true }).eq("id", id)
  return (count ?? 0) > 0
}

export async function createSoftware(input: SoftwareInput): Promise<SoftwareResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("softwares")
    .insert({ brand_id: input.brandId, logo_url: input.logoUrl, hub_url: input.hubUrl })
    .select(SOFTWARE_COLUMNS)
    .single()

  if (error) return toWriteError(error, "Não foi possível criar o software.")

  revalidateTag(SOFTWARES_LIST_TAG, { expire: 0 })
  return { ok: true, software: toSoftware(data as unknown as SoftwareRow) }
}

export async function updateSoftware(id: string, input: SoftwareInput): Promise<SoftwareResult> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("softwares")
    .update({ brand_id: input.brandId, logo_url: input.logoUrl, hub_url: input.hubUrl })
    .eq("id", id)
    .select(SOFTWARE_COLUMNS)
    .maybeSingle()

  if (error) return toWriteError(error, "Não foi possível salvar o software.")
  if (!data) return { ok: false, error: "Software não encontrado.", status: 404 }

  revalidateTag(SOFTWARES_LIST_TAG, { expire: 0 })
  return { ok: true, software: toSoftware(data as unknown as SoftwareRow) }
}

/** Exclui o card. Favoritos e cliques caem junto (`on delete cascade`). */
export async function deleteSoftware(id: string): Promise<{ ok: true; logoUrl: string } | WriteError> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("softwares").delete().eq("id", id).select("logo_url").maybeSingle()

  if (error) {
    console.error("[softwares-repository] deleteSoftware:", error)
    return { ok: false, error: publicDbErrorMessage(error, "Não foi possível excluir o software."), status: 400 }
  }
  if (!data) return { ok: false, error: "Software não encontrado.", status: 404 }

  revalidateTag(SOFTWARES_LIST_TAG, { expire: 0 })
  return { ok: true, logoUrl: data.logo_url }
}

/**
 * Tier que vale AGORA para os limites de favorito. `account_tier` sozinho
 * pode dizer "vip" para um VIP pago que já venceu, por isso passa por
 * `isVipActive`.
 */
async function getViewerTier(userId: string): Promise<AccountTier> {
  const db = createSupabaseAdminClient()
  const { data } = await db
    .from("user_profiles")
    .select("account_tier, vip_expires_at")
    .eq("id", userId)
    .maybeSingle()

  const row = data as { account_tier?: string | null; vip_expires_at?: string | null } | null
  return isVipActive(row?.account_tier, row?.vip_expires_at) ? "vip" : "common"
}

/**
 * Favoritos na ordem salva. Quem tem mais favoritos que o limite atual (VIP
 * que venceu) continua com todos: rebaixar o tier não apaga dado, só impede
 * de favoritar mais até voltar para dentro do limite.
 */
export async function getFavoriteSoftwaresState(userId: string): Promise<SoftwareFavoritesState> {
  const db = createSupabaseAdminClient()
  const [tier, { data, error }] = await Promise.all([
    getViewerTier(userId),
    db
      .from("user_favorite_softwares")
      .select("software_id")
      .eq("user_id", userId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
  ])

  if (error) console.error("[softwares-repository] getFavoriteSoftwaresState:", error)

  return {
    authenticated: true,
    isVip: tier === "vip",
    ids: (data ?? []).map((row) => row.software_id),
    limit: getFavoriteSoftwareLimit(tier),
    canReorder: canReorderFavoriteSoftwares(tier),
  }
}

export type AddFavoriteSoftwareResult = "favorited" | "already_favorited" | "limit_reached"

export async function addFavoriteSoftware(
  userId: string,
  softwareId: string
): Promise<{ result: AddFavoriteSoftwareResult; tier: AccountTier; limit: number }> {
  const tier = await getViewerTier(userId)
  const limit = getFavoriteSoftwareLimit(tier)

  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("add_favorite_software", {
    p_user_id: userId,
    p_software_id: softwareId,
    p_limit: limit,
  })

  if (error) {
    console.error("[softwares-repository] addFavoriteSoftware:", error)
    throw error
  }
  return { result: data as AddFavoriteSoftwareResult, tier, limit }
}

/** Idempotente. */
export async function removeFavoriteSoftware(userId: string, softwareId: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("user_favorite_softwares")
    .delete()
    .eq("user_id", userId)
    .eq("software_id", softwareId)

  if (error) {
    console.error("[softwares-repository] removeFavoriteSoftware:", error)
    throw error
  }
}

/**
 * Regrava `position` na ordem recebida. A lista precisa ser exatamente o
 * conjunto atual de favoritos: se não bater (favoritou em outra aba, clique
 * ainda em voo), recusa em vez de gravar uma ordem parcial.
 */
export async function reorderFavoriteSoftwares(userId: string, orderedIds: string[]): Promise<"ok" | "mismatch"> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.from("user_favorite_softwares").select("software_id").eq("user_id", userId)

  if (error) {
    console.error("[softwares-repository] reorderFavoriteSoftwares:", error)
    throw error
  }

  const current = new Set((data ?? []).map((row) => row.software_id))
  const requested = new Set(orderedIds)
  if (
    requested.size !== orderedIds.length ||
    requested.size !== current.size ||
    orderedIds.some((id) => !current.has(id))
  ) {
    return "mismatch"
  }

  const results = await Promise.all(
    orderedIds.map((softwareId, index) =>
      db
        .from("user_favorite_softwares")
        .update({ position: index })
        .eq("user_id", userId)
        .eq("software_id", softwareId)
    )
  )

  const failed = results.find((result) => result.error)
  if (failed?.error) {
    console.error("[softwares-repository] reorderFavoriteSoftwares:", failed.error)
    throw failed.error
  }
  return "ok"
}

/** Conta um clique (no máximo um por visitante, software e dia, pela PK). */
export async function recordSoftwareClick(softwareId: string, visitorHash: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db
    .from("software_clicks")
    .upsert(
      { software_id: softwareId, visitor_hash: visitorHash },
      { onConflict: "software_id,visitor_hash,clicked_on", ignoreDuplicates: true }
    )

  // 23503: o software foi excluído entre o render da página e o clique.
  if (error && error.code !== "23503") {
    console.error("[softwares-repository] recordSoftwareClick:", error)
  }
}
