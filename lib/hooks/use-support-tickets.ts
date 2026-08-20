"use client"

import { useEffect, useState } from "react"
import { useAuthUser } from "@/components/providers/auth-context"

export type SupportTicketStatus = "open" | "resolved" | "cancelled"
export type SupportWaitingOn = "user" | "admin" | "closed"
export type SupportMessageSender = "user" | "admin"

export type SupportTicketSummary = {
  id: string
  subject: string
  status: SupportTicketStatus
  waiting_on: SupportWaitingOn
  message_count: number
  last_message_at: string
  last_message_preview: string | null
  last_message_sender: SupportMessageSender | null
  rating: number | null
  created_at: string
  order_id: string | null
  product_id: string | null
}

export type UseSupportTicketsResult = {
  tickets: SupportTicketSummary[]
  loading: boolean
}

/** Tickets de suporte do usuário logado — usado por "Meus Tickets" (/conta/suporte). */
export function useSupportTickets(): UseSupportTicketsResult {
  const { user } = useAuthUser()
  const [tickets, setTickets] = useState<SupportTicketSummary[]>([])
  const [loading, setLoading] = useState(Boolean(user))

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch("/api/support/tickets")
      .then((res) => (res.ok ? res.json() : { tickets: [] }))
      .then((data: { tickets?: SupportTicketSummary[] }) => {
        if (!cancelled) setTickets(data.tickets ?? [])
      })
      .catch(() => {
        if (!cancelled) setTickets([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user])

  return { tickets, loading }
}
