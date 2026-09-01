"use client"

import { useEffect, useState } from "react"

// Cache em módulo (mesmo raciocínio do `use-store-settings`): o código do
// afiliado não muda durante a navegação e vários pontos da mesma página podem
// pedir o botão de compartilhar — uma chamada de rede serve todos.
let cachedCode: string | null | undefined
let inFlight: Promise<string | null> | null = null

function fetchAffiliateCode(): Promise<string | null> {
  if (cachedCode !== undefined) return Promise.resolve(cachedCode)
  if (!inFlight) {
    inFlight = fetch("/api/afiliados/link")
      .then((res) => (res.ok ? res.json() : { code: null }))
      .then((data: { code?: string | null }) => {
        cachedCode = data?.code ?? null
        return cachedCode
      })
      .catch(() => null)
      .finally(() => {
        inFlight = null
      })
  }
  return inFlight
}

/** Esquece o código em cache (usado após trocar o código de indicação). */
export function resetAffiliateCodeCache() {
  cachedCode = undefined
  inFlight = null
}

/**
 * Código de indicação de quem está logado, ou `null` para quem não é afiliado
 * aprovado. Quem consome deve simplesmente não renderizar nada quando vier
 * `null` — a UI de afiliado não existe para o resto dos usuários.
 */
export function useAffiliateCode(): { code: string | null; loading: boolean } {
  const [code, setCode] = useState<string | null>(cachedCode ?? null)
  const [loading, setLoading] = useState(cachedCode === undefined)

  useEffect(() => {
    if (cachedCode !== undefined) return
    let cancelled = false
    fetchAffiliateCode().then((value) => {
      if (cancelled) return
      setCode(value)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  return { code, loading }
}
