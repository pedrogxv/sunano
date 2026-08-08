"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { enUS, ptBR } from "date-fns/locale"
import {
  AtSign,
  Bell,
  Circle,
  CircleCheck,
  Flame,
  Heart,
  Loader2,
  Megaphone,
  MessageSquare,
  Newspaper,
  Reply,
  UserPlus,
  X,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useAuthUser } from "@/components/providers/auth-context"
import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import type { NotificationType } from "@/lib/database.types"
import { cn } from "@/lib/utils"

type Notification = {
  id: string
  type: NotificationType
  actorName: string | null
  link: string | null
  title: string | null
  body: string | null
  amount: number | null
  isRead: boolean
  createdAt: string
}

/** Acima disso o badge vira "9+" — números maiores estouram o círculo. */
const BADGE_CAP = 9

/** Intervalo do polling. Não há realtime aqui; 60s é o suficiente para um sino. */
const POLL_MS = 60_000

/** Tamanho de cada página buscada — tanto na carga inicial quanto no "carregar mais". */
const PAGE_SIZE = 20

const ICONS: Record<NotificationType, typeof Bell> = {
  aura_received: Flame,
  post_comment: MessageSquare,
  comment_reply: Reply,
  new_follower: UserPlus,
  system: Megaphone,
  mention: AtSign,
  new_post: Newspaper,
}

const ICON_TONE: Record<NotificationType, string> = {
  aura_received: "bg-violet-500/15 text-violet-400",
  post_comment: "bg-sky-500/15 text-sky-400",
  comment_reply: "bg-teal-500/15 text-teal-400",
  new_follower: "bg-amber-500/15 text-amber-400",
  system: "bg-primary/15 text-primary",
  mention: "bg-rose-500/15 text-rose-400",
  new_post: "bg-emerald-500/15 text-emerald-400",
}

function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))
}

/**
 * Monta a frase da notificação na hora de exibir (e não na hora de gravar),
 * para que trocar de idioma reescreva também o histórico. Ver comentário em
 * `notifications-repository.ts`.
 */
function buildMessage(n: Notification, t: ReturnType<typeof useT>): string {
  const name = n.actorName ?? "Alguém"
  switch (n.type) {
    case "aura_received":
      return n.actorName
        ? fill(t.notifications.auraFromActor, { name, amount: n.amount ?? 0 })
        : fill(t.notifications.auraSelf, { amount: n.amount ?? 0 })
    case "post_comment":
      return fill(t.notifications.postComment, { name })
    case "comment_reply":
      return fill(t.notifications.commentReply, { name })
    case "new_follower":
      return fill(t.notifications.newFollower, { name })
    case "mention":
      return fill(t.notifications.mention, { name })
    case "new_post":
      return fill(t.notifications.newPost, { name })
    case "system":
      return n.title ?? t.notifications.systemTitle
  }
}

export function NotificationBell() {
  const t = useT()
  const { locale } = useLocale()
  const { user } = useAuthUser()
  const dateLocale = locale === "en-US" ? enUS : ptBR

  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  // Ids que estavam por ler quando o painel abriu. Abrir marca tudo como lido
  // no servidor, mas o destaque visual precisa sobreviver a esse instante —
  // senão o usuário abre e não distingue o que era novo.
  const highlighted = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?limit=${PAGE_SIZE}`)
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
  }, [])

  useEffect(() => {
    if (!user) {
      setItems([])
      setUnread(0)
      setLoaded(false)
      return
    }
    void load()
    const id = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(id)
  }, [user, load])

  const loadMore = async () => {
    setLoadingMore(true)
    try {
      const res = await fetch(`/api/notifications?limit=${PAGE_SIZE}&offset=${items.length}`)
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
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      highlighted.current = new Set()
      return
    }

    highlighted.current = new Set(items.filter((n) => !n.isRead).map((n) => n.id))

    if (unread === 0) {
      void load()
      return
    }

    // Otimista: o badge zera na hora e os itens visíveis viram "lidos" no
    // estado local. O recarregamento só vem DEPOIS do POST — invertido, a
    // resposta do GET (ainda com as não lidas) chegaria por último e
    // reacenderia o badge até o próximo poll.
    setUnread(0)
    setItems((current) => current.map((n) => ({ ...n, isRead: true })))
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .catch(() => {})
      .finally(() => void load())
  }

  const toggleRead = async (n: Notification) => {
    const nextRead = !n.isRead
    setItems((current) => current.map((it) => (it.id === n.id ? { ...it, isRead: nextRead } : it)))
    setUnread((count) => Math.max(0, count + (nextRead ? -1 : 1)))
    highlighted.current.delete(n.id)

    const res = await fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [n.id], read: nextRead }),
    }).catch(() => null)

    if (!res?.ok) {
      setItems((current) => current.map((it) => (it.id === n.id ? { ...it, isRead: n.isRead } : it)))
      setUnread((count) => Math.max(0, count + (nextRead ? 1 : -1)))
    }
  }

  const dismiss = async (id: string) => {
    const previous = items
    const wasUnread = previous.find((n) => n.id === id)?.isRead === false
    setItems((current) => current.filter((n) => n.id !== id))
    if (wasUnread) setUnread((count) => Math.max(0, count - 1))
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) {
      setItems(previous)
      if (wasUnread) setUnread((count) => count + 1)
    }
  }

  const clearAll = async () => {
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
  }

  // O sino só existe para quem tem conta — deslogado não tem o que notificar.
  if (!user) return null

  const badge = unread > BADGE_CAP ? `${BADGE_CAP}+` : String(unread)

  return (
    <>
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `${t.notifications.ariaLabel} (${badge})` : t.notifications.ariaLabel
          }
          className="relative flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card/70 text-sm font-medium text-foreground transition-all hover:bg-muted/40 sm:h-8 sm:w-auto sm:px-3"
        >
          <Bell className="size-[15px] text-primary" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex min-w-[18px] items-center justify-center rounded-full bg-violet-500 px-1 text-[10px] font-bold leading-[18px] text-white shadow-sm">
              {badge}
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        sideOffset={8}
        className="flex w-[min(22rem,calc(100vw-2rem))] max-h-[min(32rem,calc(var(--radix-popover-content-available-height)-2rem))] flex-col border-border bg-popover p-0 text-foreground shadow-xl"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2.5">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{t.notifications.title}</span>
            {unread > 0 && (
              <span className="text-xs text-muted-foreground">
                {unread === 1
                  ? t.notifications.unreadOne
                  : fill(t.notifications.unreadMany, { count: unread })}
              </span>
            )}
          </div>
          {items.length > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={() => setConfirmClearOpen(true)}
              disabled={clearing}
              className="text-muted-foreground hover:text-destructive"
            >
              {clearing ? t.notifications.clearing : t.notifications.clearAll}
            </Button>
          )}
        </div>

        {failed ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {t.notifications.error}
          </p>
        ) : !loaded ? (
          <ul className="divide-y divide-border">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-start gap-2.5 px-3 py-2.5 pr-16">
                <span className="mt-0.5 size-7 shrink-0 animate-pulse rounded-lg bg-muted/40" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <span className="block h-3.5 w-4/5 animate-pulse rounded-md bg-muted/40" />
                  <span className="block h-3 w-1/3 animate-pulse rounded-md bg-muted/40" />
                </div>
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <Heart className="size-5 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{t.notifications.empty}</p>
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 max-h-[26rem]">
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const Icon = ICONS[n.type]
                const isNew = highlighted.current.has(n.id)
                const message = buildMessage(n, t)
                // Corpo do aviso do sistema, trecho do comentário recebido, ou
                // título do post pra quem foi notificado de um post novo.
                const preview = n.type === "new_post" ? n.title : n.body

                const row = (
                  <div className="flex items-start gap-2.5">
                    <span
                      className={cn(
                        "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
                        ICON_TONE[n.type]
                      )}
                    >
                      <Icon className="size-[14px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-foreground">{message}</p>
                      {preview && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {preview}
                        </p>
                      )}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
                        {formatDistanceToNow(new Date(n.createdAt), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </span>
                    </div>
                    {(isNew || !n.isRead) && (
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet-500" />
                    )}
                  </div>
                )

                return (
                  <li
                    key={n.id}
                    className={cn("group relative", isNew && "bg-violet-500/[0.06]")}
                  >
                    {n.link ? (
                      <Link
                        href={n.link}
                        onClick={() => setOpen(false)}
                        className="block px-3 py-2.5 pr-16 transition-colors hover:bg-muted/40"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="px-3 py-2.5 pr-16">{row}</div>
                    )}

                    <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 opacity-0 transition-all focus-within:opacity-100 group-hover:opacity-100">
                      <button
                        type="button"
                        aria-label={n.isRead ? t.notifications.markUnread : t.notifications.markRead}
                        onClick={() => void toggleRead(n)}
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                      >
                        {n.isRead ? (
                          <Circle className="size-3.5" />
                        ) : (
                          <CircleCheck className="size-3.5" />
                        )}
                      </button>
                      <button
                        type="button"
                        aria-label={t.notifications.dismiss}
                        onClick={() => void dismiss(n.id)}
                        className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>

            {hasMore && (
              <div className="p-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="w-full text-muted-foreground"
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="size-3.5 animate-spin" />
                      {t.notifications.loadingMore}
                    </>
                  ) : (
                    t.notifications.loadMore
                  )}
                </Button>
              </div>
            )}
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>

    <AlertDialog open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.notifications.clearAll}</AlertDialogTitle>
          <AlertDialogDescription>{t.notifications.clearAllConfirm}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => void clearAll()}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {t.notifications.clearAll}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
