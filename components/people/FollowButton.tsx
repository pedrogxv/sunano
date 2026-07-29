"use client"

import { useRouter } from "next/navigation"
import { Check, UserPlus } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

/**
 * Botão de seguir/deixar de seguir, com atualização otimista sobre
 * `POST/DELETE /api/users/follow`.
 *
 * Segue o padrão de `LikeButton`: o clique sempre chama `preventDefault` e
 * `stopPropagation` para não vazar para o `<Link>` do card por trás, e o
 * estado volta atrás quando a API recusa.
 */
export function FollowButton({
  userId,
  initialFollowing,
  size = "sm",
  className,
}: {
  userId: string
  initialFollowing: boolean
  size?: "sm" | "md"
  className?: string
}) {
  const router = useRouter()
  const [following, setFollowing] = useState(initialFollowing)
  const [pending, setPending] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return

    const next = !following
    setFollowing(next)
    setPending(true)

    try {
      const res = await fetch("/api/users/follow", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })

      if (res.status === 401) {
        setFollowing(!next)
        router.push("/login")
        return
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setFollowing(!next)
        toast.error(next ? "Não foi possível seguir" : "Não foi possível deixar de seguir", {
          description: data?.error,
        })
      }
    } catch {
      setFollowing(!next)
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={following}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-colors",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        following
          ? "border border-border bg-muted/40 text-muted-foreground hover:bg-muted/70 hover:text-foreground"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        pending && "opacity-70",
        className
      )}
    >
      {following ? (
        <>
          <Check className={size === "sm" ? "size-3.5" : "size-4"} />
          Seguindo
        </>
      ) : (
        <>
          <UserPlus className={size === "sm" ? "size-3.5" : "size-4"} />
          Seguir
        </>
      )}
    </button>
  )
}
