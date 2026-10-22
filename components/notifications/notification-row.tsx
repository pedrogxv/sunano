import { RouteLink } from "@/components/ui/route-link"
import type { Locale } from "date-fns"
import {
  AtSign,
  Bell,
  Circle,
  CircleCheck,
  Flame,
  LifeBuoy,
  Megaphone,
  MessageSquare,
  Newspaper,
  Package,
  PackageCheck,
  PackagePlus,
  Medal,
  Reply,
  ShoppingBag,
  UserPlus,
  Wallet,
  X,
} from "lucide-react"
import { AuraFlameIcon } from "@/components/ui/AuraIcon"

import type { Notification } from "@/lib/hooks/use-notifications"
import type { NotificationType } from "@/lib/database.types"
import type { CategoryKey } from "@/lib/i18n"
import type { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

// `React.ElementType` e não `typeof Bell`: o ícone de Aura é o componente
// central do site (`AuraFlameIcon`), não um ícone do lucide — amarrar o mapa
// ao tipo da lib impedia justamente a troca do símbolo da moeda.
export const ICONS: Record<NotificationType, React.ElementType> = {
  aura_received: AuraFlameIcon,
  post_comment: MessageSquare,
  comment_reply: Reply,
  new_follower: UserPlus,
  system: Megaphone,
  mention: AtSign,
  new_post: Newspaper,
  order_status: Package,
  support_reply: LifeBuoy,
  support_new_ticket: LifeBuoy,
  support_user_reply: LifeBuoy,
  support_status: CircleCheck,
  store_restock: PackageCheck,
  affiliate_payout: Wallet,
  rank_frame: Medal,
  peripheral_request_status: PackagePlus,
  order_paid: ShoppingBag,
  peripheral_request_new: PackagePlus,
}

export const ICON_TONE: Record<NotificationType, string> = {
  aura_received: "bg-orange-500/15 text-orange-500",
  post_comment: "bg-sky-500/15 text-sky-400",
  comment_reply: "bg-teal-500/15 text-teal-400",
  new_follower: "bg-amber-500/15 text-amber-400",
  system: "bg-primary/15 text-primary",
  mention: "bg-rose-500/15 text-rose-400",
  new_post: "bg-emerald-500/15 text-emerald-400",
  order_status: "bg-indigo-500/15 text-indigo-400",
  support_reply: "bg-cyan-500/15 text-cyan-400",
  support_new_ticket: "bg-cyan-500/15 text-cyan-400",
  support_user_reply: "bg-cyan-500/15 text-cyan-400",
  support_status: "bg-cyan-500/15 text-cyan-400",
  store_restock: "bg-emerald-500/15 text-emerald-400",
  affiliate_payout: "bg-green-500/15 text-green-400",
  rank_frame: "bg-fuchsia-500/15 text-fuchsia-400",
  peripheral_request_status: "bg-violet-500/15 text-violet-400",
  order_paid: "bg-emerald-500/15 text-emerald-400",
  peripheral_request_new: "bg-violet-500/15 text-violet-400",
}

export function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""))
}

/** Tipos cujo `entityId` aponta pra um comentário — únicos que ganham âncora de rolagem. */
const COMMENT_NOTIFICATION_TYPES: readonly NotificationType[] = ["post_comment", "comment_reply", "mention"]

/**
 * Link final da notificação: comentário/resposta/menção recebe `#comment-{id}`
 * pra `CommentsSection` rolar até o comentário e destacá-lo ao chegar na
 * página — sem isso o link só levava ao topo do post.
 */
export function notificationHref(n: Notification): string | null {
  if (!n.link) return null
  if (!n.entityId || !COMMENT_NOTIFICATION_TYPES.includes(n.type)) return n.link
  return `${n.link}#comment-${n.entityId}`
}

/** Nome do evento que cada `CommentRow` escuta pra rolar/destacar-se — ver `notificationHref`. */
export const SCROLL_TO_COMMENT_EVENT = "sunano:scroll-to-comment"

/**
 * Dispara a rolagem até o comentário da hash atual. Clicar num link do Next
 * para a MESMA página só troca a hash sem recarregar — o navegador não repete
 * o scroll automático da 1ª carga, então cada clique precisa provocar isto de
 * novo manualmente (a página de destino, se diferente, já rola sozinha ao
 * montar, lendo a hash da própria URL — ver `useScrollHighlight` em `CommentRow`).
 */
export function requestScrollToCommentHash(hash: string) {
  const id = hash.startsWith("#comment-") ? hash.slice("#comment-".length) : null
  if (!id) return
  window.dispatchEvent(new CustomEvent<string>(SCROLL_TO_COMMENT_EVENT, { detail: id }))
}

/**
 * Monta a frase da notificação na hora de exibir (e não na hora de gravar),
 * para que trocar de idioma reescreva também o histórico. Ver comentário em
 * `notifications-repository.ts`. Exceção: `system`, `order_status` e
 * `affiliate_payout` gravam
 * `title`/`body` prontos, porque não têm template bilíngue.
 */
export function buildMessage(n: Notification, t: ReturnType<typeof useT>): string {
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
    case "order_status":
      return n.title ?? t.notifications.orderStatusFallback
    case "support_reply":
      return fill(t.notifications.supportReply, { name })
    case "support_new_ticket":
      return fill(t.notifications.supportNewTicket, { name })
    case "support_user_reply":
      return fill(t.notifications.supportUserReply, { name })
    case "support_status":
      return fill(t.notifications.supportStatus, { subject: n.title ?? "" })
    case "store_restock":
      return fill(t.notifications.storeRestock, { product: n.title ?? "" })
    // Grava `title` pronto em pt-BR (mesmo caso de `order_status`): o valor
    // do saque faz parte da frase e não cabe num template bilíngue.
    case "affiliate_payout":
      return n.title ?? t.notifications.affiliatePayoutFallback
    // Também grava `title` pronto: o nome da moldura e a colocação entram na
    // frase, e ambos vêm do catálogo em pt-BR (ver `notifyRankFrameGranted`).
    case "rank_frame":
      return n.title ?? t.notifications.rankFrameFallback
    // `title` é marca + modelo do periférico pedido (ver
    // trg_notify_peripheral_request_status); o status vai em `body`.
    case "peripheral_request_status":
      return fill(t.notifications.peripheralRequestStatus, { name: n.title ?? "" })
    // `title` é o número curto do pedido e `body` o resumo (tipo + itens),
    // ambos gravados por trg_notify_admins_order_paid.
    case "order_paid":
      return fill(t.notifications.orderPaid, { name, number: n.title ?? "" })
    // `title` é marca + modelo e `body` a chave da categoria, gravados por
    // trg_notify_staff_peripheral_request.
    case "peripheral_request_new":
      return fill(t.notifications.peripheralRequestNew, { name, model: n.title ?? "" })
  }
}

/** Rótulo do status gravado em `body` por `peripheral_request_status` — ver trg_notify_peripheral_request_status. */
export function peripheralRequestStatusLabel(status: string | null, t: ReturnType<typeof useT>): string {
  switch (status) {
    case "pending":
      return t.notifications.peripheralRequestPending
    case "in_review":
      return t.notifications.peripheralRequestInReview
    case "added":
      return t.notifications.peripheralRequestAdded
    case "duplicate":
      return t.notifications.peripheralRequestDuplicate
    case "rejected":
      return t.notifications.peripheralRequestRejected
    default:
      return status ?? ""
  }
}

/** Rótulo do status gravado em `body` por `support_status` — ver trg_notify_support_status_change. */
export function supportStatusLabel(status: string | null, t: ReturnType<typeof useT>): string {
  switch (status) {
    case "resolved":
      return t.notifications.supportStatusResolved
    case "cancelled":
      return t.notifications.supportStatusCancelled
    case "open":
      return t.notifications.supportStatusReopened
    default:
      return status ?? ""
  }
}

/**
 * Abas do sino. Cada tipo cai em UMA; `null` só aparece em "Todas" (aviso do
 * sistema fala de tudo). Tipo novo sem entrada aqui não quebra nada: some só
 * das abas, segue em "Todas".
 */
export type NotificationFilter = "orders" | "support" | "community" | "aura"

export const NOTIFICATION_FILTER: Record<NotificationType, NotificationFilter | null> = {
  aura_received: "aura",
  rank_frame: "aura",
  post_comment: "community",
  comment_reply: "community",
  new_follower: "community",
  mention: "community",
  new_post: "community",
  peripheral_request_status: "community",
  peripheral_request_new: "community",
  order_status: "orders",
  order_paid: "orders",
  store_restock: "orders",
  affiliate_payout: "orders",
  support_reply: "support",
  support_new_ticket: "support",
  support_user_reply: "support",
  support_status: "support",
  system: null,
}

export type NotificationDayGroup = "today" | "yesterday" | "week" | "older"

/** Fatia de tempo de uma notificação, pelo dia do calendário local (não por 24h corridas). */
export function notificationDayGroup(createdAt: string, now = new Date()): NotificationDayGroup {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const at = new Date(createdAt).getTime()
  const day = 86_400_000
  if (at >= startOfToday) return "today"
  if (at >= startOfToday - day) return "yesterday"
  if (at >= startOfToday - 6 * day) return "week"
  return "older"
}

/**
 * Hora curta do canto da linha ("há 2 h", "ontem", "12 de out."). A frase
 * longa do date-fns ("há cerca de 2 horas") quebrava em duas linhas no sino e
 * competia com a mensagem; a exata fica no `title`.
 */
export function shortNotificationTime(createdAt: string, localeCode: string, now = Date.now()): string {
  const at = new Date(createdAt)
  const diffSec = Math.round((at.getTime() - now) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(localeCode, { style: "narrow", numeric: "auto" })
  if (abs < 60) return rtf.format(0, "second")
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute")
  if (abs < 86_400) return rtf.format(Math.round(diffSec / 3600), "hour")
  if (abs < 7 * 86_400) return rtf.format(Math.round(diffSec / 86_400), "day")
  return at.toLocaleDateString(localeCode, { day: "numeric", month: "short" })
}

export type NotificationRowProps = {
  notification: Notification
  t: ReturnType<typeof useT>
  dateLocale: Locale
  isNew: boolean
  onToggleRead: (n: Notification) => void
  onDismiss: (id: string) => void
  /** Chamado ao clicar no link da notificação — o popover do sino usa isto para fechar. */
  onNavigate?: () => void
}

/** Uma notificação — usado tanto pelo popover do sino quanto por `/conta/notificacoes`. */
export function NotificationRow({
  notification: n,
  t,
  dateLocale,
  isNew,
  onToggleRead,
  onDismiss,
  onNavigate,
}: NotificationRowProps) {
  // Fallback para tipo que o banco já grava e este build ainda não conhece:
  // sem ele, `ICONS[tipo novo]` é undefined e o React derruba a lista inteira
  // do sino. Acontece sempre que a migration de um aviso novo sobe antes do
  // deploy do front que o desenha.
  const Icon = ICONS[n.type] ?? Bell
  const message = buildMessage(n, t)
  // Só o aviso do sistema, pedido e "post novo" mostram um trecho extra
  // (corpo do aviso, status, título do post) — comentário/resposta não
  // exibe o texto da mensagem em si, só o aviso de que chegou.
  const preview =
    n.type === "system" ||
    n.type === "order_status" ||
    n.type === "support_reply" ||
    n.type === "support_new_ticket" ||
    n.type === "support_user_reply" ||
    n.type === "order_paid" ||
    // `store_restock` grava a cor que voltou em `body` (null quando o aviso
    // era do produto inteiro).
    n.type === "store_restock"
      ? n.body
      : n.type === "support_status"
        ? supportStatusLabel(n.body, t)
        : n.type === "peripheral_request_status"
          ? peripheralRequestStatusLabel(n.body, t)
          : n.type === "peripheral_request_new"
            ? (n.body && t.categories.labels[n.body as CategoryKey]) || n.body
            : n.type === "new_post"
              ? n.title
              : null

  const href = notificationHref(n)
  const unread = isNew || !n.isRead
  const localeCode = dateLocale.code ?? "pt-BR"

  const row = (
    <div className="flex items-start gap-3">
      <span className="relative mt-0.5 shrink-0">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-xl",
            ICON_TONE[n.type] ?? "bg-muted text-muted-foreground"
          )}
        >
          <Icon
            className={cn("size-4", n.type === "aura_received" && "nav-fire-icon")}
            {...(n.type === "aura_received" ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
          />
        </span>
        {/* Não lida: ponto preso no ícone, como num app de mensagens. Do lado
            direito ele brigava com a hora e os botões. */}
        {unread && (
          <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-violet-500 ring-2 ring-popover" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[13px] leading-snug", unread ? "font-medium text-foreground" : "text-foreground/85")}>
          {message}
        </p>
        {preview && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{preview}</p>
        )}
      </div>
      <time
        dateTime={n.createdAt}
        title={new Date(n.createdAt).toLocaleString(localeCode)}
        className="mt-0.5 shrink-0 text-[11px] tabular-nums text-muted-foreground/80 transition-opacity [@media(hover:hover)]:group-hover:opacity-0"
      >
        {shortNotificationTime(n.createdAt, localeCode)}
      </time>
    </div>
  )

  return (
    <li className="group relative">
      {href ? (
        <RouteLink
          href={href}
          onClick={() => {
            onNavigate?.()
            const hash = href.includes("#") ? href.slice(href.indexOf("#")) : ""
            if (!hash) return
            // Se o link é pra página em que já se está, o Next só troca a hash
            // sem "navegar" de fato — precisamos pedir a rolagem manualmente.
            // Se for outra página, a espera é inofensiva: o próprio destino
            // já rola sozinho ao montar, lendo a hash da URL (`useScrollHighlight`).
            window.setTimeout(() => requestScrollToCommentHash(hash), 60)
          }}
          className={cn(
            "block rounded-xl px-2.5 py-2.5 transition-colors hover:bg-muted/50",
            isNew && "bg-violet-500/[0.07]"
          )}
        >
          {row}
        </RouteLink>
      ) : (
        <div className={cn("rounded-xl px-2.5 py-2.5", isNew && "bg-violet-500/[0.07]")}>{row}</div>
      )}

      {/* Ações por cima da hora, que some no hover. Em tela de toque seguem
          só pelo foco, como antes: abrir já marca tudo como lido. */}
      <div className="absolute right-1.5 top-1.5 flex items-center gap-0.5 rounded-lg bg-muted opacity-0 shadow-sm transition-opacity focus-within:opacity-100 [@media(hover:hover)]:group-hover:opacity-100">
        <button
          type="button"
          aria-label={n.isRead ? t.notifications.markUnread : t.notifications.markRead}
          title={n.isRead ? t.notifications.markUnread : t.notifications.markRead}
          onClick={() => onToggleRead(n)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {n.isRead ? <Circle className="size-3.5" /> : <CircleCheck className="size-3.5" />}
        </button>
        <button
          type="button"
          aria-label={t.notifications.dismiss}
          title={t.notifications.dismiss}
          onClick={() => onDismiss(n.id)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  )
}

const DAY_GROUP_ORDER: NotificationDayGroup[] = ["today", "yesterday", "week", "older"]

/**
 * Lista agrupada por dia ("Hoje", "Ontem"...), a mesma no sino e no histórico.
 * O rótulo do grupo é `sticky`: rolando o sino, a pessoa sempre sabe de quando
 * é o que está lendo, sem a frase de tempo longa em cada linha.
 */
export function NotificationList({
  items,
  isNew,
  stickyClassName = "bg-popover/95",
  sticky = true,
  ...rowProps
}: Omit<NotificationRowProps, "notification" | "isNew"> & {
  items: Notification[]
  isNew: (n: Notification) => boolean
  /** Fundo do rótulo fixo, igual ao do container (popover ou página). */
  stickyClassName?: string
  /** false na página: lá a TopBar fixa cobriria o rótulo. */
  sticky?: boolean
}) {
  const { t } = rowProps
  const labels: Record<NotificationDayGroup, string> = {
    today: t.notifications.groupToday,
    yesterday: t.notifications.groupYesterday,
    week: t.notifications.groupWeek,
    older: t.notifications.groupOlder,
  }
  const now = new Date()
  const groups = new Map<NotificationDayGroup, Notification[]>()
  for (const n of items) {
    const key = notificationDayGroup(n.createdAt, now)
    groups.set(key, [...(groups.get(key) ?? []), n])
  }

  return (
    <div className="space-y-1">
      {DAY_GROUP_ORDER.filter((key) => groups.has(key)).map((key) => (
        <section key={key}>
          <h3
            className={cn(
              "px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground",
              sticky && ["sticky top-0 z-10 backdrop-blur-sm", stickyClassName]
            )}
          >
            {labels[key]}
          </h3>
          <ul className="space-y-0.5 px-1.5">
            {groups.get(key)!.map((n) => (
              <NotificationRow key={n.id} notification={n} isNew={isNew(n)} {...rowProps} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
