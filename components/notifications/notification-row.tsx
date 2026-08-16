import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import type { Locale } from "date-fns"
import {
  AtSign,
  Bell,
  Circle,
  CircleCheck,
  Flame,
  Megaphone,
  MessageSquare,
  Newspaper,
  Package,
  Reply,
  UserPlus,
  X,
} from "lucide-react"

import type { Notification } from "@/lib/hooks/use-notifications"
import type { NotificationType } from "@/lib/database.types"
import type { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

export const ICONS: Record<NotificationType, typeof Bell> = {
  aura_received: Flame,
  post_comment: MessageSquare,
  comment_reply: Reply,
  new_follower: UserPlus,
  system: Megaphone,
  mention: AtSign,
  new_post: Newspaper,
  order_status: Package,
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
 * `notifications-repository.ts`. Exceção: `system` e `order_status` gravam
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
  }
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
  const Icon = ICONS[n.type]
  const message = buildMessage(n, t)
  // Só o aviso do sistema, pedido e "post novo" mostram um trecho extra
  // (corpo do aviso, status, título do post) — comentário/resposta não
  // exibe o texto da mensagem em si, só o aviso de que chegou.
  const preview =
    n.type === "system" || n.type === "order_status" ? n.body : n.type === "new_post" ? n.title : null

  const href = notificationHref(n)

  const row = (
    <div className="flex items-start gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
          ICON_TONE[n.type]
        )}
      >
        <Icon
          className={cn("size-[14px]", n.type === "aura_received" && "nav-fire-icon")}
          {...(n.type === "aura_received" ? { fill: "currentColor", strokeWidth: 1.5 } : {})}
        />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug text-foreground">{message}</p>
        {preview && (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{preview}</p>
        )}
        <span className="mt-0.5 block text-[11px] text-muted-foreground/80">
          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true, locale: dateLocale })}
        </span>
      </div>
      {(isNew || !n.isRead) && <span className="mt-2 size-1.5 shrink-0 rounded-full bg-violet-500" />}
    </div>
  )

  return (
    <li className={cn("group relative", isNew && "bg-violet-500/[0.06]")}>
      {href ? (
        <Link
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
          onClick={() => onToggleRead(n)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
        >
          {n.isRead ? <Circle className="size-3.5" /> : <CircleCheck className="size-3.5" />}
        </button>
        <button
          type="button"
          aria-label={t.notifications.dismiss}
          onClick={() => onDismiss(n.id)}
          className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-all hover:bg-muted hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      </div>
    </li>
  )
}
