"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Heart } from "lucide-react"

import { LikeButton } from "./LikeButton"
import { useAuthUser } from "@/components/providers/auth-context"
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
  const { user } = useAuthUser()
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
    <div className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
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

      {loaded && liked && user && (
        <Link
          href={`/perfil/${user.id}`}
          className="flex shrink-0 basis-full items-center justify-end gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-primary @[420px]/col:basis-auto"
        >
          <Heart className="size-3.5 shrink-0 fill-current text-red-500" />
          Ver meus favoritos
        </Link>
      )}
    </div>
  )
}
