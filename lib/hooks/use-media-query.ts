"use client"

import { useCallback, useSyncExternalStore } from "react"

/**
 * Casa uma media query, assinando a mudança (girar o celular, redimensionar a
 * janela). No servidor e na hidratação vale `serverValue`, para o HTML do
 * servidor e o primeiro render do cliente baterem.
 */
export function useMediaQuery(query: string, serverValue = false): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mql = window.matchMedia(query)
      mql.addEventListener("change", onChange)
      return () => mql.removeEventListener("change", onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => serverValue
  )
}
