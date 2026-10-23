"use client"

import { useEffect, useState } from "react"

import type { AccountSummary } from "@/lib/account-summary"

/**
 * Carrega o retrato da conta (`GET /api/account/summary`).
 *
 * Enfeite informativo, igual a `useAccountOverview`: falhar devolve `null` e
 * o hero só some com as estatísticas — nunca trava a página da conta, que é
 * a que cadastra o 2FA.
 */
export function useAccountSummary(enabled = true): {
  summary: AccountSummary | null
  loading: boolean
} {
  const [summary, setSummary] = useState<AccountSummary | null>(null)
  const [loading, setLoading] = useState(enabled)

  useEffect(() => {
    if (!enabled) return
    let mounted = true
    fetch("/api/account/summary")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { summary?: AccountSummary } | null) => {
        if (mounted) setSummary(data?.summary ?? null)
      })
      .catch(() => {
        if (mounted) setSummary(null)
      })
      .finally(() => {
        if (mounted) setLoading(false)
      })
    return () => {
      mounted = false
    }
  }, [enabled])

  return { summary, loading }
}
