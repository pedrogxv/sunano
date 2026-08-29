import "server-only"

import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"
import { getUserProfiles, searchUserProfiles } from "@/lib/server/repositories/users-repository"
import { orderNumber } from "@/lib/order-number"
import { clampPage, clampPageSize, rangeFor } from "@/lib/server/repositories/_shared"

/**
 * Repositório de tickets de suporte (`support_tickets` + `support_messages`).
 *
 * Estado de turno (`waiting_on`) e campos denormalizados (`message_count`,
 * `last_message_*`) são mantidos por trigger no banco (ver
 * 20260921000016_support_tickets.sql) — este repositório nunca escreve
 * esses campos diretamente ao postar mensagem, só lê. A regra "usuário só
 * manda 1 mensagem sem resposta" também é imposta pela trigger (erro
 * P0001), pois só um lock de linha no banco evita corrida entre requisições
 * quase simultâneas — uma checagem aqui em TS teria uma janela de corrida.
 */

export type RepositoryResult = { ok: true } | { ok: false; error: string; status: number }

export type SupportTicketStatus = "open" | "resolved" | "cancelled"
export type SupportWaitingOn = "user" | "admin" | "closed"
export type SupportMessageSender = "user" | "admin"

const MAX_OPEN_TICKETS_PER_USER = 3

/** Código de erro do Postgres para exceções levantadas via `raise ... using errcode = 'P0001'`. */
const PG_RAISE_EXCEPTION = "P0001"

export type SupportTicketSummary = {
  id: string
  subject: string
  status: SupportTicketStatus
  waiting_on: SupportWaitingOn
  message_count: number
  last_message_at: string
  last_message_preview: string | null
  last_message_sender: SupportMessageSender | null
  rating: number | null
  created_at: string
  order_id: string | null
  product_id: string | null
}

const TICKET_SUMMARY_COLUMNS =
  "id, subject, status, waiting_on, message_count, last_message_at, last_message_preview, last_message_sender, rating, created_at, order_id, product_id"

export type SupportMessageRow = {
  id: string
  sender_type: SupportMessageSender
  sender_id: string
  sender_name: string
  body: string
  image_urls: string[]
  created_at: string
}

export type SupportTicketDetail = SupportTicketSummary & {
  order_number: string | null
  product_name: string | null
  product_slug: string | null
  rating_comment: string | null
  rated_at: string | null
  closed_at: string | null
}

/** true se o usuário já abriu pelo menos 1 ticket — alimenta o item "Meus Tickets" do dropdown/nav, que só aparece quando há histórico. */
export async function hasAnySupportTicket(userId: string): Promise<boolean> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)

  if (error) {
    console.error("[support-repository] hasAnySupportTicket:", error)
    return false
  }
  return (count ?? 0) > 0
}

/** Tickets do usuário logado, mais recentes primeiro — usado por "Meus Tickets". */
export async function listMySupportTickets(
  userId: string,
  page = 1,
  pageSize = 20
): Promise<{ tickets: SupportTicketSummary[]; total: number; hasMore: boolean }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(page)
  const size = clampPageSize(pageSize, 50, 20)
  const { data, count, error } = await db
    .from("support_tickets")
    .select(TICKET_SUMMARY_COLUMNS, { count: "exact" })
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (error) {
    console.error("[support-repository] listMySupportTickets:", error)
    return { tickets: [], total: 0, hasMore: false }
  }
  const total = count ?? 0
  return {
    tickets: (data ?? []) as unknown as SupportTicketSummary[],
    total,
    hasMore: currentPage * size < total,
  }
}

async function resolveOrderAndProductLabels(
  orderId: string | null,
  productId: string | null
): Promise<{ order_number: string | null; product_name: string | null; product_slug: string | null }> {
  const db = createSupabaseAdminClient()
  const [orderResult, productResult] = await Promise.all([
    orderId ? db.from("store_orders").select("id").eq("id", orderId).maybeSingle() : Promise.resolve({ data: null }),
    productId
      ? db.from("store_products").select("name, slug").eq("id", productId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  return {
    order_number: orderResult.data ? orderNumber((orderResult.data as { id: string }).id) : null,
    product_name: productResult.data ? (productResult.data as { name: string }).name : null,
    product_slug: productResult.data ? (productResult.data as { slug: string }).slug : null,
  }
}

/** Detalhe + thread de um ticket do usuário. Retorna `null` se não existir OU não pertencer a `userId` — nunca vaza a existência de ticket alheio. */
export async function getMySupportTicket(
  ticketId: string,
  userId: string
): Promise<{ ticket: SupportTicketDetail; messages: SupportMessageRow[] } | null> {
  const db = createSupabaseAdminClient()
  const { data: ticket, error } = await db
    .from("support_tickets")
    .select(
      `${TICKET_SUMMARY_COLUMNS}, rating_comment, rated_at, closed_at`
    )
    .eq("id", ticketId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error) {
    console.error("[support-repository] getMySupportTicket:", error)
    return null
  }
  if (!ticket) return null

  const [{ data: messages, error: messagesError }, labels] = await Promise.all([
    db
      .from("support_messages")
      .select("id, sender_type, sender_id, sender_name, body, image_urls, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    resolveOrderAndProductLabels(ticket.order_id, ticket.product_id),
  ])

  if (messagesError) {
    console.error("[support-repository] getMySupportTicket messages:", messagesError)
    return null
  }

  return {
    ticket: { ...(ticket as unknown as SupportTicketDetail), ...labels },
    messages: (messages ?? []) as unknown as SupportMessageRow[],
  }
}

/**
 * Cria o ticket + a mensagem inicial (duas inserções sequenciais — não há
 * transação multi-statement disponível no client do Supabase). Se a 2ª
 * inserção falhar após a 1ª ter sucesso, o ticket é apagado logo em seguida:
 * um ticket sem mensagem ainda aparece em "Meus Tickets" (visualmente vazio)
 * e conta pro cap de tickets abertos, então não pode simplesmente ficar lá.
 */
export async function createSupportTicket(params: {
  userId: string
  authorName: string
  subject: string
  body: string
  orderId?: string | null
  productId?: string | null
  imageUrls?: string[]
}): Promise<RepositoryResult & { ticketId?: string }> {
  const db = createSupabaseAdminClient()

  const { count, error: countError } = await db
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", params.userId)
    .eq("status", "open")

  if (countError) {
    console.error("[support-repository] createSupportTicket count:", countError)
    return { ok: false, error: "Não foi possível abrir o chamado.", status: 500 }
  }
  if ((count ?? 0) >= MAX_OPEN_TICKETS_PER_USER) {
    return {
      ok: false,
      error: `Você já tem ${MAX_OPEN_TICKETS_PER_USER} chamados em aberto. Aguarde a resolução de um deles antes de abrir outro.`,
      status: 409,
    }
  }

  const { data: ticket, error: ticketError } = await db
    .from("support_tickets")
    .insert({
      user_id: params.userId,
      subject: params.subject,
      order_id: params.orderId ?? null,
      product_id: params.productId ?? null,
    })
    .select("id")
    .single()

  if (ticketError || !ticket) {
    console.error("[support-repository] createSupportTicket insert ticket:", ticketError)
    return { ok: false, error: "Não foi possível abrir o chamado.", status: 500 }
  }

  const { error: messageError } = await db.from("support_messages").insert({
    ticket_id: ticket.id,
    sender_type: "user",
    sender_id: params.userId,
    sender_name: params.authorName,
    body: params.body,
    image_urls: params.imageUrls ?? [],
  })

  if (messageError) {
    console.error("[support-repository] createSupportTicket insert message:", messageError)
    // Desfaz o ticket recém-criado: sem a mensagem inicial ele é inútil, mas
    // ainda apareceria em "Meus Tickets" e consumiria o cap de tickets
    // abertos do usuário. É seguro apagar — acabou de ser criado por esta
    // requisição e comprovadamente não tem nenhuma mensagem.
    await db.from("support_tickets").delete().eq("id", ticket.id)
    return { ok: false, error: "Não foi possível enviar sua mensagem inicial.", status: 500 }
  }

  return { ok: true, ticketId: ticket.id as string }
}

/**
 * Mensagem do usuário numa conversa existente. Ownership é checado aqui
 * antes do insert; a regra de turno ("só 1 pendente") e o bloqueio de
 * ticket fechado vêm da trigger do banco (`enforce_support_message_turn`),
 * cujo erro (P0001) é traduzido para `status: 409` — a UI trata isso como
 * "aguarde a resposta do suporte", não como erro genérico.
 */
export async function postUserSupportMessage(params: {
  ticketId: string
  userId: string
  authorName: string
  body: string
  imageUrls?: string[]
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: ticket, error: ticketError } = await db
    .from("support_tickets")
    .select("id, user_id")
    .eq("id", params.ticketId)
    .maybeSingle()

  if (ticketError) {
    console.error("[support-repository] postUserSupportMessage lookup:", ticketError)
    return { ok: false, error: "Não foi possível enviar a mensagem.", status: 500 }
  }
  if (!ticket || ticket.user_id !== params.userId) {
    return { ok: false, error: "Chamado não encontrado.", status: 404 }
  }

  const { error } = await db.from("support_messages").insert({
    ticket_id: params.ticketId,
    sender_type: "user",
    sender_id: params.userId,
    sender_name: params.authorName,
    body: params.body,
    image_urls: params.imageUrls ?? [],
  })

  if (error) {
    if (error.code === PG_RAISE_EXCEPTION) {
      return { ok: false, error: error.message, status: 409 }
    }
    console.error("[support-repository] postUserSupportMessage insert:", error)
    return { ok: false, error: "Não foi possível enviar a mensagem.", status: 500 }
  }

  return { ok: true }
}

/** Avaliação de satisfação — só permitida com o ticket fechado e ainda sem nota (evita reescrever a avaliação por engano). */
export async function rateSupportTicket(params: {
  ticketId: string
  userId: string
  rating: number
  comment?: string | null
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: ticket, error: ticketError } = await db
    .from("support_tickets")
    .select("id, user_id, status, rating")
    .eq("id", params.ticketId)
    .maybeSingle()

  if (ticketError) {
    console.error("[support-repository] rateSupportTicket lookup:", ticketError)
    return { ok: false, error: "Não foi possível registrar sua avaliação.", status: 500 }
  }
  if (!ticket || ticket.user_id !== params.userId) {
    return { ok: false, error: "Chamado não encontrado.", status: 404 }
  }
  if (ticket.status === "open") {
    return { ok: false, error: "Só é possível avaliar após o encerramento do chamado.", status: 400 }
  }
  if (ticket.rating !== null) {
    return { ok: false, error: "Este chamado já foi avaliado.", status: 409 }
  }

  const { error } = await db
    .from("support_tickets")
    .update({ rating: params.rating, rating_comment: params.comment?.trim() || null, rated_at: new Date().toISOString() })
    .eq("id", params.ticketId)

  if (error) {
    console.error("[support-repository] rateSupportTicket update:", error)
    return { ok: false, error: "Não foi possível registrar sua avaliação.", status: 500 }
  }

  return { ok: true }
}

// ────────────────────────────────────────────
// Admin
// ────────────────────────────────────────────

export type AdminSupportTicketRow = SupportTicketSummary & {
  user_id: string
  user_display_name: string | null
}

/** Fila do admin — 1 SELECT liso (todos os campos usados na listagem já estão denormalizados em support_tickets), enriquecido só com o nome do solicitante em lote. */
export async function listSupportTicketsForAdmin(filters: {
  status?: SupportTicketStatus | "all"
  waitingOn?: SupportWaitingOn | "all"
  userId?: string
  dateFrom?: string
  dateTo?: string
  page?: number
  pageSize?: number
}): Promise<{ tickets: AdminSupportTicketRow[]; total: number }> {
  const db = createSupabaseAdminClient()
  const currentPage = clampPage(filters.page)
  const size = clampPageSize(filters.pageSize, 50, 20)

  let query = db
    .from("support_tickets")
    .select(`${TICKET_SUMMARY_COLUMNS}, user_id`, { count: "exact" })
    .order("last_message_at", { ascending: false })
    .range(...rangeFor(currentPage, size))

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status)
  }
  if (filters.waitingOn && filters.waitingOn !== "all") {
    query = query.eq("waiting_on", filters.waitingOn)
  }
  if (filters.userId) {
    query = query.eq("user_id", filters.userId)
  }
  if (filters.dateFrom) {
    query = query.gte("created_at", filters.dateFrom)
  }
  if (filters.dateTo) {
    query = query.lte("created_at", filters.dateTo)
  }

  const { data, count, error } = await query

  if (error) {
    console.error("[support-repository] listSupportTicketsForAdmin:", error)
    return { tickets: [], total: 0 }
  }

  const rows = (data ?? []) as unknown as (SupportTicketSummary & { user_id: string })[]
  const profiles = await getUserProfiles(rows.map((r) => r.user_id))

  return {
    tickets: rows.map((row) => ({
      ...row,
      user_display_name: profiles[row.user_id]?.display_name ?? null,
    })),
    total: count ?? 0,
  }
}

export type SupportCustomerOption = { userId: string; name: string }

/** Busca de clientes por nome, pro combobox de filtro da fila do admin (só usuários com pelo menos um ticket). */
export async function searchSupportCustomers(query: string, limit = 20): Promise<SupportCustomerOption[]> {
  const matches = await searchUserProfiles(query, limit * 3)
  if (matches.length === 0) return []

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("support_tickets")
    .select("user_id")
    .in("user_id", matches.map((m) => m.id))

  if (error) {
    console.error("[support-repository] searchSupportCustomers:", error)
    return []
  }

  const ticketedIds = new Set((data ?? []).map((row) => (row as { user_id: string }).user_id))
  return matches
    .filter((m) => ticketedIds.has(m.id))
    .slice(0, limit)
    .map((m) => ({ userId: m.id, name: m.display_name }))
}

export type AdminSupportTicketDetail = SupportTicketDetail & {
  user_id: string
  user_display_name: string | null
  user_email: string | null
}

/** Detalhe + thread para o admin — inclui contato do solicitante (sem filtro de ownership, qualquer admin autorizado pode ver). */
export async function getSupportTicketForAdmin(
  ticketId: string
): Promise<{ ticket: AdminSupportTicketDetail; messages: SupportMessageRow[] } | null> {
  const db = createSupabaseAdminClient()
  const { data: ticket, error } = await db
    .from("support_tickets")
    .select(`${TICKET_SUMMARY_COLUMNS}, rating_comment, rated_at, closed_at, user_id`)
    .eq("id", ticketId)
    .maybeSingle()

  if (error) {
    console.error("[support-repository] getSupportTicketForAdmin:", error)
    return null
  }
  if (!ticket) return null

  const [{ data: messages, error: messagesError }, labels, profiles, { data: authUser }] = await Promise.all([
    db
      .from("support_messages")
      .select("id, sender_type, sender_id, sender_name, body, image_urls, created_at")
      .eq("ticket_id", ticketId)
      .order("created_at", { ascending: true }),
    resolveOrderAndProductLabels(ticket.order_id, ticket.product_id),
    getUserProfiles([ticket.user_id]),
    db.auth.admin.getUserById(ticket.user_id),
  ])

  if (messagesError) {
    console.error("[support-repository] getSupportTicketForAdmin messages:", messagesError)
    return null
  }

  return {
    ticket: {
      ...(ticket as unknown as SupportTicketDetail & { user_id: string }),
      ...labels,
      user_display_name: profiles[ticket.user_id]?.display_name ?? null,
      user_email: authUser?.user?.email ?? null,
    },
    messages: (messages ?? []) as unknown as SupportMessageRow[],
  }
}

/** Resposta do admin — sem restrição de turno (a trigger só barra `sender_type = 'user'`); admin pode responder quantas vezes quiser. */
export async function postAdminSupportReply(params: {
  ticketId: string
  adminId: string
  adminName: string
  body: string
  imageUrls?: string[]
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: ticket, error: ticketError } = await db
    .from("support_tickets")
    .select("id, status")
    .eq("id", params.ticketId)
    .maybeSingle()

  if (ticketError) {
    console.error("[support-repository] postAdminSupportReply lookup:", ticketError)
    return { ok: false, error: "Não foi possível enviar a resposta.", status: 500 }
  }
  if (!ticket) {
    return { ok: false, error: "Chamado não encontrado.", status: 404 }
  }

  const { error } = await db.from("support_messages").insert({
    ticket_id: params.ticketId,
    sender_type: "admin",
    sender_id: params.adminId,
    sender_name: params.adminName,
    body: params.body,
    image_urls: params.imageUrls ?? [],
  })

  if (error) {
    if (error.code === PG_RAISE_EXCEPTION) {
      return { ok: false, error: error.message, status: 409 }
    }
    console.error("[support-repository] postAdminSupportReply insert:", error)
    return { ok: false, error: "Não foi possível enviar a resposta.", status: 500 }
  }

  return { ok: true }
}

/** Fecha o ticket como resolvido ou cancelado. Idempotente: se já fechado, não reescreve. */
export async function closeSupportTicket(params: {
  ticketId: string
  status: "resolved" | "cancelled"
  adminId: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: ticket, error: ticketError } = await db
    .from("support_tickets")
    .select("id, status")
    .eq("id", params.ticketId)
    .maybeSingle()

  if (ticketError) {
    console.error("[support-repository] closeSupportTicket lookup:", ticketError)
    return { ok: false, error: "Não foi possível encerrar o chamado.", status: 500 }
  }
  if (!ticket) {
    return { ok: false, error: "Chamado não encontrado.", status: 404 }
  }
  if (ticket.status !== "open") {
    return { ok: true }
  }

  const { error } = await db
    .from("support_tickets")
    .update({
      status: params.status,
      waiting_on: "closed",
      closed_at: new Date().toISOString(),
      closed_by: params.adminId,
    })
    .eq("id", params.ticketId)

  if (error) {
    console.error("[support-repository] closeSupportTicket update:", error)
    return { ok: false, error: "Não foi possível encerrar o chamado.", status: 500 }
  }

  return { ok: true }
}

/**
 * Reabre um ticket encerrado (resolvido ou cancelado). Quem reabre é sempre
 * o admin, então o turno some pro lado de quem mandou a última mensagem:
 * se foi o admin, o cliente é quem deve responder (`waiting_on: 'user'`);
 * se foi o cliente (ex.: ticket cancelado sem resposta), continua faltando
 * o admin responder. Idempotente: se já aberto, não reescreve.
 */
export async function reopenSupportTicket(params: {
  ticketId: string
}): Promise<RepositoryResult> {
  const db = createSupabaseAdminClient()

  const { data: ticket, error: ticketError } = await db
    .from("support_tickets")
    .select("id, status, last_message_sender")
    .eq("id", params.ticketId)
    .maybeSingle()

  if (ticketError) {
    console.error("[support-repository] reopenSupportTicket lookup:", ticketError)
    return { ok: false, error: "Não foi possível reabrir o chamado.", status: 500 }
  }
  if (!ticket) {
    return { ok: false, error: "Chamado não encontrado.", status: 404 }
  }
  if (ticket.status === "open") {
    return { ok: true }
  }

  const waitingOn: SupportWaitingOn = ticket.last_message_sender === "admin" ? "user" : "admin"

  const { error } = await db
    .from("support_tickets")
    .update({
      status: "open",
      waiting_on: waitingOn,
      closed_at: null,
      closed_by: null,
    })
    .eq("id", params.ticketId)

  if (error) {
    console.error("[support-repository] reopenSupportTicket update:", error)
    return { ok: false, error: "Não foi possível reabrir o chamado.", status: 500 }
  }

  return { ok: true }
}

/** Contagem para o badge da sidebar — 1 query `head: true` sobre o índice parcial idx_support_tickets_waiting_admin, sem trazer linhas. */
export async function countSupportTicketsAwaitingAdmin(): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("status", "open")
    .eq("waiting_on", "admin")

  if (error) {
    console.error("[support-repository] countSupportTicketsAwaitingAdmin:", error)
    return 0
  }
  return count ?? 0
}

/** Contagem "meus tickets aguardando minha resposta" — badge amber no sino e em "Meus Tickets". Mesmo padrão de countSupportTicketsAwaitingAdmin, escopado por usuário via idx_support_tickets_user_waiting. */
export async function countMySupportTicketsAwaitingUser(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { count, error } = await db
    .from("support_tickets")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("status", "open")
    .eq("waiting_on", "user")

  if (error) {
    console.error("[support-repository] countMySupportTicketsAwaitingUser:", error)
    return 0
  }
  return count ?? 0
}

export type SupportTicketStats = {
  open: number
  resolved: number
  cancelled: number
}

/** Contagem por status pro card de resumo da dashboard/fila do admin — 3 `head: true` em paralelo, sem trazer linhas. */
export async function getSupportTicketStats(): Promise<SupportTicketStats> {
  const db = createSupabaseAdminClient()
  const [openRes, resolvedRes, cancelledRes] = await Promise.all([
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "open"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "resolved"),
    db.from("support_tickets").select("id", { count: "exact", head: true }).eq("status", "cancelled"),
  ])

  if (openRes.error) console.error("[support-repository] getSupportTicketStats open:", openRes.error)
  if (resolvedRes.error) console.error("[support-repository] getSupportTicketStats resolved:", resolvedRes.error)
  if (cancelledRes.error) console.error("[support-repository] getSupportTicketStats cancelled:", cancelledRes.error)

  return {
    open: openRes.count ?? 0,
    resolved: resolvedRes.count ?? 0,
    cancelled: cancelledRes.count ?? 0,
  }
}
