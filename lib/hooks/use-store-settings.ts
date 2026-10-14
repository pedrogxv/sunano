"use client"

import { useEffect, useState } from "react"

export type UseStoreSettingsResult = {
  cardSurchargePercent: number
  cardMaxInstallments: number
  /** A Loja aceita cartão (Asaas sim; Stripe, por ora, só PIX). Falso = nada de preço/parcela no cartão na tela. */
  cardEnabled: boolean
  loading: boolean
}

// Cartão DESLIGADO até a resposta chegar (e se ela falhar). Começar ligado
// fazia a loja só PIX (Stripe) piscar "em até 6x sem juros" em todo card até
// o fetch voltar. Assim nada promete cartão antes de o servidor confirmar:
// com a Asaas a linha do cartão só aparece um instante depois, e o checkout já
// abre em PIX de qualquer jeito.
const DEFAULTS: Omit<UseStoreSettingsResult, "loading"> = {
  cardSurchargePercent: 10,
  cardMaxInstallments: 1,
  cardEnabled: false,
}

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
          cardEnabled: data.cardEnabled ?? DEFAULTS.cardEnabled,
        }
        return cachedSettings
      })
      .catch(() => DEFAULTS)
  }
  return inFlight
}

/** Percentual de acréscimo do cartão, teto de parcelas e se o cartão está disponível. */
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
