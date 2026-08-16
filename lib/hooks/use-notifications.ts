"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuthUser } from "@/components/providers/auth-context"
import type { NotificationEntityType, NotificationType } from "@/lib/database.types"

export type Notification = {
  id: string
  type: NotificationType
  actorName: string | null
  entityType: NotificationEntityType | null
  /** Id da linha referida (ex.: comentário) — usado pra rolar até ela ao clicar. */
  entityId: string | null
  link: string | null
  title: string | null
  body: string | null
  amount: number | null
  isRead: boolean
  createdAt: string
}

/** Intervalo do polling. Não há realtime aqui; 60s é o suficiente para um sino. */
const POLL_MS = 60_000

export type UseNotificationsOptions = {
  pageSize?: number
  /** Desliga o polling — útil numa página de histórico, que o usuário já está olhando. */
  poll?: boolean
}

export type UseNotificationsResult = {
  items: Notification[]
  unread: number
  loaded: boolean
  failed: boolean
  hasMore: boolean
  loadingMore: boolean
  setItems: React.Dispatch<React.SetStateAction<Notification[]>>
  setUnread: React.Dispatch<React.SetStateAction<number>>
  reload: () => Promise<void>
  loadMore: () => Promise<void>
  toggleRead: (n: Notification) => Promise<void>
  dismiss: (id: string) => Promise<void>
  clearAll: () => Promise<void>
  clearing: boolean
}

/**
 * Lógica de leitura/paginação/gestão de notificações, compartilhada entre o
 * sino (`NotificationBell`) e a página de histórico completo
 * (`/conta/notificacoes`). A lógica de highlight-otimista-ao-abrir-popover
 * não mora aqui: é específica de UX de popover e fica em `NotificationBell`.
 */
export function useNotifications(options: UseNotificationsOptions = {}): UseNotificationsResult {
  const { user } = useAuthUser()
  const pageSize = options.pageSize ?? 20
  const poll = options.poll ?? true

  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [clearing, setClearing] = useState(false)

  const reload = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?limit=${pageSize}`)
      if (!res.ok) throw new Error("failed")
      const data = await res.json()
      setItems(data.notifications ?? [])
      setUnread(data.unreadCount ?? 0)
      setHasMore(data.hasMore ?? false)
      setFailed(false)
    } catch {
      setFailed(true)
    } finally {
      setLoaded(true)
    }
  }, [pageSize])

  useEffect(() => {
    if (!user) {
      setItems([])
      setUnread(0)
      setLoaded(false)
      return
    }
    void reload()
    if (!poll) return
    const id = setInterval(() => void reload(), POLL_MS)
    return () => clearInterval(id)
  }, [user, reload, poll])

  const loadMore = useCallback(async () => {
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/notifications?limit=${pageSize}&offset=${items.length}`)
      if (!res.ok) throw new Error("failed")
      const data = await res.json()
      const next: Notification[] = data.notifications ?? []
      setItems((current) => [...current, ...next])
      setHasMore(data.hasMore ?? false)
    } catch {
      // silencioso: o botão "carregar mais" continua disponível pra nova tentativa
    } finally {
      setLoadingMore(false)
    }
  }, [pageSize, items.length])

  const toggleRead = useCallback(async (n: Notification) => {
    const nextRead = !n.isRead
    setItems((current) => current.map((it) => (it.id === n.id ? { ...it, isRead: nextRead } : it)))
    setUnread((count) => Math.max(0, count + (nextRead ? -1 : 1)))

    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [n.id], read: nextRead }),
    }).catch(() => null)

    if (!res?.ok) {
      setItems((current) => current.map((it) => (it.id === n.id ? { ...it, isRead: n.isRead } : it)))
      setUnread((count) => Math.max(0, count + (nextRead ? 1 : -1)))
    }
  }, [])

  const dismiss = useCallback(async (id: string) => {
    let previous: Notification[] = []
    let wasUnread = false
    setItems((current) => {
      previous = current
      wasUnread = current.find((n) => n.id === id)?.isRead === false
      return current.filter((n) => n.id !== id)
    })
    if (wasUnread) setUnread((count) => Math.max(0, count - 1))
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) {
      setItems(previous)
      if (wasUnread) setUnread((count) => count + 1)
    }
  }, [])

  const clearAll = useCallback(async () => {
    if (items.length === 0) return

    const previous = items
    const previousUnread = unread
    const previousHasMore = hasMore
    setClearing(true)
    setItems([])
    setUnread(0)
    setHasMore(false)

    const res = await fetch("/api/notifications", { method: "DELETE" }).catch(() => null)
    setClearing(false)
    if (!res?.ok) {
      setItems(previous)
      setUnread(previousUnread)
      setHasMore(previousHasMore)
    }
  }, [items, unread, hasMore])

  return {
    items,
    unread,
    loaded,
    failed,
    hasMore,
    loadingMore,
    setItems,
    setUnread,
    reload,
    loadMore,
    toggleRead,
    dismiss,
    clearAll,
    clearing,
  }
}
