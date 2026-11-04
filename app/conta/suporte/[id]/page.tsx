"use client"

import { useState } from "react"
import Link from "next/link"
import { RouteLink } from "@/components/ui/route-link"
import { useParams } from "next/navigation"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  History,
  Loader2,
  MessagesSquare,
  Package,
  Plus,
  Send,
  ShoppingBag,
  Star,
  XCircle,
} from "lucide-react"

import { AccountPageHeader } from "@/components/account/AccountPageHeader"
import { useAuthUser } from "@/components/providers/auth-context"
import { ProfileLoadError } from "@/components/account/ProfileLoadError"
import { SunanoLoader } from "@/components/ui/SunanoLoader"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  CloseTicketButton,
  RATING_LABEL,
  SupportMessageList,
  SupportReplyComposer,
  TICKET_STATE_META,
  TeamAvatar,
  TicketStatePill,
  relativeTime,
  ticketStateOf,
} from "@/components/support/support-chat"
import { useOwnProfile } from "@/lib/hooks/use-own-profile"
import { useSupportTicket, type SupportMessageRow } from "@/lib/hooks/use-support-ticket"
import { profileFrameOf } from "@/lib/profile-frames"
import { cn } from "@/lib/utils"

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
}

type Step = {
  label: string
  detail: string | null
  icon: React.ElementType
  state: "done" | "current" | "todo" | "cancelled"
}

const STEP_DOT: Record<Step["state"], string> = {
  done: "border-emerald-400/60 bg-emerald-500 text-white",
  current: "border-sky-400 bg-sky-500/15 text-sky-300 shadow-[0_0_0_4px] shadow-sky-500/15",
  todo: "border-border bg-card text-muted-foreground/60",
  cancelled: "border-border bg-muted text-muted-foreground",
}

/** Linha do tempo vertical do chamado: enviado → resposta → resolução. */
function TicketTimeline({ steps }: { steps: Step[] }) {
  return (
    <ol>
      {steps.map((step, index) => {
        const Icon = step.icon
        const next = steps[index + 1]
        return (
          <li key={step.label} className="relative flex gap-3 pb-5 last:pb-0">
            {next && (
              <span
                aria-hidden
                className={cn(
                  "absolute left-4 top-9 bottom-0 w-0.5 -translate-x-1/2 rounded-full",
                  next.state === "done" && "bg-emerald-500/60",
                  next.state === "current" && "bg-gradient-to-b from-emerald-500/60 to-sky-400/60",
                  (next.state === "todo" || next.state === "cancelled") && "bg-border"
                )}
              />
            )}
            <span
              className={cn(
                "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border",
                STEP_DOT[step.state]
              )}
            >
              <Icon className="size-3.5" />
              {step.state === "current" && (
                <span className="absolute -right-0.5 -top-0.5 flex size-2.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-sky-400 opacity-75" />
                  <span className="relative inline-flex size-2.5 rounded-full border-2 border-card bg-sky-400" />
                </span>
              )}
            </span>
            <div className="min-w-0 pt-1">
              <p className={cn("text-sm font-medium", step.state === "todo" ? "text-muted-foreground" : "text-foreground")}>
                {step.label}
              </p>
              {step.detail && <p className="text-xs text-muted-foreground">{step.detail}</p>}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * Passo pendente tem nome NEUTRO ("Resposta", "Resolução") e só vira
 * particípio ("Respondido", "Resolvido") quando de fato aconteceu — senão a
 * linha do tempo afirma uma resposta que ainda não existe.
 */
function ticketSteps(
  status: "open" | "resolved" | "cancelled",
  createdAt: string,
  closedAt: string | null,
  firstReply: SupportMessageRow | undefined
): Step[] {
  const sent: Step = { label: "Enviado", detail: formatShortDate(createdAt), icon: Send, state: "done" }
  const replied: Step = firstReply
    ? { label: "Respondido", detail: formatShortDate(firstReply.created_at), icon: MessagesSquare, state: "done" }
    : {
        label: "Resposta",
        detail: status === "open" ? "Aguardando a equipe" : null,
        icon: MessagesSquare,
        state: status === "open" ? "current" : "todo",
      }
  const closedDetail = closedAt ? formatShortDate(closedAt) : null

  if (status === "cancelled") {
    return [sent, replied, { label: "Cancelado", detail: closedDetail, icon: XCircle, state: "cancelled" }]
  }
  if (status === "resolved") {
    return [sent, replied, { label: "Resolvido", detail: closedDetail, icon: CheckCircle2, state: "done" }]
  }
  return [
    sent,
    replied,
    {
      label: "Resolução",
      detail: firstReply ? "Em andamento" : null,
      icon: CheckCircle2,
      state: firstReply ? "current" : "todo",
    },
  ]
}

/** Faixa de "de quem é a vez", logo abaixo do assunto. */
const TURN_STRIP = {
  your_turn: { text: "A equipe respondeu. É a sua vez de continuar a conversa", className: "bg-amber-500/[0.08] text-foreground/85" },
  in_review: { text: "Recebemos sua mensagem. Você será avisado no sino quando a equipe responder", className: "bg-sky-500/[0.07] text-foreground/85" },
} as const

function RatingWidget({ ticketId, onRated }: { ticketId: string; onRated: () => void }) {
  const [rating, setRating] = useState(0)
  const [hover, setHover] = useState(0)
  const [comment, setComment] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submit() {
    if (rating === 0 || submitting) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, comment: comment.trim() || null }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível registrar sua avaliação.")
        return
      }
      toast.success("Obrigado pela avaliação!")
      onRated()
    } catch {
      toast.error("Não foi possível registrar sua avaliação.")
    } finally {
      setSubmitting(false)
    }
  }

  const shown = hover || rating

  return (
    <section className="relative overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-card to-card p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <TeamAvatar className="size-11" />
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-foreground">Como foi seu atendimento?</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">Sua nota ajuda a equipe a melhorar</p>
        </div>
      </div>

      <div className="mt-5 flex flex-col items-center gap-2">
        <div className="flex gap-1.5" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              onMouseEnter={() => setHover(value)}
              aria-label={`${value} estrela${value > 1 ? "s" : ""}: ${RATING_LABEL[value]}`}
              aria-pressed={rating === value}
              className="rounded-lg p-1 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/60"
            >
              <Star
                className={cn(
                  "size-8 transition-colors sm:size-9",
                  value <= shown ? "fill-amber-400 text-amber-400" : "text-muted-foreground/50"
                )}
              />
            </button>
          ))}
        </div>
        <p className={cn("h-5 text-sm font-medium", shown ? "text-amber-400" : "text-muted-foreground")}>
          {shown ? RATING_LABEL[shown] : "Toque nas estrelas"}
        </p>
      </div>

      {rating > 0 && (
        <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-1">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Quer contar mais? (opcional)"
            maxLength={500}
            className="min-h-20 resize-none bg-background/60"
          />
          <div className="flex justify-end">
            <Button size="sm" disabled={submitting} onClick={submit} className="gap-2">
              {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-3.5" />}
              Enviar avaliação
            </Button>
          </div>
        </div>
      )}
    </section>
  )
}

export default function TicketDetailPage() {
  const params = useParams<{ id: string }>()
  const ticketId = params.id
  const { profile, loading: profileLoading, error: profileError, reload: reloadProfile } = useOwnProfile()
  const { ticket, messages, loading, notFound, reload } = useSupportTicket(ticketId)
  const { user: authUser, refresh: refreshAuth } = useAuthUser()

  if (profileError) return <ProfileLoadError onRetry={reloadProfile} />

  if (profileLoading || !profile || (loading && !ticket)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <SunanoLoader />
      </div>
    )
  }

  if (notFound || !ticket) {
    return (
      <div className="pb-16">
        <AccountPageHeader profile={profile} />
        <div className="mx-auto flex max-w-md flex-col items-center gap-3 px-4 py-16 text-center">
          <TeamAvatar className="size-14" />
          <p className="text-sm font-medium text-foreground">Chamado não encontrado</p>
          <Button asChild size="sm" variant="outline">
            <Link href="/conta/suporte">Voltar para Meus Tickets</Link>
          </Button>
        </div>
      </div>
    )
  }

  const state = ticketStateOf(ticket)
  const isOpen = ticket.status === "open"
  const canReply = state === "your_turn"
  const firstReply = messages.find((m) => m.sender_type === "admin")
  const steps = ticketSteps(ticket.status, ticket.created_at, ticket.closed_at, firstReply)
  const myName = profile.display_name?.trim() || "Você"
  const myFrame = profileFrameOf({
    equippedFrameSlug: authUser?.equippedFrameSlug,
    equippedFrameUrl: authUser?.equippedFrameUrl,
    accountTier: authUser?.accountTier ?? profile.account_tier,
    vipExpiresAt: authUser?.vipExpiresAt ?? profile.vip_expires_at ?? null,
    isFounder: authUser?.isFounder,
    longestStreak: authUser?.longestStreak,
    frameOptOut: authUser?.frameOptOut,
  })

  // Mudou de quem é a vez (resposta enviada, chamado encerrado): o ponto
  // âmbar do sino e do botão de suporte vêm da sessão e não se reconsultam.
  function afterChange() {
    reload()
    refreshAuth()
  }

  const closeAction = isOpen && <CloseTicketButton ticketId={ticket.id} onClosed={afterChange} className="w-full" />

  return (
    <div className="pb-16">
      <AccountPageHeader profile={profile} />

      <div className="mx-auto max-w-5xl px-3 py-6 sm:px-4 sm:py-8 md:px-6">
        <Link
          href="/conta/suporte"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Meus Tickets
        </Link>

        <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="min-w-0 space-y-5">
            {/* Conversa: assunto no topo, mensagens e a resposta embaixo */}
            <section className="overflow-hidden rounded-2xl border border-border bg-card">
              <header className="px-4 pb-4 pt-5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <TicketStatePill state={state} />
                  <span className="font-mono text-[11px] text-muted-foreground">#{ticket.id.slice(0, 8)}</span>
                </div>
                <h1 className="mt-2.5 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                  {ticket.subject}
                </h1>
                <p className="mt-1 text-sm text-muted-foreground">
                  Aberto {relativeTime(ticket.created_at)} · {messages.length} mensage{messages.length === 1 ? "m" : "ns"}
                </p>

                {(ticket.order_number || ticket.product_name) && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {ticket.order_number && (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
                        <Package className="size-3.5" />
                        Pedido <span className="font-mono text-foreground">#{ticket.order_number}</span>
                      </span>
                    )}
                    {ticket.product_name && ticket.product_slug && (
                      <RouteLink
                        href={`/loja/${ticket.product_slug}`}
                        className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-foreground transition-colors hover:bg-muted"
                      >
                        <ShoppingBag className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{ticket.product_name}</span>
                        <ArrowUpRight className="size-3 shrink-0 text-muted-foreground" />
                      </RouteLink>
                    )}
                  </div>
                )}
              </header>

              {(state === "your_turn" || state === "in_review") && (
                <div
                  className={cn(
                    "flex items-center gap-2.5 border-t border-border px-4 py-2.5 text-xs sm:px-6 sm:text-[13px]",
                    TURN_STRIP[state].className
                  )}
                >
                  <span className={cn("size-1.5 shrink-0 rounded-full", TICKET_STATE_META[state].dot)} />
                  {TURN_STRIP[state].text}
                </div>
              )}

              <SupportMessageList
                messages={messages}
                me={{ name: myName, avatarUrl: profile.avatar_url, frame: myFrame }}
                closedStatus={ticket.status === "open" ? null : ticket.status}
                className="border-t border-border px-3 py-6 sm:px-6"
              />

              {canReply && (
                <SupportReplyComposer ticketId={ticket.id} onConflict={reload} onSent={afterChange} />
              )}
            </section>

            {!isOpen && ticket.rating === null && <RatingWidget ticketId={ticket.id} onRated={reload} />}

            {!isOpen && ticket.rating !== null && (
              <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-5">
                <div className="flex gap-0.5" aria-label={`Sua avaliação: ${ticket.rating} de 5`}>
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      className={cn(
                        "size-5",
                        value <= ticket.rating! ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"
                      )}
                    />
                  ))}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Você avaliou como <span className="text-amber-400">{RATING_LABEL[ticket.rating]}</span>
                  </p>
                  {ticket.rating_comment ? (
                    <p className="mt-0.5 break-words text-xs text-muted-foreground">&ldquo;{ticket.rating_comment}&rdquo;</p>
                  ) : (
                    <p className="mt-0.5 text-xs text-muted-foreground">Obrigado pelo retorno</p>
                  )}
                </div>
              </section>
            )}
          </div>

          {/* Lateral: andamento, detalhes e ações. No celular vem depois da conversa */}
          <aside className="grid gap-4 sm:grid-cols-2 lg:sticky lg:top-20 lg:grid-cols-1">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 text-xs font-medium text-muted-foreground">Andamento</h2>
              <TicketTimeline steps={steps} />
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="mb-4 text-xs font-medium text-muted-foreground">Detalhes</h2>
              <dl className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    Aberto em
                  </dt>
                  <dd className="text-right text-foreground">{formatShortDate(ticket.created_at)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                    <History className="size-3.5" />
                    Última mensagem
                  </dt>
                  <dd className="text-right text-foreground">{relativeTime(ticket.last_message_at)}</dd>
                </div>
                {ticket.order_number && (
                  <div className="flex items-center justify-between gap-3">
                    <dt className="flex shrink-0 items-center gap-2 text-muted-foreground">
                      <Package className="size-3.5" />
                      Pedido
                    </dt>
                    <dd className="font-mono text-foreground">#{ticket.order_number}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 space-y-2 border-t border-border pt-4">
                {closeAction}
                {isOpen && (
                  <p className="text-center text-[11px] text-muted-foreground">Resolveu? Encerre o chamado por aqui</p>
                )}
                <Button asChild variant="ghost" size="sm" className="w-full gap-1.5 text-muted-foreground">
                  <Link href="/suporte">
                    <Plus className="size-3.5" />
                    Abrir outro chamado
                  </Link>
                </Button>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  )
}
