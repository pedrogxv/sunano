"use client"

import { useState } from "react"
import Image from "next/image"
import { RouteLink } from "@/components/ui/route-link"
import { enUS, ptBR } from "date-fns/locale"
import { ArrowRight, Bell, Loader2, Trash2 } from "lucide-react"

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
import {
  NOTIFICATION_FILTER,
  NotificationList,
  fill,
  type NotificationFilter,
} from "@/components/notifications/notification-row"
import { cn } from "@/lib/utils"

/** Acima disso o badge vira "9+" — números maiores estouram o círculo. */
const BADGE_CAP = 9

const FILTERS: NotificationFilter[] = ["orders", "support", "community", "aura"]

/** Tamanho de cada página buscada — tanto na carga inicial quanto no "carregar mais". */
const PAGE_SIZE = 20

export function NotificationBell() {
  const t = useT()
  const { locale } = useLocale()
  const { user } = useAuthUser()
  const dateLocale = locale === "en-US" ? enUS : ptBR

  const [open, setOpen] = useState(false)
  const [confirmClearOpen, setConfirmClearOpen] = useState(false)
  const [filter, setFilter] = useState<NotificationFilter | "all">("all")

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
  const [highlighted, setHighlighted] = useState<Set<string>>(() => new Set())

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setHighlighted(new Set())
      return
    }
    setFilter("all")

    setHighlighted(new Set(items.filter((n) => !n.isRead).map((n) => n.id)))

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

  const FILTER_LABEL: Record<NotificationFilter | "all", string> = {
    all: t.notifications.filterAll,
    orders: t.notifications.filterOrders,
    support: t.notifications.filterSupport,
    community: t.notifications.filterCommunity,
    aura: t.notifications.filterAura,
  }
  // "Novo" = estava por ler quando o painel abriu (o `isRead` já virou true
  // no otimista). Com o painel fechado, é o próprio não lido.
  const isFresh = (id: string, isRead: boolean) => (open ? highlighted.has(id) : !isRead)
  const newCount = items.filter((n) => isFresh(n.id, n.isRead)).length
  const newByFilter = new Map<NotificationFilter, number>()
  const presentFilters = new Set<NotificationFilter>()
  for (const n of items) {
    const key = NOTIFICATION_FILTER[n.type]
    if (!key) continue
    presentFilters.add(key)
    if (isFresh(n.id, n.isRead)) newByFilter.set(key, (newByFilter.get(key) ?? 0) + 1)
  }
  const visibleFilters = FILTERS.filter((key) => presentFilters.has(key))
  const visibleItems = filter === "all" ? items : items.filter((n) => NOTIFICATION_FILTER[n.type] === filter)

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
        className="flex w-[min(24rem,calc(100vw-1.5rem))] max-h-[min(36rem,calc(var(--radix-popover-content-available-height)-1rem))] flex-col overflow-hidden rounded-2xl border-border bg-popover p-0 text-foreground shadow-2xl shadow-black/50"
      >
        {/* Cabeçalho no mesmo idioma do menu de perfil: brilho difuso + trama
            de pontos, o sino num ladrilho e o que chegou de novo num selo. */}
        <div className="relative shrink-0 overflow-hidden">
          <div
            aria-hidden
            className={cn(
              "pointer-events-none absolute -right-10 -top-24 size-52 rounded-full blur-3xl transition-colors",
              newCount > 0 ? "bg-violet-500/25" : "bg-foreground/[0.07]"
            )}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,var(--color-foreground)_1px,transparent_0)] bg-[length:14px_14px] opacity-[0.04] [mask-image:linear-gradient(to_bottom,black,transparent)]"
          />

          <div className="relative flex items-center gap-3 px-3.5 pb-2.5 pt-3.5">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
              <Bell className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-display text-base font-bold leading-tight">{t.notifications.title}</p>
              <p className="text-[11px] text-muted-foreground">
                {newCount > 0 ? (
                  <span className="font-semibold text-violet-400">
                    {newCount === 1 ? t.notifications.newOne : fill(t.notifications.newMany, { count: newCount })}
                  </span>
                ) : (
                  t.notifications.emptyTitle
                )}
              </p>
            </div>
            {items.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                onClick={() => setConfirmClearOpen(true)}
                disabled={clearing}
                aria-label={t.notifications.clearAll}
                title={t.notifications.clearAll}
                className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                {clearing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              </Button>
            )}
          </div>

          {/* Abas por assunto: só aparecem as que têm algo, e a contagem é do
              que é NOVO nelas (o total não ajuda a decidir onde olhar). */}
          {visibleFilters.length > 1 && (
            <div className="relative flex gap-1 overflow-x-auto px-3 pb-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {(["all", ...visibleFilters] as const).map((key) => {
                const active = filter === key
                const fresh = key === "all" ? newCount : newByFilter.get(key) ?? 0
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    aria-pressed={active}
                    className={cn(
                      "flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                      active
                        ? "bg-foreground text-background"
                        : "bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {FILTER_LABEL[key]}
                    {fresh > 0 && (
                      <span
                        className={cn(
                          "min-w-4 rounded-full px-1 text-center text-[10px] font-bold leading-4",
                          active ? "bg-violet-500 text-white" : "bg-violet-500/20 text-violet-300"
                        )}
                      >
                        {fresh}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {failed ? (
          <p className="px-3 py-10 text-center text-sm text-muted-foreground">
            {t.notifications.error}
          </p>
        ) : !loaded ? (
          <ul className="space-y-0.5 p-1.5">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-start gap-3 px-2.5 py-2.5">
                <Skeleton className="size-9 shrink-0 rounded-xl" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-4/5" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </li>
            ))}
          </ul>
        ) : visibleItems.length === 0 ? (
          // Vazio é estado bom ("nada pendente"), não erro: a calopsita
          // comemora em vez do coração cinza de antes.
          <div className="flex flex-col items-center gap-1 px-6 py-8 text-center">
            <Image
              src="/images/mascot/guide/shopping.webp"
              alt=""
              width={88}
              height={88}
              className="mb-1 size-[88px] object-contain opacity-90"
            />
            <p className="text-sm font-semibold text-foreground">
              {items.length === 0 ? t.notifications.emptyTitle : t.notifications.filterEmpty}
            </p>
            {items.length === 0 && (
              <p className="max-w-[16rem] text-xs text-muted-foreground">{t.notifications.emptyHint}</p>
            )}
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1 max-h-[28rem]">
            <div className="pb-1.5">
              <NotificationList
                items={visibleItems}
                isNew={(n) => highlighted.has(n.id)}
                t={t}
                dateLocale={dateLocale}
                onToggleRead={(item) => void toggleRead(item)}
                onDismiss={(id) => void dismiss(id)}
                onNavigate={() => setOpen(false)}
              />
            </div>

            {hasMore && (
              <div className="px-1.5 pb-1.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => void loadMore()}
                  disabled={loadingMore}
                  className="w-full rounded-xl text-muted-foreground"
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
          <div className="shrink-0 p-1.5 pt-0">
            <RouteLink
              href="/conta/notificacoes"
              onClick={() => setOpen(false)}
              className="group flex items-center justify-center gap-1.5 rounded-xl bg-muted/30 px-2 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
            >
              {t.notifications.viewAll}
              <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
            </RouteLink>
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
