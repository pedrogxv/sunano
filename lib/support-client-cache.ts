"use client"

import type { SupportMessageRow, SupportTicketDetail } from "@/lib/hooks/use-support-ticket"
import type { SupportTicketSummary } from "@/lib/hooks/use-support-tickets"

/**
 * Cache de navegador dos chamados de suporte do usuário (stale-while-revalidate).
 *
 * Existe para o painel do botão flutuante abrir na hora: o que já foi visto
 * aparece imediatamente e é revalidado por baixo, o hover/toque no botão já
 * dispara a busca antes do clique, e uma busca em andamento é reaproveitada
 * em vez de repetida. A página do chamado lê o mesmo cache, então ir do
 * painel para ela também não pisca loader.
 *
 * Chave sempre com o `userId`: o módulo vive a aba inteira, e trocar de conta
 * sem recarregar não pode mostrar, nem por um instante, o chamado da anterior.
 */

export type SupportTicketPayload = { ticket: SupportTicketDetail; messages: SupportMessageRow[] }
export type SupportTicketLoadResult = SupportTicketPayload | "not_found" | null

const tickets = new Map<string, SupportTicketPayload>()
const ticketInflight = new Map<string, Promise<SupportTicketLoadResult>>()
const openLists = new Map<string, SupportTicketSummary[]>()
const listInflight = new Map<string, Promise<SupportTicketSummary[]>>()

export function peekSupportTicket(userId: string, ticketId: string): SupportTicketPayload | null {
  return tickets.get(`${userId}:${ticketId}`) ?? null
}

/**
 * `fresh`: ignora uma busca já em andamento. O recarregamento depois de
 * enviar mensagem precisa dele — uma busca que começou ANTES do envio
 * voltaria sem a mensagem nova.
 */
export function loadSupportTicket(
  userId: string,
  ticketId: string,
  { fresh = false }: { fresh?: boolean } = {}
): Promise<SupportTicketLoadResult> {
  const key = `${userId}:${ticketId}`
  const inflight = ticketInflight.get(key)
  if (inflight && !fresh) return inflight

  const request = fetch(`/api/support/tickets/${ticketId}`)
    .then(async (res): Promise<SupportTicketLoadResult> => {
      if (res.status === 404) {
        tickets.delete(key)
        return "not_found"
      }
      if (!res.ok) return null
      const data = (await res.json()) as { ticket?: SupportTicketDetail; messages?: SupportMessageRow[] }
      if (!data.ticket) return null
      const payload = { ticket: data.ticket, messages: data.messages ?? [] }
      tickets.set(key, payload)
      return payload
    })
    .catch(() => null)
    .finally(() => {
      if (ticketInflight.get(key) === request) ticketInflight.delete(key)
    })

  ticketInflight.set(key, request)
  return request
}

export function peekOpenSupportTickets(userId: string): SupportTicketSummary[] | null {
  return openLists.get(userId) ?? null
}

export function loadOpenSupportTickets(userId: string): Promise<SupportTicketSummary[]> {
  const inflight = listInflight.get(userId)
  if (inflight) return inflight

  const request = fetch("/api/support/tickets?pageSize=50")
    .then((res) => (res.ok ? res.json() : { tickets: [] }))
    .then((data: { tickets?: SupportTicketSummary[] }) => {
      const open = (data.tickets ?? []).filter((ticket) => ticket.status === "open")
      openLists.set(userId, open)
      return open
    })
    .catch(() => openLists.get(userId) ?? [])
    .finally(() => {
      if (listInflight.get(userId) === request) listInflight.delete(userId)
    })

  listInflight.set(userId, request)
  return request
}

/** Aquece o cache antes do clique: o chamado único direto, ou a lista. */
export function prefetchSupport(userId: string, singleTicketId: string | null): void {
  if (singleTicketId) void loadSupportTicket(userId, singleTicketId)
  else void loadOpenSupportTickets(userId)
}
