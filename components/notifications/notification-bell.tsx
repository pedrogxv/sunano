"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { enUS, ptBR } from "date-fns/locale"
import { Bell, Heart, Megaphone, MessageSquare, Reply, Sparkles, UserPlus, X } from "lucide-react"

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

const ICONS: Record<NotificationType, typeof Bell> = {
  aura_received: Sparkles,
  post_comment: MessageSquare,
  comment_reply: Reply,
  new_follower: UserPlus,
  system: Megaphone,
}

const ICON_TONE: Record<NotificationType, string> = {
  aura_received: "bg-violet-500/15 text-violet-400",
  post_comment: "bg-sky-500/15 text-sky-400",
  comment_reply: "bg-teal-500/15 text-teal-400",
  new_follower: "bg-amber-500/15 text-amber-400",
  system: "bg-primary/15 text-primary",
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

  // Ids que estavam por ler quando o painel abriu. Abrir marca tudo como lido
  // no servidor, mas o destaque visual precisa sobreviver a esse instante —
  // senão o usuário abre e não distingue o que era novo.
  const highlighted = useRef<Set<string>>(new Set())

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications")
      if (!res.ok) throw new Error("failed")
      const data = await res.json()
      setItems(data.notifications ?? [])
      setUnread(data.unreadCount ?? 0)
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

    // Otimista: o badge zera na hora. O recarregamento só vem DEPOIS do POST —
    // invertido, a resposta do GET (ainda com as não lidas) chegaria por
    // último e reacenderia o badge até o próximo poll.
    setUnread(0)
    void fetch("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    })
      .catch(() => {})
      .finally(() => void load())
  }

  const dismiss = async (id: string) => {
    const previous = items
    setItems((current) => current.filter((n) => n.id !== id))
    const res = await fetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => null)
    if (!res?.ok) setItems(previous)
  }

  // O sino só existe para quem tem conta — deslogado não tem o que notificar.
  if (!user) return null

  const badge = unread > BADGE_CAP ? `${BADGE_CAP}+` : String(unread)

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={
            unread > 0 ? `${t.notifications.ariaLabel} (${badge})` : t.notifications.ariaLabel
          }
          className="relative flex h-11 items-center justify-center rounded-lg border border-border bg-card/70 px-3 text-sm font-medium text-foreground transition-all hover:bg-muted/40 md:h-8"
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
        className="w-[min(22rem,calc(100vw-2rem))] border-border bg-popover p-0 text-foreground shadow-xl"
      >
        <div className="flex items-baseline justify-between gap-2 border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold">{t.notifications.title}</span>
          {unread > 0 && (
            <span className="text-xs text-muted-foreground">
              {unread === 1
                ? t.notifications.unreadOne
                : fill(t.notifications.unreadMany, { count: unread })}
            </span>
          )}
        </div>

        {failed ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            {t.notifications.error}
          </p>
        ) : !loaded ? (
          <div className="space-y-2 p-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-12 animate-pulse rounded-lg bg-muted/40" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
            <Heart className="size-5 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">{t.notifications.empty}</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[22rem]">
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const Icon = ICONS[n.type]
                const isNew = highlighted.current.has(n.id)
                const message = buildMessage(n, t)
                // Corpo do aviso do sistema, ou trecho do comentário recebido.
                const preview = n.body

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
                    {isNew && (
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
                        className="block px-3 py-2.5 pr-8 transition-colors hover:bg-muted/40"
                      >
                        {row}
                      </Link>
                    ) : (
                      <div className="px-3 py-2.5 pr-8">{row}</div>
                    )}

                    <button
                      type="button"
                      aria-label={t.notifications.dismiss}
                      onClick={() => void dismiss(n.id)}
                      className="absolute right-1.5 top-1.5 flex size-6 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-muted hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  )
}
