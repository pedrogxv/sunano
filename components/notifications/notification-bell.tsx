"use client"

import { useRef, useState } from "react"
import Link from "next/link"
import { enUS, ptBR } from "date-fns/locale"
import { Bell, Heart, Loader2 } from "lucide-react"

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
import { Skeleton } from "@/components/ui/skeleton"
import { useAuthUser } from "@/components/providers/auth-context"
import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import { useNotifications } from "@/lib/hooks/use-notifications"
import { NotificationRow, fill } from "@/components/notifications/notification-row"

/** Acima disso o badge vira "9+" — números maiores estouram o círculo. */
const BADGE_CAP = 9

/** Tamanho de cada página buscada — tanto na carga inicial quanto no "carregar mais". */
const PAGE_SIZE = 20

export function NotificationBell() {
  const t = useT()
  const { locale } = useLocale()
  const { user } = useAuthUser()
  const dateLocale = locale === "en-US" ? enUS : ptBR

  const [open, setOpen] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)

  const {
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
  } = useNotifications({ pageSize: PAGE_SIZE })

  // Ids que estavam por ler quando o painel abriu. Abrir marca tudo como lido
  // no servidor, mas o destaque visual precisa sobreviver a esse instante —
  // senão o usuário abre e não distingue o que era novo.
  const highlighted = useRef<Set<string>>(new Set())

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      highlighted.current = new Set()
      return
    }

    highlighted.current = new Set(items.filter((n) => !n.isRead).map((n) => n.id))

    if (unread === 0) {
      void reload()
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
      .finally(() => void reload())
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
          className="animate-fade-in-up relative flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-card/70 text-sm font-medium text-foreground transition-all hover:bg-muted/40 sm:h-8 sm:w-auto sm:px-3"
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
        className="flex w-[min(22rem,calc(100vw-2rem))] max-h-[min(32rem,calc(var(--radix-popover-content-available-height)-2rem))] flex-col bg-popover p-0 text-foreground shadow-md"
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
                <Skeleton className="mt-0.5 size-7 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-1/3" />
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
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  t={t}
                  dateLocale={dateLocale}
                  isNew={highlighted.current.has(n.id)}
                  onToggleRead={(item) => void toggleRead(item)}
                  onDismiss={(id) => void dismiss(id)}
                  onNavigate={() => setOpen(false)}
                />
              ))}
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

        {items.length > 0 && (
          <div className="shrink-0 border-t border-border p-2">
            <Link
              href="/conta/notificacoes"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2 py-1.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/40 hover:text-foreground"
            >
              {t.notifications.viewAll}
            </Link>
          </div>
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
