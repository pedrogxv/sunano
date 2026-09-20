"use client"

import { useCallback, useEffect, useState } from "react"

import { useAuthUser } from "@/components/providers/auth-context"
import type { PeripheralRequestSummary } from "@/lib/server/repositories/peripheral-requests-repository"

export type UsePeripheralRequestsResult = {
  requests: PeripheralRequestSummary[]
  /** Pedidos ainda na fila — os que contam para o limite por pessoa. */
  openCount: number
  loading: boolean
  reload: () => void
}

/** Pedidos de cadastro de periférico da pessoa logada — "Meus pedidos" em /perifericos/pedidos. */
export function usePeripheralRequests(): UsePeripheralRequestsResult {
  const { user } = useAuthUser()
  const [requests, setRequests] = useState<PeripheralRequestSummary[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [loading, setLoading] = useState(Boolean(user))
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!user) return
    let cancelled = false
    fetch("/api/peripheral-requests")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { requests?: PeripheralRequestSummary[]; openCount?: number } | null) => {
        if (cancelled) return
        setRequests(data?.requests ?? [])
        setOpenCount(data?.openCount ?? 0)
      })
      .catch(() => {
        if (!cancelled) setRequests([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [user, reloadKey])

  const reload = useCallback(() => setReloadKey((key) => key + 1), [])

  return { requests, openCount, loading, reload }
}
