import "server-only"

import type { NotificationEntityType, NotificationType } from "@/lib/database.types"
import { createSupabaseAdminClient } from "@/lib/server/supabase/admin-client"

/**
 * Repositório de notificações. A produção das notificações é toda por trigger
 * no banco (ver 20260819_notifications.sql) — nada aqui cria aviso a partir de
 * evento do app. Este arquivo só lê, marca como lida e apaga.
 *
 * O texto exibido não vem do banco: o front monta a frase a partir de `type`,
 * `actorName` e `amount`, para respeitar o idioma escolhido na hora de ler
 * (e não o da hora em que a notificação nasceu). `system` é a exceção, e por
 * isso carrega `title`/`body` próprios.
 */

export type Notification = {
  id: string
  type: NotificationType
  actorName: string | null
  entityType: NotificationEntityType | null
  link: string | null
  title: string | null
  body: string | null
  amount: number | null
  isRead: boolean
  createdAt: string
}

/** Tamanho de página — "carregar mais" busca um lote por vez. */
const DEFAULT_LIMIT = 20
const MAX_LIMIT = 50

export type NotificationsPage = {
  notifications: Notification[]
  unreadCount: number
  hasMore: boolean
}

/**
 * Lista as notificações do usuário (mais recentes primeiro), paginadas por
 * offset, e o total de não lidas.
 *
 * O `unreadCount` é uma contagem própria (`head: true`, sem trazer linhas),
 * não o número de não lidas dentro da página: com mais avisos que o limite,
 * derivar da lista mostraria um badge menor que a realidade. `hasMore` pede
 * um item a mais que `limit` e descarta o excedente, evitando um segundo
 * round-trip de `count` só pra saber se ainda há próxima página.
 */
export async function listNotifications(
  userId: string,
  options: { limit?: number; offset?: number } = {}
): Promise<NotificationsPage> {
  const db = createSupabaseAdminClient()
  const safeLimit = Math.min(Math.max(options.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
  const safeOffset = Math.max(options.offset ?? 0, 0)

  const [list, unread] = await Promise.all([
    db
      .from("notifications")
      .select("id, type, actor_name, entity_type, link, title, body, amount, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(safeOffset, safeOffset + safeLimit),
    db
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false),
  ])

  if (list.error) {
    console.error("[notifications-repository] listNotifications:", list.error)
    throw list.error
  }
  if (unread.error) {
    console.error("[notifications-repository] unreadCount:", unread.error)
  }

  const rows = list.data ?? []
  const hasMore = rows.length > safeLimit

  return {
    notifications: rows.slice(0, safeLimit).map((row) => ({
      id: row.id,
      type: row.type,
      actorName: row.actor_name,
      entityType: row.entity_type,
      link: row.link,
      title: row.title,
      body: row.body,
      amount: row.amount,
      isRead: row.is_read,
      createdAt: row.created_at,
    })),
    unreadCount: unread.count ?? 0,
    hasMore,
  }
}

/**
 * Marca notificações como lidas. Sem `ids`, marca todas as do usuário.
 *
 * O `eq("user_id", userId)` não é redundante mesmo com ids explícitos: este
 * repositório usa o service role, que ignora RLS, então o filtro por dono é a
 * única coisa impedindo alguém de marcar a notificação de outra pessoa.
 */
export async function markNotificationsRead(userId: string, ids?: string[]): Promise<number> {
  const db = createSupabaseAdminClient()

  let query = db
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false)

  if (ids && ids.length > 0) query = query.in("id", ids)

  const { data, error } = await query.select("id")

  if (error) {
    console.error("[notifications-repository] markNotificationsRead:", error)
    throw error
  }
  return data?.length ?? 0
}

/**
 * Marca notificações como não lidas. Usado pelo toggle manual do sino, pra
 * quem quer "guardar pra depois" um aviso que a abertura do painel já leu.
 */
export async function markNotificationsUnread(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0

  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("notifications")
    .update({ is_read: false })
    .eq("user_id", userId)
    .in("id", ids)
    .select("id")

  if (error) {
    console.error("[notifications-repository] markNotificationsUnread:", error)
    throw error
  }
  return data?.length ?? 0
}

/** Apaga uma notificação do próprio usuário. */
export async function deleteNotification(userId: string, id: string): Promise<void> {
  const db = createSupabaseAdminClient()
  const { error } = await db.from("notifications").delete().eq("user_id", userId).eq("id", id)
  if (error) {
    console.error("[notifications-repository] deleteNotification:", error)
    throw error
  }
}

/** Apaga todas as notificações do usuário — botão "Limpar" do painel. */
export async function deleteAllNotifications(userId: string): Promise<number> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("notifications")
    .delete()
    .eq("user_id", userId)
    .select("id")

  if (error) {
    console.error("[notifications-repository] deleteAllNotifications:", error)
    throw error
  }
  return data?.length ?? 0
}

/**
 * Dispara um aviso do sistema. Sem `userId`, vai para todos os usuários.
 * Usado pela tela `/admin/notificacoes`.
 */
export async function broadcastSystemNotification(params: {
  title: string
  body: string
  link?: string | null
  userId?: string | null
}): Promise<number> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db.rpc("broadcast_system_notification", {
    p_title: params.title,
    p_body: params.body,
    p_link: params.link ?? null,
    p_user_id: params.userId ?? null,
  })
  if (error) {
    console.error("[notifications-repository] broadcastSystemNotification:", error)
    throw error
  }
  return data ?? 0
}

export type SentSystemNotice = {
  title: string
  body: string
  link: string | null
  sentAt: string
  recipients: number
  read: number
}

/** Quantos avisos recentes o painel mostra no histórico. */
const RECENT_NOTICES = 10

/**
 * Histórico de avisos do sistema já enviados, do mais recente para o mais
 * antigo, com quantas pessoas receberam e quantas já leram.
 *
 * Um broadcast grava uma linha POR destinatário, todas com o mesmo
 * `created_at` (o `insert ... select` usa o timestamp da transação). O
 * agrupamento aqui desfaz isso e devolve um item por envio — sem ele, um
 * aviso para 59 pessoas apareceria 59 vezes na tela.
 */
export async function listSentSystemNotices(): Promise<SentSystemNotice[]> {
  const db = createSupabaseAdminClient()
  // Teto generoso: agrupar em SQL exigiria uma view; com o volume de avisos
  // esperado (raros), agrupar em memória sai mais barato que manter uma.
  const { data, error } = await db
    .from("notifications")
    .select("title, body, link, created_at, is_read")
    .eq("type", "system")
    .order("created_at", { ascending: false })
    .limit(2000)

  if (error) {
    console.error("[notifications-repository] listSentSystemNotices:", error)
    throw error
  }

  const groups = new Map<string, SentSystemNotice>()
  for (const row of data ?? []) {
    const key = `${row.created_at}|${row.title}|${row.body}`
    const existing = groups.get(key)
    if (existing) {
      existing.recipients += 1
      if (row.is_read) existing.read += 1
      continue
    }
    groups.set(key, {
      title: row.title ?? "",
      body: row.body ?? "",
      link: row.link,
      sentAt: row.created_at,
      recipients: 1,
      read: row.is_read ? 1 : 0,
    })
  }

  return [...groups.values()].slice(0, RECENT_NOTICES)
}

export type NotificationTarget = { id: string; name: string }

/** Usuários que podem receber um aviso individual, para o seletor do painel. */
export async function listNotificationTargets(): Promise<NotificationTarget[]> {
  const db = createSupabaseAdminClient()
  const { data, error } = await db
    .from("user_profiles")
    .select("id, display_name")
    .order("display_name", { ascending: true })

  if (error) {
    console.error("[notifications-repository] listNotificationTargets:", error)
    throw error
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.display_name ?? "Sem nome",
  }))
}
