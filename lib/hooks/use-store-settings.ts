"use client"

import { useEffect, useState } from "react"

export type UseStoreSettingsResult = {
  cardSurchargePercent: number
  cardMaxInstallments: number
  loading: boolean
}

const DEFAULTS: Omit<UseStoreSettingsResult, "loading"> = { cardSurchargePercent: 5, cardMaxInstallments: 6 }

// Cache em módulo (não em contexto React) — várias instâncias de
// ProductCard renderizam na mesma página e todas precisam do mesmo
// percentual; uma única chamada de rede compartilhada evita N fetches
// idênticos por página de listagem.
let cachedSettings: Omit<UseStoreSettingsResult, "loading"> | null = null
let inFlight: Promise<Omit<UseStoreSettingsResult, "loading">> | null = null

function fetchSettings() {
  if (cachedSettings) return Promise.resolve(cachedSettings)
  if (!inFlight) {
    inFlight = fetch("/api/store/settings")
      .then((res) => (res.ok ? res.json() : DEFAULTS))
      .then((data: Partial<typeof DEFAULTS>) => {
        cachedSettings = {
          cardSurchargePercent: data.cardSurchargePercent ?? DEFAULTS.cardSurchargePercent,
          cardMaxInstallments: data.cardMaxInstallments ?? DEFAULTS.cardMaxInstallments,
        }
        return cachedSettings
      })
      .catch(() => DEFAULTS)
  }
  return inFlight
}

/** Percentual de acréscimo do cartão e teto de parcelas, configurados pelo admin. */
export function useStoreSettings(): UseStoreSettingsResult {
  const [settings, setSettings] = useState(cachedSettings ?? DEFAULTS)
  const [loading, setLoading] = useState(!cachedSettings)

  useEffect(() => {
    if (cachedSettings) return
    let cancelled = false
    fetchSettings().then((data) => {
      if (!cancelled) {
        setSettings(data)
        setLoading(false)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { ...settings, loading }
}
