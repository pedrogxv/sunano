"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import { RouteLink } from "@/components/ui/route-link"
import { usePathname } from "@/lib/hooks/use-pathname"
import { ArrowLeft, ChevronRight, Expand, LifeBuoy, Plus, X } from "lucide-react"
import { useAuthUser } from "@/components/providers/auth-context"
import {
  CloseTicketButton,
  SupportMessageList,
  SupportReplyComposer,
  TeamAvatar,
  TicketStatePill,
  relativeTime,
  ticketStateOf,
  type SupportChatIdentity,
} from "@/components/support/support-chat"
import { SupportTicketForm } from "@/components/store/SupportTicketForm"
import { Button } from "@/components/ui/button"
import { useSupportTicket } from "@/lib/hooks/use-support-ticket"
import { loadOpenSupportTickets, peekOpenSupportTickets, prefetchSupport } from "@/lib/support-client-cache"
import type { SupportTicketSummary } from "@/lib/hooks/use-support-tickets"
import { profileMediaProxyUrl } from "@/lib/account-tier"
import { profileFrameOf } from "@/lib/profile-frames"
import { useT } from "@/lib/use-t"
import { cn } from "@/lib/utils"

/**
 * Botão flutuante de suporte no canto inferior direito das páginas públicas.
 * Antes o único caminho para /suporte era o menu da Loja, e quem tinha
 * problema com a conta ou um pedido estando na Home ou no Fórum não achava.
 *
 * Logado, o botão abre um painel: a pessoa abre um chamado, lê a conversa e
 * responde sem sair da tela onde está. Deslogado continua sendo um link para
 * /suporte, que pede o login. O número de abertos vem da sessão
 * (`supportTicketsOpen`) e decide a primeira tela do painel (lista ou
 * chamado novo) sem custar uma consulta por página; a lista só é buscada
 * quando o painel abre.
 *
 * z-40 de propósito: barras que ocupam o rodapé (cookies, comparação de
 * periféricos) são z-50 e ficam por cima, em vez de o botão tapar a ação delas.
 */
export function SupportFab() {
  const pathname = usePathname() ?? "/"
  const { user } = useAuthUser()
  const t = useT()
  const [open, setOpen] = useState(false)

  // Trocar de página fecha o painel: ele não deve seguir a pessoa por cima
  // de uma tela que ela foi ver.
  const [lastPathname, setLastPathname] = useState(pathname)
  if (lastPathname !== pathname) {
    setLastPathname(pathname)
    setOpen(false)
  }

  useEffect(() => {
    if (!open) return
    function onKeyDown(event: KeyboardEvent) {
      // Esc com um modal aberto por cima (confirmar encerramento, select do
      // formulário) fecha só o modal, não o painel inteiro.
      if (event.key !== "Escape") return
      if (document.querySelector('[role="alertdialog"], [role="listbox"]')) return
      setOpen(false)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [open])

  // No checkout o botão flutuaria por cima do QR code do PIX / formulário do
  // cartão; nas telas de suporte ele apontaria para a própria página.
  if (
    pathname.startsWith("/checkout") ||
    pathname === "/suporte" ||
    pathname.startsWith("/conta/suporte")
  ) {
    return null
  }

  const awaiting = (user?.supportTicketsAwaitingMe ?? 0) > 0
  const openCount = user?.supportTicketsOpen ?? 0
  const label = awaiting ? t.auth.supportAwaiting : t.auth.support

  // `--mobile-bottom-bar-h`: barra fixa de rodapé (a de compra da página de
  // produto) está na tela; o botão sobe acima dela em vez de cobri-la.
  const fabClass =
    "fixed bottom-[calc(1rem_+_env(safe-area-inset-bottom)_+_var(--mobile-bottom-bar-h,0px))] right-4 z-40 flex size-12 items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-semibold text-foreground shadow-[0_12px_28px_-10px_rgba(0,0,0,0.85)] transition-all hover:bg-muted md:bottom-[calc(1.5rem_+_var(--mobile-bottom-bar-h,0px))] md:right-6 md:h-11 md:w-auto md:px-4"

  const awaitingDot = awaiting && (
    <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-amber-500 ring-2 ring-card" />
  )

  if (!user) {
    return (
      <RouteLink href="/suporte" aria-label={label} title={label} className={fabClass}>
        <LifeBuoy className="size-[18px] md:size-4" />
        <span className="hidden md:inline">{t.auth.support}</span>
        {awaitingDot}
      </RouteLink>
    )
  }

  return (
    <>
      {open && (
        <SupportPanel
          hasOpenTickets={openCount > 0}
          singleTicketId={user.supportSingleOpenTicketId}
          onClose={() => setOpen(false)}
        />
      )}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        // A busca começa na intenção (mouse em cima, toque, foco pelo teclado),
        // não no clique: quando o painel abre, a conversa já chegou ou está
        // a meio caminho.
        onPointerEnter={() => prefetchSupport(user.id, user.supportSingleOpenTicketId)}
        onPointerDown={() => prefetchSupport(user.id, user.supportSingleOpenTicketId)}
        onFocus={() => prefetchSupport(user.id, user.supportSingleOpenTicketId)}
        aria-label={label}
        aria-expanded={open}
        title={label}
        className={cn(fabClass, open && "bg-muted")}
      >
        {open ? <X className="size-[18px] md:size-4" /> : <LifeBuoy className="size-[18px] md:size-4" />}
        <span className="hidden md:inline">{t.auth.support}</span>
        {!open && openCount > 0 && (
          <span className="hidden min-w-5 rounded-full bg-sky-500/15 px-1.5 text-center text-[11px] font-semibold tabular-nums text-sky-400 md:inline">
            {openCount}
          </span>
        )}
        {!open && awaitingDot}
      </button>
    </>
  )
}

type PanelView = { kind: "list" } | { kind: "new" } | { kind: "ticket"; id: string }

/** Painel do botão: lista dos chamados abertos ↔ conversa de um deles ↔ chamado novo. */
function SupportPanel({
  hasOpenTickets,
  singleTicketId,
  onClose,
}: {
  hasOpenTickets: boolean
  singleTicketId: string | null
  onClose: () => void
}) {
  const { refresh: refreshAuth } = useAuthUser()
  // Sem chamado aberto a lista estaria vazia: o painel já abre no formulário.
  // Um chamado só (o id vem da sessão): abre direto na conversa, sem buscar a lista antes.
  const [view, setView] = useState<PanelView>(
    singleTicketId ? { kind: "ticket", id: singleTicketId } : hasOpenTickets ? { kind: "list" } : { kind: "new" }
  )
  // Com um chamado só, abre direto na conversa (a lista seria um clique a
  // mais) — mas só na PRIMEIRA carga, senão "Voltar" reabriria o mesmo.
  const autoOpened = useRef(Boolean(singleTicketId))
  const handleLoaded = useCallback((tickets: SupportTicketSummary[]) => {
    if (autoOpened.current) return
    autoOpened.current = true
    if (tickets.length === 1) setView({ kind: "ticket", id: tickets[0].id })
  }, [])

  return (
    <div
      role="dialog"
      aria-label="Suporte"
      // No celular ocupa a largura toda acima do botão; no desktop é um
      // cartão ancorado no canto, do tamanho de um chat.
      className="fixed inset-x-3 bottom-[calc(4.5rem_+_env(safe-area-inset-bottom)_+_var(--mobile-bottom-bar-h,0px))] z-40 flex h-[min(600px,calc(100dvh-6.5rem-var(--mobile-bottom-bar-h,0px)))] origin-bottom-right flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_24px_60px_-12px_rgba(0,0,0,0.9)] animate-in fade-in zoom-in-95 slide-in-from-bottom-2 duration-200 sm:inset-x-auto sm:right-4 sm:w-[400px] md:right-6 md:bottom-[calc(5rem_+_var(--mobile-bottom-bar-h,0px))]"
    >
      {view.kind === "ticket" ? (
        <TicketView ticketId={view.id} onBack={() => setView({ kind: "list" })} onClose={onClose} />
      ) : view.kind === "new" ? (
        <NewTicketView
          onBack={hasOpenTickets ? () => setView({ kind: "list" }) : null}
          onClose={onClose}
          onCreated={(id) => {
            // O chamado novo entra na contagem da sessão (badge do botão e
            // primeira tela do painel na próxima vez).
            refreshAuth()
            setView({ kind: "ticket", id })
          }}
        />
      ) : (
        <TicketList
          onSelect={(id) => setView({ kind: "ticket", id })}
          onNew={() => setView({ kind: "new" })}
          onLoaded={handleLoaded}
          onClose={onClose}
        />
      )}
    </div>
  )
}

function NewTicketView({
  onBack,
  onClose,
  onCreated,
}: {
  onBack: (() => void) | null
  onClose: () => void
  onCreated: (ticketId: string) => void
}) {
  return (
    <>
      <div className="relative overflow-hidden border-b border-border px-3 py-3">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex items-center gap-2">
          {onBack ? (
            <PanelIconButton onClick={onBack} label="Voltar">
              <ArrowLeft className="size-4" />
            </PanelIconButton>
          ) : (
            <TeamAvatar className="ml-1 size-9" />
          )}
          <div className="min-w-0 flex-1 px-1">
            <p className="text-sm font-semibold text-foreground">Novo chamado</p>
            <p className="truncate text-xs text-muted-foreground">Conte o que aconteceu, a equipe responde por aqui</p>
          </div>
          <PanelIconButton onClick={onClose} label="Fechar">
            <X className="size-4" />
          </PanelIconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <SupportTicketForm compact onCreated={(ticket) => onCreated(ticket.id)} />
      </div>
    </>
  )
}

function PanelIconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </button>
  )
}

function TicketList({
  onSelect,
  onNew,
  onLoaded,
  onClose,
}: {
  onSelect: (id: string) => void
  onNew: () => void
  onLoaded: (tickets: SupportTicketSummary[]) => void
  onClose: () => void
}) {
  const { user } = useAuthUser()
  const userId = user?.id ?? null
  // Lista já vista aparece na hora; a busca abaixo só a atualiza.
  const [tickets, setTickets] = useState<SupportTicketSummary[] | null>(() =>
    userId ? peekOpenSupportTickets(userId) : null
  )

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    loadOpenSupportTickets(userId).then((openTickets) => {
      if (cancelled) return
      setTickets(openTickets)
      onLoaded(openTickets)
    })
    return () => {
      cancelled = true
    }
  }, [userId, onLoaded])

  return (
    <>
      <div className="relative overflow-hidden border-b border-border px-4 pb-4 pt-4">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex items-start gap-3">
          <TeamAvatar className="size-10" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">Suporte Sunano</p>
            <p className="text-xs text-muted-foreground">Seus chamados abertos</p>
          </div>
          <PanelIconButton onClick={onClose} label="Fechar">
            <X className="size-4" />
          </PanelIconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {tickets === null ? (
          <ul className="space-y-1" aria-label="Carregando chamados">
            {[0, 1, 2].map((row) => (
              <li key={row} className="space-y-2 rounded-xl px-3 py-3">
                <div className="h-3.5 w-2/3 animate-pulse rounded bg-muted" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-muted/70" />
                <div className="h-2.5 w-16 animate-pulse rounded bg-muted/60" />
              </li>
            ))}
          </ul>
        ) : tickets.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">Nenhum chamado aberto</p>
            <Button size="sm" className="gap-1.5" onClick={onNew}>
              <Plus className="size-3.5" />
              Abrir chamado
            </Button>
          </div>
        ) : (
          <ul className="space-y-1">
            {tickets.map((ticket) => (
              <li key={ticket.id}>
                <button
                  type="button"
                  onClick={() => onSelect(ticket.id)}
                  className="group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{ticket.subject}</p>
                      <TicketStatePill state={ticketStateOf(ticket)} />
                    </div>
                    {ticket.last_message_preview && (
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {ticket.last_message_sender === "admin" ? "Equipe: " : "Você: "}
                        {ticket.last_message_preview}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground/80">{relativeTime(ticket.last_message_at)}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-2.5">
        <button
          type="button"
          onClick={onNew}
          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Plus className="size-3.5" />
          Novo chamado
        </button>
        <Link
          href="/conta/suporte"
          className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          Ver todos
        </Link>
      </div>
    </>
  )
}

function TicketView({
  ticketId,
  onBack,
  onClose,
}: {
  ticketId: string
  onBack: () => void
  onClose: () => void
}) {
  const { user, refresh: refreshAuth } = useAuthUser()
  const { ticket, messages, loading, notFound, reload } = useSupportTicket(ticketId)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Abre (e segue) no fim da conversa, onde está a mensagem nova.
  const scrollToEnd = useCallback(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])
  useEffect(scrollToEnd, [messages.length, scrollToEnd])

  if (!user) return null

  const me: SupportChatIdentity = {
    name: user.displayName || "Você",
    avatarUrl: user.avatarUrl ? profileMediaProxyUrl(user.id, "avatar") : null,
    frame: profileFrameOf({
      equippedFrameSlug: user.equippedFrameSlug,
      equippedFrameUrl: user.equippedFrameUrl,
      accountTier: user.accountTier,
      vipExpiresAt: user.vipExpiresAt,
      isFounder: user.isFounder,
      longestStreak: user.longestStreak,
      frameOptOut: user.frameOptOut,
    }),
  }
  const canReply = ticket?.status === "open" && ticket.waiting_on === "user"

  // Resposta enviada ou chamado encerrado: o ponto âmbar e a contagem do
  // botão vêm da sessão e não se reconsultam sozinhos.
  function afterChange() {
    reload()
    refreshAuth()
  }

  return (
    <>
      <div className="flex items-center gap-1.5 border-b border-border px-2 py-2">
        <PanelIconButton onClick={onBack} label="Voltar">
          <ArrowLeft className="size-4" />
        </PanelIconButton>
        <div className="min-w-0 flex-1 px-1">
          <p className="truncate text-sm font-semibold text-foreground">{ticket?.subject ?? "Chamado"}</p>
          {ticket && ticket.status === "open" && (
            <div className="mt-0.5">
              <TicketStatePill state={ticketStateOf(ticket)} />
            </div>
          )}
        </div>
        <RouteLink
          href={`/conta/suporte/${ticketId}`}
          aria-label="Abrir página do chamado"
          title="Abrir página do chamado"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Expand className="size-4" />
        </RouteLink>
        <PanelIconButton onClick={onClose} label="Fechar">
          <X className="size-4" />
        </PanelIconButton>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {loading && !ticket ? (
          <ChatSkeleton />
        ) : notFound || !ticket ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Chamado não encontrado</p>
        ) : (
          <SupportMessageList
            messages={messages}
            me={me}
            closedStatus={ticket.status === "open" ? null : ticket.status}
            compact
            className="min-h-full px-3 py-4"
          />
        )}
      </div>

      {ticket?.status === "open" && (
        <>
          <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2">
            <p className="min-w-0 text-[11px] leading-tight text-muted-foreground">
              {canReply ? "Resolveu?" : "Aguardando a equipe · você será avisado no sino"}
            </p>
            <CloseTicketButton ticketId={ticketId} onClosed={afterChange} size="sm" className="h-7 shrink-0 text-xs" />
          </div>
          {canReply && (
            <SupportReplyComposer ticketId={ticketId} compact onConflict={reload} onSent={afterChange} />
          )}
        </>
      )}
    </>
  )
}

/** Esqueleto da conversa: o formato das bolhas aparece no lugar de um spinner. */
function ChatSkeleton() {
  return (
    <div className="space-y-5 px-3 py-4" aria-label="Carregando conversa">
      <div className="flex items-start gap-2.5">
        <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="space-y-2">
          <div className="h-2.5 w-24 animate-pulse rounded bg-muted/70" />
          <div className="h-12 w-52 animate-pulse rounded-2xl rounded-tl-md bg-muted" />
        </div>
      </div>
      <div className="flex flex-row-reverse items-start gap-2.5">
        <div className="size-8 shrink-0 animate-pulse rounded-full bg-muted" />
        <div className="flex flex-col items-end space-y-2">
          <div className="h-2.5 w-16 animate-pulse rounded bg-muted/70" />
          <div className="h-9 w-40 animate-pulse rounded-2xl rounded-tr-md bg-sky-500/15" />
        </div>
      </div>
    </div>
  )
}
