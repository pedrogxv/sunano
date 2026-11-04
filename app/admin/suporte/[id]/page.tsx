import { revalidatePath } from "next/cache"
import { RouteLink } from "@/components/ui/route-link"
import { notFound, redirect } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  History,
  LifeBuoy,
  Mail,
  MessagesSquare,
  Package,
  ShoppingBag,
  Star,
  UserRound,
  XCircle,
} from "lucide-react"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  closeSupportTicket,
  getSupportTicketForAdmin,
  postAdminSupportReply,
  reopenSupportTicket,
} from "@/lib/server/repositories/support-repository"
import { isOwnedAdminSupportImageUrl, MAX_SUPPORT_IMAGES_PER_MESSAGE } from "@/lib/server/support-media"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { SupportReplyImageUpload } from "@/components/admin/SupportReplyImageUpload"
import { SupportReplySubmitButton } from "@/components/admin/SupportReplySubmitButton"
import { SupportReplyTextarea } from "@/components/admin/SupportReplyTextarea"
import { SupportTicketStatusActions } from "@/components/admin/SupportTicketStatusActions"
import { ProfileAvatar } from "@/components/ui/ProfileAvatar"
import { safeHref } from "@/lib/safe-url"
import { profilePath } from "@/lib/profile-name"
import { cn } from "@/lib/utils"

const STATUS_META = {
  open: {
    label: "Aberto",
    icon: Clock,
    pill: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  },
  resolved: {
    label: "Resolvido",
    icon: CheckCircle2,
    pill: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  },
  cancelled: {
    label: "Cancelado",
    icon: XCircle,
    pill: "border-border bg-muted/60 text-muted-foreground",
  },
} as const

// O servidor roda em UTC: sem o fuso fixo, "14:05" do cliente sairia "17:05".
const TIME_ZONE = "America/Sao_Paulo"

function dayKey(iso: string | Date): string {
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TIME_ZONE })
}

function dayLabel(iso: string): string {
  const key = dayKey(iso)
  if (key === dayKey(new Date())) return "Hoje"
  if (key === dayKey(new Date(Date.now() - 86_400_000))) return "Ontem"
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "long", year: "numeric" })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { timeZone: TIME_ZONE, hour: "2-digit", minute: "2-digit" })
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function relative(iso: string): string {
  return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR })
}

/** Mensagens seguidas do mesmo remetente em até 10 min viram um bloco só (foto e nome uma vez). */
const GROUP_WINDOW_MS = 10 * 60_000

async function replyAction(ticketId: string, formData: FormData) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_write")) return

  const body = String(formData.get("body") ?? "").trim()
  if (!body) return
  // Só anexo que ESTE admin subiu em /api/admin/support/upload-image. Sem o
  // filtro, a action aceitava o nome de qualquer objeto do bucket `support` e
  // a leitura o assinava para o cliente, expondo o print de outro cliente.
  const imageUrls = formData
    .getAll("imageUrls")
    .map(String)
    .filter((url) => url && isOwnedAdminSupportImageUrl(url, auth.profile!.id))
    .slice(0, MAX_SUPPORT_IMAGES_PER_MESSAGE)

  await postAdminSupportReply({
    ticketId,
    adminId: auth.profile.id,
    adminName: auth.profile.display_name?.trim() || "Suporte Sunano",
    body,
    imageUrls,
  })

  revalidatePath(`/admin/suporte/${ticketId}`)
  revalidatePath("/admin/suporte")
}

async function closeAction(ticketId: string, status: "resolved" | "cancelled") {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_write")) return

  await closeSupportTicket({ ticketId, status, adminId: auth.profile.id })

  revalidatePath(`/admin/suporte/${ticketId}`)
  revalidatePath("/admin/suporte")
}

async function reopenAction(ticketId: string) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_write")) return

  await reopenSupportTicket({ ticketId })

  revalidatePath(`/admin/suporte/${ticketId}`)
  revalidatePath("/admin/suporte")
}

export default async function AdminSupportTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_read")) {
    redirect("/admin")
  }
  const canWrite = hasAdminPermission(auth.profile, "support_write")

  const { id } = await params
  const result = await getSupportTicketForAdmin(id)
  if (!result) notFound()
  const { ticket, messages, participants } = result

  const status = STATUS_META[ticket.status]
  const StatusIcon = status.icon
  const customer = participants[ticket.user_id]
  const customerName = ticket.user_display_name ?? customer?.display_name ?? "Usuário"
  const waitingOnAdmin = ticket.status === "open" && ticket.waiting_on === "admin"

  return (
    <div className="space-y-5">
      <BackBreadcrumb href="/admin/suporte" parentLabel="Ticket" currentLabel={ticket.subject} />

      {/* Cabeçalho */}
      <header className="rounded-2xl border border-border bg-card px-4 py-4 sm:px-6 sm:py-5">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold",
              status.pill
            )}
          >
            <StatusIcon className="size-3" />
            {status.label}
          </span>
          {ticket.status === "open" && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
                waitingOnAdmin
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                  : "border-border text-muted-foreground"
              )}
            >
              <span className="relative flex size-1.5">
                {waitingOnAdmin && (
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-amber-400 opacity-75" />
                )}
                <span
                  className={cn(
                    "relative inline-flex size-1.5 rounded-full",
                    waitingOnAdmin ? "bg-amber-400" : "bg-muted-foreground"
                  )}
                />
              </span>
              {waitingOnAdmin ? "Aguardando você" : "Aguardando o cliente"}
            </span>
          )}
        </div>

        <h1 className="mt-3 break-words text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {ticket.subject}
        </h1>

        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground sm:text-sm">
          <span className="font-mono">#{ticket.id.slice(0, 8)}</span>
          <span aria-hidden>·</span>
          <span>
            Aberto por <span className="text-foreground">{customerName}</span> {relative(ticket.created_at)}
          </span>
          <span aria-hidden>·</span>
          <span>
            {messages.length} mensage{messages.length === 1 ? "m" : "ns"}
          </span>
        </p>
      </header>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Conversa */}
        <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3 sm:px-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <MessagesSquare className="size-4 text-muted-foreground" />
              Conversa
            </h2>
            <span className="text-xs text-muted-foreground">Última atividade {relative(ticket.last_message_at)}</span>
          </div>

          <ol className="px-3 py-4 sm:px-5 sm:py-5">
            {messages.map((message, index) => {
              const previous = messages[index - 1]
              const isAdmin = message.sender_type === "admin"
              const newDay = !previous || dayKey(previous.created_at) !== dayKey(message.created_at)
              const grouped =
                !newDay &&
                previous.sender_id === message.sender_id &&
                new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < GROUP_WINDOW_MS
              const sender = participants[message.sender_id]

              return (
                <li key={message.id} className={cn(index > 0 && (grouped ? "mt-1.5" : "mt-5"))}>
                  {newDay && (
                    <div className={cn("mb-5 flex items-center gap-3", index > 0 && "mt-2")}>
                      <span className="h-px flex-1 bg-border" />
                      <span className="text-[11px] font-medium text-muted-foreground">{dayLabel(message.created_at)}</span>
                      <span className="h-px flex-1 bg-border" />
                    </div>
                  )}

                  <div className={cn("flex items-start gap-2.5 sm:gap-3", isAdmin && "flex-row-reverse")}>
                    <div className="hidden w-8 shrink-0 sm:block">
                      {!grouped && (
                        <ProfileAvatar
                          name={message.sender_name}
                          avatarUrl={sender?.avatar_url}
                          frame={sender?.frame}
                          size="sm"
                        />
                      )}
                    </div>

                    <div
                      className={cn(
                        "flex min-w-0 max-w-[92%] flex-col sm:max-w-[78%]",
                        isAdmin ? "items-end" : "items-start"
                      )}
                    >
                      {!grouped && (
                        <div
                          className={cn(
                            "mb-1.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5",
                            isAdmin && "flex-row-reverse"
                          )}
                        >
                          <span className="text-[13px] font-semibold text-foreground">{message.sender_name}</span>
                          <span className="text-[11px] text-muted-foreground">{isAdmin ? "Equipe" : "Cliente"}</span>
                          <time
                            dateTime={message.created_at}
                            title={formatDateTime(message.created_at)}
                            className="text-[11px] tabular-nums text-muted-foreground"
                          >
                            {formatTime(message.created_at)}
                          </time>
                        </div>
                      )}
                      <div
                        className={cn(
                          "rounded-2xl border px-3.5 py-2.5 text-sm leading-relaxed text-foreground sm:px-4",
                          isAdmin
                            ? "rounded-tr-md border-sky-500/20 bg-sky-500/[0.07]"
                            : "rounded-tl-md border-border bg-muted/40"
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">{message.body}</p>
                        {message.image_urls.length > 0 && (
                          <div className="mt-2.5 flex flex-wrap gap-2">
                            {message.image_urls.map((url) => (
                              <a
                                key={url}
                                href={safeHref(url)}
                                target="_blank"
                                rel="noreferrer"
                                className="overflow-hidden rounded-lg border border-border transition-opacity hover:opacity-80"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt="Anexo" className="size-20 object-cover sm:size-24" />
                              </a>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              )
            })}

            {ticket.status !== "open" && (
              <li className="mt-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                  <StatusIcon className="size-3" />
                  Chamado {status.label.toLowerCase()}
                  {ticket.closed_at && ` ${relative(ticket.closed_at)}`}
                </span>
                <span className="h-px flex-1 bg-border" />
              </li>
            )}
          </ol>

          {canWrite && ticket.status === "open" && (
            <form action={replyAction.bind(null, ticket.id)} className="border-t border-border p-3 sm:p-4">
              <div className="overflow-hidden rounded-xl border border-border bg-background/40 transition-colors focus-within:border-ring">
                <SupportReplyTextarea />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-2 py-2">
                  <SupportReplyImageUpload />
                  <SupportReplySubmitButton />
                </div>
              </div>
            </form>
          )}
        </section>

        {/* Lateral: vira grade de 2 colunas no tablet e coluna fixa no desktop */}
        <aside className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-4 lg:grid-cols-1">
          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-4 text-xs font-medium text-muted-foreground">Cliente</h2>
            <div className="flex items-center gap-3">
              <ProfileAvatar
                name={customerName}
                avatarUrl={customer?.avatar_url}
                frame={customer?.frame}
                size="md"
              />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-foreground">{customerName}</p>
                {customer?.display_slug && (
                  <RouteLink
                    href={profilePath(customer.display_slug)}
                    target="_blank"
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Ver perfil
                    <ArrowUpRight className="size-3" />
                  </RouteLink>
                )}
              </div>
            </div>

            <dl className="mt-4 space-y-2.5 border-t border-border pt-4 text-xs">
              {ticket.user_email && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <Mail className="size-3.5" />
                    E-mail
                  </dt>
                  <dd className="min-w-0">
                    <a
                      href={`mailto:${ticket.user_email}`}
                      className="block truncate text-foreground hover:underline"
                      title={ticket.user_email}
                    >
                      {ticket.user_email}
                    </a>
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <UserRound className="size-3.5" />
                  Membro desde
                </dt>
                <dd className="text-foreground">
                  {customer?.member_since
                    ? new Date(customer.member_since).toLocaleDateString("pt-BR", {
                        timeZone: TIME_ZONE,
                        month: "short",
                        year: "numeric",
                      })
                    : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex items-center gap-2 text-muted-foreground">
                  <LifeBuoy className="size-3.5" />
                  Chamados abertos
                </dt>
                <dd className="tabular-nums text-foreground">{ticket.user_ticket_count}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
            <h2 className="mb-4 text-xs font-medium text-muted-foreground">Detalhes</h2>
            <dl className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                  Aberto em
                </dt>
                <dd className="text-right text-foreground">{formatDateTime(ticket.created_at)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                  <History className="size-3.5" />
                  Última atividade
                </dt>
                <dd className="text-right text-foreground">{relative(ticket.last_message_at)}</dd>
              </div>
              {ticket.closed_at && ticket.status !== "open" && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <StatusIcon className="size-3.5" />
                    Encerrado em
                  </dt>
                  <dd className="text-right text-foreground">{formatDateTime(ticket.closed_at)}</dd>
                </div>
              )}
              {ticket.order_number && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <Package className="size-3.5" />
                    Pedido
                  </dt>
                  <dd className="font-mono text-foreground">#{ticket.order_number}</dd>
                </div>
              )}
              {ticket.product_name && ticket.product_id && (
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <ShoppingBag className="size-3.5" />
                    Produto
                  </dt>
                  <dd className="min-w-0">
                    <RouteLink
                      href={`/admin/store/${ticket.product_id}`}
                      target="_blank"
                      className="flex items-center gap-1 text-foreground hover:underline"
                    >
                      <span className="truncate">{ticket.product_name}</span>
                      <ArrowUpRight className="size-3 shrink-0" />
                    </RouteLink>
                  </dd>
                </div>
              )}
            </dl>

            {ticket.rating && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="mb-2 text-xs text-muted-foreground">Avaliação do cliente</p>
                <div className="flex items-center gap-0.5" aria-label={`${ticket.rating} de 5 estrelas`}>
                  {Array.from({ length: 5 }, (_, i) => (
                    <Star
                      key={i}
                      className={cn(
                        "size-4",
                        i < ticket.rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                      )}
                    />
                  ))}
                </div>
                {ticket.rating_comment && (
                  <p className="mt-2 break-words text-xs italic text-muted-foreground">
                    &ldquo;{ticket.rating_comment}&rdquo;
                  </p>
                )}
              </div>
            )}

            {canWrite && (
              <div className="mt-4 border-t border-border pt-4">
                <SupportTicketStatusActions
                  status={ticket.status}
                  onResolve={closeAction.bind(null, ticket.id, "resolved")}
                  onCancel={closeAction.bind(null, ticket.id, "cancelled")}
                  onReopen={reopenAction.bind(null, ticket.id)}
                />
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
