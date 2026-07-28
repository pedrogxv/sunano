"use client"

import { useEffect, useState } from "react"

import { LikeButton } from "./LikeButton"
import { cn } from "@/lib/utils"

interface PeripheralLikeToggleProps {
  peripheralId: string
  className?: string
}

/**
 * Ilha cliente para usar o `LikeButton` fora de uma listagem — hoje a página
 * de detalhe, que é Server Component.
 *
 * Aqui o estado pode morar no próprio componente (ao contrário do grid de
 * `/perifericos`) porque existe um único card na tela: não há irmãos para
 * manter em sincronia nem remontagem por filtro.
 */
export function PeripheralLikeToggle({ peripheralId, className }: PeripheralLikeToggleProps) {
  const [liked, setLiked] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    fetch("/api/peripherals/likes", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { ids?: string[] }) => {
        if (active) setLiked((data.ids ?? []).includes(peripheralId))
      })
      .catch(() => {
        // Mantém o coração vazio; o clique continua funcionando.
      })
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [peripheralId])

  return (
    <LikeButton
      peripheralId={peripheralId}
      liked={liked}
      onLikedChange={(_id, next) => setLiked(next)}
      className={cn(
        "size-10 transition-opacity duration-200",
        loaded ? "opacity-100" : "pointer-events-none opacity-0",
        className
      )}
    />
  )
}
