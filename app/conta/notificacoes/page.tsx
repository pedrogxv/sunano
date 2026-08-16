"use client"

import { enUS, ptBR } from "date-fns/locale"
import { Bell, Loader2 } from "lucide-react"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"
import { useNotifications } from "@/lib/hooks/use-notifications"
import { useLocale } from "@/components/providers/locale-context"
import { useT } from "@/lib/use-t"
import { NotificationRow } from "@/components/notifications/notification-row"

/** Página maior que o popover, sem necessidade do polling de 60s do sino. */
const PAGE_SIZE = 30

export default function NotificacoesPage() {
  const { profile, loading: profileLoading } = useOwnProfile()
  const t = useT()
  const { locale } = useLocale()
  const dateLocale = locale === "en-US" ? enUS : ptBR

  const { items, loaded, failed, hasMore, loadingMore, loadMore, toggleRead, dismiss } =
    useNotifications({ pageSize: PAGE_SIZE, poll: false })

  if (profileLoading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <BoxLoader />
      </div>
    )
  }

  return (
    <div className="pb-16">
      <AccountPageHeader profile={profile} />

      <div className="mx-auto max-w-4xl px-2 py-8 sm:px-4 md:px-6">
        <div className="mb-6 space-y-1">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">
            {t.notifications.historyTitle}
          </h2>
          <p className="text-xs text-muted-foreground">{t.notifications.historySubtitle}</p>
        </div>

        {failed ? (
          <p className="py-12 text-center text-sm text-muted-foreground">{t.notifications.error}</p>
        ) : !loaded ? (
          <div className="flex justify-center py-12">
            <BoxLoader />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <Bell className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t.notifications.empty}</p>
          </div>
        ) : (
          <div className="rounded-xl border border-border">
            <ul className="divide-y divide-border">
              {items.map((n) => (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  t={t}
                  dateLocale={dateLocale}
                  isNew={false}
                  onToggleRead={(item) => void toggleRead(item)}
                  onDismiss={(id) => void dismiss(id)}
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
          </div>
        )}
      </div>
    </div>
  )
}
