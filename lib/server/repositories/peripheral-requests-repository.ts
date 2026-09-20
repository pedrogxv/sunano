import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getUserProfiles } from "@/lib/server/repositories/users-repository"
import { queryPeripherals } from "@/lib/server/repositories/peripherals-repository"
import { clampPage, clampPageSize, publicDbErrorMessage, rangeFor } from "@/lib/server/repositories/_shared"
import { buildPeripheralDisplayName, buildPeripheralSlug } from "@/lib/peripheral-slug"
import {
  OPEN_PERIPHERAL_REQUEST_STATUSES,
  PERIPHERAL_REQUEST_STATUSES,
  type PeripheralRequestStatus,
} from "@/lib/peripheral-requests"
import type { Category } from "@/lib/tag-options"

/**
 * Repositório de pedidos de cadastro de periférico (`peripheral_requests`,
 * 20261130000000).
 *
 * O teto de pedidos em aberto por pessoa e o aviso de mudança de status vivem
 * no banco (trigger), não aqui: o teto porque só um lock fecha a corrida entre
 * dois envios quase simultâneos, e o aviso para nenhum caminho novo de
 * atualização esquecer de notificar. Este arquivo só traduz o erro do banco.
 */

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

/** Código de erro do Postgres para `raise exception ... using errcode = 'P0001'`. */
const PG_RAISE_EXCEPTION = "P0001"
const PG_UNIQUE_VIOLATION = "23505"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type LinkedPeripheral = {
  id: string
  /** Marca + modelo, sem repetir a marca. */
  displayName: string
  category: string
  imageUrl: string | null
  /** Caminho da ficha na wiki: `/perifericos/<slug>`. */
  href: string
}

export type PeripheralRequestSummary = {
  id: string
  number: number
  category: Category
  brand_name: string
  model_name: string
  status: PeripheralRequestStatus
  created_at: string
  updated_at: string
}

const SUMMARY_COLUMNS = "id, number, category, brand_name, model_name, status, created_at, updated_at"

export type PeripheralRequestDetail = PeripheralRequestSummary & {
  reference_url: string | null
  notes: string | null
  staff_response: string | null
  reviewed_at: string | null
  peripheral: LinkedPeripheral | null
}

const DETAIL_COLUMNS = `${SUMMARY_COLUMNS}, reference_url, notes, staff_response, reviewed_at, peripheral_id`

type DetailRow = PeripheralRequestSummary & {
  reference_url: string | null
  notes: string | null
  staff_response: string | null
  reviewed_at: string | null
  peripheral_id: string | null
}

/** Ficha(s) ligada(s) aos pedidos, em lote — uma consulta para a página inteira. */
async function resolveLinkedPeripherals(ids: Array<string | null>): Promise<Map<string, LinkedPeripheral>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))]
  const map = new Map<string, LinkedPeripheral>()
  if (unique.length === 0) return map

  try {
    const rows = await queryPeripherals({ ids: unique, limit: unique.length })
    for (const row of rows) {
      map.set(row.id, {
        id: row.id,
        displayName: buildPeripheralDisplayName(row.brand, row.name),
        category: row.category,
        imageUrl: row.image_url,
        href: `/perifericos/${buildPeripheralSlug(row.name, row.id)}`,
      })
    }
  } catch (error) {
    // A ficha é enfeite do detalhe: sem ela o pedido ainda se lê inteiro.
    console.error("[peripheral-requests-repository] resolveLinkedPeripherals:", error)
  }
  return map
}

function toDetail(row: DetailRow, linked: Map<string, LinkedPeripheral>): PeripheralRequestDetail {
  const { peripheral_id, ...rest } = row
  return { ...rest, peripheral: peripheral_id ? (linked.get(peripheral_id) ?? null) : null }
}

// ────────────────────────────────────────────
// Quem pediu
// ────────────────────────────────────────────

export async function createPeripheralRequest(params: {
  userId: string
  category: Category
  brandName: string
  modelName: string
  referenceUrl: string | null
  notes: string | null
}): Promise<RepositoryResult & { requestId?: string; number?: number }> {
  const db = createSupabaseAdminClient()

  const { data, error } = await db
    .from("peripheral_requests")
    .insert({
      user_id: params.userId,
      category: params.category,
      brand_name: params.brandName,
      model_name: params.modelName,
      reference_url: params.referenceUrl,
      notes: params.notes,
    })
    .select("id, number")
    .single()

  if (error || !data) {
    // Teto de pedidos em aberto: trigger `enforce_peripheral_request_cap`.
    if (error?.code === PG_RAISE_EXCEPTION) {
      return { ok: false, error: publicDbErrorMessage(error, "Limite de pedidos atingido."), status: 409 }
    }
    // Índice `uniq_peripheral_requests_open_per_user`: mesmo periférico, já na fila.
    if (error?.code === PG_UNIQUE_VIOLATION) {
      return { ok: false, error: "Você já tem um pedido em aberto para este periférico.", status: 409 }
    }
    console.error("[peripheral-requests-repository] createPeripheralRequest:", error)
    return { ok: false, error: "Não foi possível enviar o pedido.", status: 500 }
  }

  return { ok: true, requestId: data.id as string, number: data.number as number }
}

/** Pedidos da pessoa, mais recentes primeiro — a lista "Meus pedidos". */
export async function listMyPeripheralRequests(
  userId: string,
  page = 1,
  pageSize = 20
): Promise<{ requests: PeripheralRequestSummary[]; total: number; hasMore: boolean; openCount: number }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(page)
  const size = clampPageSize(pageSize, 50, 20)

  const [list, open] = await Promise.all([
    db
      .from("peripheral_requests")
      .select(SUMMARY_COLUMNS, { count: "exact" })
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(...rangeFor(currentPage, size)),
    db
      .from("peripheral_requests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .in("status", [...OPEN_PERIPHERAL_REQUEST_STATUSES]),
  ])

  if (list.error) {
    console.error("[peripheral-requests-repository] listMyPeripheralRequests:", list.error)
    return { requests: [], total: 0, hasMore: false, openCount: 0 }
  }
  const total = list.count ?? 0
  return {
    requests: (list.data ?? []) as PeripheralRequestSummary[],
    total,
    hasMore: currentPage * size < total,
    openCount: open.count ?? 0,
  }
}

/** Detalhe de um pedido da pessoa. `null` se não existe OU não é dela — nunca revela pedido alheio. */
export async function getMyPeripheralRequest(id: string, userId: string): Promise<PeripheralRequestDetail | null> {
  if (!UUID_RE.test(id)) return null

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("peripheral_requests")
    .select(DETAIL_COLUMNS)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[peripheral-requests-repository] getMyPeripheralRequest:", error)
    return null
  }
  if (!data) return null

  const row = data as DetailRow
  return toDetail(row, await resolveLinkedPeripherals([row.peripheral_id]))
}

/** A própria pessoa desiste do pedido — só enquanto ele está na fila. */
export async function cancelMyPeripheralRequest(id: string, userId: string): Promise<RepositoryResult> {
  if (!UUID_RE.test(id)) return { ok: false, error: "Pedido não encontrado.", status: 404 }

  const db = createSupabaseAdminClient()
  const { data: current, error: lookupError } = await db
    .from("peripheral_requests")
    .select("id, user_id, status")
    .eq("id", id)
    .maybeSingle()

  if (lookupError) {
    console.error("[peripheral-requests-repository] cancelMyPeripheralRequest lookup:", lookupError)
    return { ok: false, error: "Não foi possível cancelar o pedido.", status: 500 }
  }
  if (!current || current.user_id !== userId) {
    return { ok: false, error: "Pedido não encontrado.", status: 404 }
  }
  if (!OPEN_PERIPHERAL_REQUEST_STATUSES.includes(current.status)) {
    return { ok: false, error: "Este pedido já foi encerrado e não pode mais ser cancelado.", status: 409 }
  }

  // O filtro de status repete a checagem acima de propósito: entre o SELECT e
  // o UPDATE a equipe pode ter cadastrado o periférico, e cancelar por cima
  // apagaria o desfecho.
  const { data: updated, error } = await db
    .from("peripheral_requests")
    .update({ status: "cancelled" })
    .eq("id", id)
    .eq("user_id", userId)
    .in("status", [...OPEN_PERIPHERAL_REQUEST_STATUSES])
    .select("id")

  if (error) {
    console.error("[peripheral-requests-repository] cancelMyPeripheralRequest update:", error)
    return { ok: false, error: "Não foi possível cancelar o pedido.", status: 500 }
  }
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Este pedido já foi encerrado e não pode mais ser cancelado.", status: 409 }
  }
  return { ok: true }
}

// ────────────────────────────────────────────
// Equipe
// ────────────────────────────────────────────

/** Filtro da fila: um status, `open` (pendente + em análise) ou `all`. */
export type AdminRequestStatusFilter = PeripheralRequestStatus | "open" | "all"

export type AdminPeripheralRequestRow = PeripheralRequestSummary & {
  user_id: string
  user_display_name: string | null
  peripheral: LinkedPeripheral | null
}

export async function listPeripheralRequestsForAdmin(filters: {
  status?: AdminRequestStatusFilter
  category?: Category
  page?: number
  pageSize?: number
}): Promise<{ requests: AdminPeripheralRequestRow[]; total: number }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(filters.page)
  const size = clampPageSize(filters.pageSize, 50, 20)
  const status = filters.status ?? "open"
  const isQueue = status === "open" || status === "pending" || status === "in_review"

  let query = db
    .from("peripheral_requests")
    .select(`${SUMMARY_COLUMNS}, user_id, peripheral_id`, { count: "exact" })
    // Fila: o mais antigo primeiro, para ninguém ficar esquecido no fundo.
    // Histórico: o mais recente primeiro.
    .order("created_at", { ascending: isQueue })
    .range(...rangeFor(currentPage, size))

  if (status === "open") {
    query = query.in("status", [...OPEN_PERIPHERAL_REQUEST_STATUSES])
  } else if (status !== "all") {
    query = query.eq("status", status)
  }
  if (filters.category) {
    query = query.eq("category", filters.category)
  }

  const { data, count, error } = await query
  if (error) {
    console.error("[peripheral-requests-repository] listPeripheralRequestsForAdmin:", error)
    return { requests: [], total: 0 }
  }

  const rows = (data ?? []) as Array<PeripheralRequestSummary & { user_id: string; peripheral_id: string | null }>
  const [profiles, linked] = await Promise.all([
    getUserProfiles(rows.map((row) => row.user_id)),
    resolveLinkedPeripherals(rows.map((row) => row.peripheral_id)),
  ])

  return {
    requests: rows.map(({ peripheral_id, ...row }) => ({
      ...row,
      user_display_name: profiles[row.user_id]?.display_name ?? null,
      peripheral: peripheral_id ? (linked.get(peripheral_id) ?? null) : null,
    })),
    total: count ?? 0,
  }
}

export type AdminPeripheralRequestDetail = PeripheralRequestDetail & {
  user_id: string
  user_display_name: string | null
  user_email: string | null
  reviewed_by_name: string | null
}

export async function getPeripheralRequestForAdmin(id: string): Promise<AdminPeripheralRequestDetail | null> {
  if (!UUID_RE.test(id)) return null

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("peripheral_requests")
    .select(`${DETAIL_COLUMNS}, user_id, reviewed_by`)
    .eq("id", id)
    .maybeSingle()

  if (error) {
    console.error("[peripheral-requests-repository] getPeripheralRequestForAdmin:", error)
    return null
  }
  if (!data) return null

  const row = data as DetailRow & { user_id: string; reviewed_by: string | null }
  const [linked, profiles, authUser] = await Promise.all([
    resolveLinkedPeripherals([row.peripheral_id]),
    getUserProfiles([row.user_id, ...(row.reviewed_by ? [row.reviewed_by] : [])]),
    db.auth.admin.getUserById(row.user_id),
  ])

  const { user_id, reviewed_by, ...detailRow } = row
  return {
    ...toDetail(detailRow, linked),
    user_id,
    user_display_name: profiles[user_id]?.display_name ?? null,
    user_email: authUser.data?.user?.email ?? null,
    reviewed_by_name: reviewed_by ? (profiles[reviewed_by]?.display_name ?? null) : null,
  }
}

/** Status que a equipe pode dar. `cancelled` é só da pessoa que pediu. */
export type ReviewStatus = Exclude<PeripheralRequestStatus, "cancelled">
export const REVIEW_STATUSES = PERIPHERAL_REQUEST_STATUSES.filter(
  (status): status is ReviewStatus => status !== "cancelled"
)

/** Estados que terminam numa ficha da wiki e por isso exigem apontar qual. */
const STATUSES_WITH_PERIPHERAL: readonly PeripheralRequestStatus[] = ["added", "duplicate"]

export async function reviewPeripheralRequest(params: {
  id: string
  adminId: string
  status: ReviewStatus
  response: string | null
  peripheralId: string | null
}): Promise<RepositoryResult> {
  if (!UUID_RE.test(params.id)) return { ok: false, error: "Pedido não encontrado.", status: 404 }

  const needsPeripheral = STATUSES_WITH_PERIPHERAL.includes(params.status)
  if (needsPeripheral && !params.peripheralId) {
    return { ok: false, error: "Escolha a ficha do periférico na wiki.", status: 400 }
  }
  if (params.status === "rejected" && !params.response) {
    return { ok: false, error: "Explique o motivo da recusa: a pessoa vai ler isso.", status: 400 }
  }

  const db = createSupabaseAdminClient()
  const { data: current, error: lookupError } = await db
    .from("peripheral_requests")
    .select("id, status")
    .eq("id", params.id)
    .maybeSingle()

  if (lookupError) {
    console.error("[peripheral-requests-repository] reviewPeripheralRequest lookup:", lookupError)
    return { ok: false, error: "Não foi possível salvar.", status: 500 }
  }
  if (!current) return { ok: false, error: "Pedido não encontrado.", status: 404 }
  if (current.status === "cancelled") {
    return { ok: false, error: "A pessoa cancelou este pedido.", status: 409 }
  }

  if (needsPeripheral && params.peripheralId) {
    const { data: peripheral, error: peripheralError } = await db
      .from("peripherals")
      .select("id")
      .eq("id", params.peripheralId)
      .maybeSingle()
    if (peripheralError) {
      console.error("[peripheral-requests-repository] reviewPeripheralRequest peripheral:", peripheralError)
      return { ok: false, error: "Não foi possível salvar.", status: 500 }
    }
    if (!peripheral) return { ok: false, error: "Essa ficha não existe mais na wiki.", status: 400 }
  }

  const { error } = await db
    .from("peripheral_requests")
    .update({
      status: params.status,
      staff_response: params.response,
      // Só "cadastrado" e "já existia" apontam para uma ficha; nos outros a
      // ligação de uma revisão anterior sairia sobrando.
      peripheral_id: needsPeripheral ? params.peripheralId : null,
      reviewed_by: params.adminId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", params.id)

  if (error) {
    console.error("[peripheral-requests-repository] reviewPeripheralRequest update:", error)
    return { ok: false, error: "Não foi possível salvar.", status: 500 }
  }
  return { ok: true }
}

/** Badge da sidebar do painel: só o que ainda espera a equipe pegar. */
export async function countPendingPeripheralRequests(): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("peripheral_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending")

  if (error) {
    console.error("[peripheral-requests-repository] countPendingPeripheralRequests:", error)
    return 0
  }
  return count ?? 0
}

export type PeripheralRequestStats = Record<PeripheralRequestStatus, number>

/** Contagem por status para os filtros da fila — um `head: true` por status, em paralelo. */
export async function getPeripheralRequestStats(): Promise<PeripheralRequestStats> {
  const db = createSupabaseAdminClient()
  const results = await Promise.all(
    PERIPHERAL_REQUEST_STATUSES.map((status) =>
      db.from("peripheral_requests").select("id", { count: "exact", head: true }).eq("status", status)
    )
  )

  const stats = {} as PeripheralRequestStats
  PERIPHERAL_REQUEST_STATUSES.forEach((status, index) => {
    const result = results[index]
    if (result.error) console.error(`[peripheral-requests-repository] getPeripheralRequestStats ${status}:`, result.error)
    stats[status] = result.count ?? 0
  })
  return stats
}
