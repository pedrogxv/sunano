"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { LifeBuoy } from "lucide-react"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import BoxLoader from "@/components/ui/box-loader"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"
import { useSupportTickets, type SupportTicketStatus } from "@/lib/hooks/use-support-tickets"
import { cn } from "@/lib/utils"

const STATUS_LABEL: Record<SupportTicketStatus, string> = {
  open: "Aberto",
  resolved: "Resolvido",
  cancelled: "Cancelado",
}

const STATUS_STYLE: Record<SupportTicketStatus, string> = {
  open: "bg-sky-500/15 text-sky-400",
  resolved: "bg-emerald-500/15 text-emerald-400",
  cancelled: "bg-muted text-muted-foreground",
}

export default function MeusTicketsPage() {
  const { profile, loading: profileLoading } = useOwnProfile()
  const { tickets, loading: ticketsLoading } = useSupportTickets()

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
          <h2 className="text-sm font-semibold uppercase tracking-wider text-foreground">Meus Tickets</h2>
          <p className="text-xs text-muted-foreground">Chamados abertos com o suporte da Sunano.</p>
        </div>

        {ticketsLoading ? (
          <div className="flex justify-center py-12">
            <BoxLoader />
          </div>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border py-16 text-center">
            <LifeBuoy className="size-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Você ainda não abriu nenhum chamado.</p>
            <Link href="/suporte" className="text-xs font-medium text-emerald-400 hover:underline">
              Abrir um chamado
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((ticket) => (
              <Link
                key={ticket.id}
                href={`/conta/suporte/${ticket.id}`}
                className="block rounded-xl border border-border bg-muted/20 p-4 transition-colors hover:border-border/70"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1.5 flex flex-wrap items-center gap-2">
                      <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", STATUS_STYLE[ticket.status])}>
                        {STATUS_LABEL[ticket.status]}
                      </span>
                      {ticket.status === "open" && (
                        <span
                          className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                            ticket.waiting_on === "user"
                              ? "bg-amber-500/15 text-amber-400"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {ticket.waiting_on === "user" ? "Aguardando sua resposta" : "Aguardando o suporte"}
                        </span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(ticket.last_message_at), { addSuffix: true, locale: ptBR })}
                      </span>
                    </div>
                    <p className="truncate text-sm font-medium text-foreground">{ticket.subject}</p>
                    {ticket.last_message_preview && (
                      <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{ticket.last_message_preview}</p>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
