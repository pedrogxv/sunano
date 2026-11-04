"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ChevronRight, MessagesSquare, Plus, Star } from "lucide-react"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import { ProfileLoadError } from "@/components/account/ProfileLoadError"
import { Button } from "@/components/ui/button"
import { SunanoLoader } from "@/components/ui/SunanoLoader"
import {
  TICKET_STATE_META,
  TeamAvatar,
  TicketStatePill,
  relativeTime,
  ticketStateOf,
  type TicketState,
} from "@/components/support/support-chat"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"
import { useSupportTickets, type SupportTicketSummary } from "@/lib/hooks/use-support-tickets"
import { cn } from "@/lib/utils"

type Filter = "all" | "your_turn" | "in_review" | "closed"

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "your_turn", label: "Sua vez" },
  { value: "in_review", label: "Em análise" },
  { value: "closed", label: "Encerrados" },
]

/** Quem espera a pessoa vem primeiro; depois o que está com a equipe; encerrados por último. */
const STATE_ORDER: Record<TicketState, number> = { your_turn: 0, in_review: 1, resolved: 2, cancelled: 2 }

function matches(filter: Filter, state: TicketState): boolean {
  if (filter === "all") return true
  if (filter === "closed") return state === "resolved" || state === "cancelled"
  return filter === state
}

function TicketCard({ ticket }: { ticket: SupportTicketSummary }) {
  const state = ticketStateOf(ticket)
  const meta = TICKET_STATE_META[state]
  const Icon = meta.icon
  const closed = state === "resolved" || state === "cancelled"

  return (
    <Link
      href={`/conta/suporte/${ticket.id}`}
      className={cn(
        "group relative flex items-start gap-3 overflow-hidden rounded-2xl border bg-card p-4 transition-colors hover:bg-muted/30 sm:gap-4 sm:p-5",
        state === "your_turn" ? "border-amber-500/30" : "border-border hover:border-foreground/15"
      )}
    >
      {state === "your_turn" && <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-amber-400" />}

      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl ring-1", meta.tile)}>
        <Icon className="size-[18px]" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className={cn("truncate text-sm font-semibold sm:text-[15px]", closed ? "text-foreground/80" : "text-foreground")}>
            {ticket.subject}
          </p>
          <span className="shrink-0 pt-0.5 text-[11px] text-muted-foreground">{relativeTime(ticket.last_message_at)}</span>
        </div>

        {ticket.last_message_preview && (
          <p className="mt-1 line-clamp-2 text-xs text-muted-foreground sm:line-clamp-1 sm:text-[13px]">
            <span className={cn("font-medium", ticket.last_message_sender === "admin" ? "text-sky-400" : "text-foreground/70")}>
              {ticket.last_message_sender === "admin" ? "Equipe" : "Você"}:
            </span>{" "}
            {ticket.last_message_preview}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <TicketStatePill state={state} />
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <MessagesSquare className="size-3" />
            {ticket.message_count}
          </span>
          <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">#{ticket.id.slice(0, 8)}</span>
          {closed &&
            (ticket.rating ? (
              <span className="inline-flex items-center gap-0.5" aria-label={`Avaliado com ${ticket.rating} de 5`}>
                {[1, 2, 3, 4, 5].map((value) => (
                  <Star
                    key={value}
                    className={cn(
                      "size-3",
                      value <= ticket.rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                    )}
                  />
                ))}
              </span>
            ) : (
              <span className="text-[11px] font-medium text-amber-400">Avaliar atendimento</span>
            ))}
        </div>
      </div>

      <ChevronRight className="mt-2.5 size-4 shrink-0 self-start text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </Link>
  )
}

function TicketCardSkeleton() {
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border bg-card p-5">
      <div className="size-10 shrink-0 animate-pulse rounded-xl bg-muted" />
      <div className="flex-1 space-y-2.5">
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-3 w-3/4 animate-pulse rounded bg-muted/70" />
        <div className="h-5 w-24 animate-pulse rounded-full bg-muted/70" />
      </div>
    </div>
  )
}

export default function MeusTicketsPage() {
  const { profile, loading: profileLoading, error: profileError, reload: reloadProfile } = useOwnProfile()
  const { tickets, loading: ticketsLoading } = useSupportTickets()
  const [filter, setFilter] = useState<Filter>("all")

  const sorted = useMemo(
    () =>
      [...tickets].sort((a, b) => {
        const byState = STATE_ORDER[ticketStateOf(a)] - STATE_ORDER[ticketStateOf(b)]
        return byState || new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()
      }),
    [tickets]
  )
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: tickets.length, your_turn: 0, in_review: 0, closed: 0 }
    for (const ticket of tickets) {
      const state = ticketStateOf(ticket)
      if (state === "your_turn") result.your_turn++
      else if (state === "in_review") result.in_review++
      else result.closed++
    }
    return result
  }, [tickets])
  const visible = sorted.filter((ticket) => matches(filter, ticketStateOf(ticket)))

  if (profileError) return <ProfileLoadError onRetry={reloadProfile} />

  if (profileLoading || !profile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <SunanoLoader />
      </div>
    )
  }

  return (
    <div className="pb-16">
      <AccountPageHeader profile={profile} />

      <div className="mx-auto max-w-4xl px-3 py-6 sm:px-4 sm:py-8 md:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">Meus Tickets</h1>
            <p className="mt-1 text-sm text-muted-foreground">Suas conversas com o suporte da Sunano</p>
          </div>
          <Button asChild className="gap-1.5">
            <Link href="/suporte">
              <Plus className="size-4" />
              Novo chamado
            </Link>
          </Button>
        </div>

        {ticketsLoading ? (
          <div className="mt-6 space-y-3">
            <TicketCardSkeleton />
            <TicketCardSkeleton />
            <TicketCardSkeleton />
          </div>
        ) : tickets.length === 0 ? (
          <div className="mt-6 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <TeamAvatar className="size-16" />
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">Nenhum chamado por aqui</p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Problema com um pedido, um produto ou a sua conta? A equipe responde por aqui mesmo
              </p>
            </div>
            <Button asChild className="gap-1.5">
              <Link href="/suporte">
                <Plus className="size-4" />
                Abrir um chamado
              </Link>
            </Button>
          </div>
        ) : (
          <>
            {/* Filtros: rolam na horizontal no celular em vez de quebrar linha */}
            <div className="-mx-3 mt-6 overflow-x-auto px-3 sm:mx-0 sm:px-0">
              <div className="inline-flex gap-1 rounded-xl border border-border bg-card p-1">
                {FILTERS.map(({ value, label }) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                    className={cn(
                      "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                      filter === value
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {value === "your_turn" && counts.your_turn > 0 && (
                      <span className="size-1.5 rounded-full bg-amber-400" />
                    )}
                    {label}
                    <span className="tabular-nums text-muted-foreground">{counts[value]}</span>
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <p className="mt-4 rounded-2xl border border-dashed border-border py-12 text-center text-sm text-muted-foreground">
                Nenhum chamado neste filtro
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {visible.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
