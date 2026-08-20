"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuthUser } from "@/components/providers/auth-context"
import type { SupportMessageSender, SupportTicketSummary } from "@/lib/hooks/use-support-tickets"

export type SupportTicketDetail = SupportTicketSummary & {
  order_number: string | null
  product_name: string | null
  product_slug: string | null
  rating_comment: string | null
  rated_at: string | null
  closed_at: string | null
}

export type SupportMessageRow = {
  id: string
  sender_type: SupportMessageSender
  sender_id: string
  sender_name: string
  body: string
  image_urls: string[]
  created_at: string
}

export type UseSupportTicketResult = {
  ticket: SupportTicketDetail | null
  messages: SupportMessageRow[]
  loading: boolean
  notFound: boolean
  reload: () => void
}

/**
 * Detalhe + thread de um ticket. Sem polling em background — o usuário está
 * ativamente olhando a página; refetch é disparado ao enviar mensagem/
 * avaliação, manualmente (`reload`) e ao voltar o foco/visibilidade da aba
 * (evita responder com base num `waiting_on` desatualizado se a resposta do
 * suporte chegou enquanto a aba estava em segundo plano).
 */
export function useSupportTicket(ticketId: string | undefined): UseSupportTicketResult {
  const { user } = useAuthUser()
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(null)
  const [messages, setMessages] = useState<SupportMessageRow[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [version, setVersion] = useState(0)

  // Silencioso (sem passar por `loading`) — usado no refetch de foco/
  // visibilidade, que não deve piscar um spinner por cima da conversa que o
  // usuário já está lendo.
  const silentReload = useCallback(() => {
    setVersion((v) => v + 1)
  }, [])

  // `loading` volta a `true` aqui (fora do efeito, como reação a uma ação do
  // usuário) — setState síncrono dentro do próprio efeito de fetch dispararia
  // um render em cascata evitável.
  const reload = useCallback(() => {
    setLoading(true)
    setVersion((v) => v + 1)
  }, [])

  useEffect(() => {
    if (!user || !ticketId) return
    function handleFocusOrVisible() {
      if (document.visibilityState === "visible") silentReload()
    }
    window.addEventListener("focus", handleFocusOrVisible)
    document.addEventListener("visibilitychange", handleFocusOrVisible)
    return () => {
      window.removeEventListener("focus", handleFocusOrVisible)
      document.removeEventListener("visibilitychange", handleFocusOrVisible)
    }
  }, [user, ticketId, silentReload])

  useEffect(() => {
    if (!user || !ticketId) return
    let cancelled = false
    fetch(`/api/support/tickets/${ticketId}`)
      .then(async (res) => {
        if (res.status === 404) {
          if (!cancelled) setNotFound(true)
          return null
        }
        return res.ok ? res.json() : null
      })
      .then((data: { ticket?: SupportTicketDetail; messages?: SupportMessageRow[] } | null) => {
        if (cancelled || !data) return
        setTicket(data.ticket ?? null)
        setMessages(data.messages ?? [])
      })
      .catch(() => {
        if (!cancelled) setNotFound(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, ticketId, version])

  return { ticket, messages, loading, notFound, reload }
}
