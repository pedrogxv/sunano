"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Heart } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

/**
 * Coração da tierlist pessoal, com atualização otimista sobre
 * `POST/DELETE /api/perfil/tierlist/coracao`.
 *
 * Segue o padrão de `LikeButton`/`FollowButton`: estado vira na hora, volta
 * atrás quando a API recusa, e 401 manda pro login em vez de mostrar erro.
 * A contagem devolvida pela rota substitui a otimista — assim o número não
 * fica defasado quando outra pessoa curte ao mesmo tempo.
 *
 * Só é montado para quem não é o dono; o dono vê a contagem estática
 * (`TierlistHeartCount`).
 */
export function TierlistHeartButton({
  ownerId,
  initialHearted,
  initialCount,
  size = "md",
  className,
}: {
  ownerId: string
  initialHearted: boolean
  initialCount: number
  size?: "sm" | "md"
  className?: string
}) {
  const router = useRouter()
  const [hearted, setHearted] = useState(initialHearted)
  const [count, setCount] = useState(initialCount)
  const [pending, setPending] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return

    const next = !hearted
    setHearted(next)
    setCount((value) => Math.max(0, value + (next ? 1 : -1)))
    setPending(true)

    function rollback() {
      setHearted(!next)
      setCount((value) => Math.max(0, value + (next ? -1 : 1)))
    }

    try {
      const res = await fetch("/api/perfil/tierlist/coracao", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId }),
      })

      if (res.status === 401) {
        rollback()
        router.push("/login")
        return
      }

      const data = (await res.json().catch(() => null)) as
        | { error?: string; heartsCount?: number }
        | null

      if (!res.ok) {
        rollback()
        toast.error(next ? "Não foi possível curtir" : "Não foi possível remover o coração", {
          description: data?.error,
        })
        return
      }

      if (typeof data?.heartsCount === "number") setCount(data.heartsCount)
    } catch {
      rollback()
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={hearted}
      aria-label={hearted ? "Remover coração da tierlist" : "Dar coração para a tierlist"}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-colors",
        size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        hearted
          ? "border-red-500/40 bg-red-500/10 text-red-400"
          : "border-border/60 bg-card/60 text-muted-foreground hover:border-red-500/40 hover:text-red-400",
        className
      )}
    >
      <Heart
        className={cn(
          size === "sm" ? "size-3.5" : "size-4",
          "transition-transform duration-150",
          hearted ? "scale-110 fill-red-500 text-red-500" : "fill-none"
        )}
      />
      <span className="font-semibold tabular-nums">{count}</span>
    </button>
  )
}

/** Versão só-leitura da contagem — para o dono e para visitantes deslogados. */
export function TierlistHeartCount({
  count,
  size = "md",
  className,
}: {
  count: number
  size?: "sm" | "md"
  className?: string
}) {
  return (
    <span
      title={`${count} ${count === 1 ? "coração" : "corações"}`}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-card/60 text-muted-foreground",
        size === "sm" ? "px-2 py-1 text-[11px]" : "px-3 py-1.5 text-xs",
        className
      )}
    >
      <Heart className={cn(size === "sm" ? "size-3.5" : "size-4", "fill-red-500/70 text-red-500")} />
      <span className="font-semibold tabular-nums">{count}</span>
    </span>
  )
}
