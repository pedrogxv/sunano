"use client"

import { useCallback, useEffect, useState } from "react"
import { useAuthUser } from "@/components/providers/auth-context"
import type { SupportMessageSender, SupportTicketSummary } from "@/lib/hooks/use-support-tickets"
import { loadSupportTicket, peekSupportTicket } from "@/lib/support-client-cache"

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
  const userId = user?.id ?? null
  // Já visto (painel do botão, prefetch no hover): começa com os dados na
  // tela e revalida por baixo, sem loader.
  const cached = userId && ticketId ? peekSupportTicket(userId, ticketId) : null
  const [ticket, setTicket] = useState<SupportTicketDetail | null>(cached?.ticket ?? null)
  const [messages, setMessages] = useState<SupportMessageRow[]>(cached?.messages ?? [])
  const [loading, setLoading] = useState(!cached)
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
    if (!userId || !ticketId) return
    function handleFocusOrVisible() {
      if (document.visibilityState === "visible") silentReload()
    }
    window.addEventListener("focus", handleFocusOrVisible)
    document.addEventListener("visibilitychange", handleFocusOrVisible)
    return () => {
      window.removeEventListener("focus", handleFocusOrVisible)
      document.removeEventListener("visibilitychange", handleFocusOrVisible)
    }
  }, [userId, ticketId, silentReload])

  useEffect(() => {
    if (!userId || !ticketId) return
    let cancelled = false
    // A primeira carga reaproveita a busca do prefetch (hover no botão) se
    // ela ainda estiver em andamento; recarregamentos buscam do zero.
    loadSupportTicket(userId, ticketId, { fresh: version > 0 })
      .then((result) => {
        if (cancelled) return
        if (result === "not_found") {
          setNotFound(true)
          return
        }
        if (!result) return
        setNotFound(false)
        setTicket(result.ticket)
        setMessages(result.messages)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [userId, ticketId, version])

  return { ticket, messages, loading, notFound, reload }
}
