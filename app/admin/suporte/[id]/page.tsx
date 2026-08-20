import { revalidatePath } from "next/cache"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Package, ShoppingBag } from "lucide-react"

import { hasAdminPermission } from "@/lib/admin-permissions"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  closeSupportTicket,
  getSupportTicketForAdmin,
  postAdminSupportReply,
  reopenSupportTicket,
} from "@/lib/server/repositories/support-repository"
import { MAX_SUPPORT_IMAGES_PER_MESSAGE } from "@/lib/server/support-media"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { SupportReplyImageUpload } from "@/components/admin/SupportReplyImageUpload"
import { SupportReplySubmitButton } from "@/components/admin/SupportReplySubmitButton"
import { SupportReplyTextarea } from "@/components/admin/SupportReplyTextarea"
import { SupportTicketStatusActions } from "@/components/admin/SupportTicketStatusActions"
import { Badge } from "@/components/ui/badge"

const STATUS_LABELS = { open: "Aberto", resolved: "Resolvido", cancelled: "Cancelado" } as const
const STATUS_BADGE = {
  open: "bg-sky-500/15 text-sky-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
} as const

async function replyAction(ticketId: string, formData: FormData) {
  "use server"
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "support_write")) return

  const body = String(formData.get("body") ?? "").trim()
  if (!body) return
  const imageUrls = formData
    .getAll("imageUrls")
    .map(String)
    .filter(Boolean)
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
  const { ticket, messages } = result

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin/suporte" parentLabel="Suporte" currentLabel={ticket.subject} />

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className={`text-[10px] ${STATUS_BADGE[ticket.status]}`}>
                {STATUS_LABELS[ticket.status]}
              </Badge>
              {ticket.status === "open" && (
                <Badge variant="secondary" className="text-[10px] text-muted-foreground">
                  {ticket.waiting_on === "admin" ? "Aguardando você" : "Aguardando o cliente"}
                </Badge>
              )}
            </div>
            <h1 className="text-xl font-bold text-foreground">{ticket.subject}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {ticket.user_display_name ?? "Usuário"}
              {ticket.user_email ? ` · ${ticket.user_email}` : ""}
            </p>
          </div>
        </div>

        {(ticket.order_number || ticket.product_name) && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-border pt-3">
            {ticket.order_number && (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground">
                <Package className="size-3.5" />
                Pedido #{ticket.order_number}
              </span>
            )}
            {ticket.product_name && ticket.product_id && (
              <Link
                href={`/admin/store/${ticket.product_id}`}
                target="_blank"
                className="inline-flex items-center gap-1.5 rounded-lg bg-muted/40 px-2.5 py-1 text-xs text-primary hover:underline"
              >
                <ShoppingBag className="size-3.5" />
                {ticket.product_name}
              </Link>
            )}
          </div>
        )}

        {ticket.status !== "open" && (
          <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
            Encerrado {ticket.closed_at ? formatDistanceToNow(new Date(ticket.closed_at), { addSuffix: true, locale: ptBR }) : ""}
            {ticket.rating && (
              <p className="mt-1 text-foreground">
                Avaliação do cliente: {"★".repeat(ticket.rating)}{"☆".repeat(5 - ticket.rating)}
                {ticket.rating_comment && (
                  <span className="text-muted-foreground"> — &ldquo;{ticket.rating_comment}&rdquo;</span>
                )}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`max-w-[85%] rounded-xl border p-3 ${
              message.sender_type === "admin"
                ? "ml-auto border-primary/30 bg-primary/10"
                : "border-border bg-card"
            }`}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">{message.sender_name}</span>
              <span>{formatDistanceToNow(new Date(message.created_at), { addSuffix: true, locale: ptBR })}</span>
            </div>
            <p className="whitespace-pre-wrap text-sm text-foreground">{message.body}</p>
            {message.image_urls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {message.image_urls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt="Anexo" className="size-20 rounded-lg border border-border object-cover" />
                  </a>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {canWrite && ticket.status === "open" && (
        <div className="space-y-3 rounded-xl border border-border bg-card p-4">
          <form action={replyAction.bind(null, ticket.id)} className="space-y-3">
            <SupportReplyTextarea />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <SupportReplyImageUpload />
              <SupportReplySubmitButton />
            </div>
          </form>

          <SupportTicketStatusActions
            status={ticket.status}
            onResolve={closeAction.bind(null, ticket.id, "resolved")}
            onCancel={closeAction.bind(null, ticket.id, "cancelled")}
            onReopen={reopenAction.bind(null, ticket.id)}
          />
        </div>
      )}

      {canWrite && ticket.status !== "open" && (
        <div className="rounded-xl border border-border bg-card p-4">
          <SupportTicketStatusActions
            status={ticket.status}
            onResolve={closeAction.bind(null, ticket.id, "resolved")}
            onCancel={closeAction.bind(null, ticket.id, "cancelled")}
            onReopen={reopenAction.bind(null, ticket.id)}
          />
        </div>
      )}
    </div>
  )
}
