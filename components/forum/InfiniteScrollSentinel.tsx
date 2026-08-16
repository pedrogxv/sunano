"use client"

import { useEffect, useRef } from "react"

/**
 * Elemento invisível que dispara `onIntersect` quando entra na viewport —
 * base do scroll infinito das listagens do fórum. `rootMargin` antecipa o
 * fetch antes do usuário bater no fim físico da lista, pra não ver o loader
 * parado por um instante.
 */
export function InfiniteScrollSentinel({
  onIntersect,
  disabled = false,
}: {
  onIntersect: () => void
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  const onIntersectRef = useRef(onIntersect)

  useEffect(() => {
    onIntersectRef.current = onIntersect
  }, [onIntersect])

  useEffect(() => {
    if (disabled) return
    const node = ref.current
    if (!node) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onIntersectRef.current()
      },
      { rootMargin: "400px" }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [disabled])

  return <div ref={ref} aria-hidden className="h-1 w-full" />
}
