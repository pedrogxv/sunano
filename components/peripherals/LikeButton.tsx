"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Heart } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"

interface LikeButtonProps {
  peripheralId: string
  /** Estado atual — o componente é controlado pelo pai. */
  liked: boolean
  /**
   * Aplica a mudança na lista do pai. Chamado duas vezes quando a API falha:
   * uma para o estado otimista e outra para desfazê-lo.
   */
  onLikedChange: (peripheralId: string, liked: boolean) => void
  className?: string
}

/**
 * Coração de favoritar, com atualização otimista sobre
 * `POST/DELETE /api/peripherals/:id/like`.
 *
 * É controlado de propósito: o estado vive na lista que renderiza os cards,
 * senão um card desmontado (troca de categoria/filtro) voltaria a montar com
 * o valor antigo e "perderia" o like na tela.
 *
 * `stopPropagation`/`preventDefault` sempre disparam, mesmo deslogado, para
 * nunca deixar o clique vazar para o `<Link>` do card por trás.
 */
export function LikeButton({ peripheralId, liked, onLikedChange, className }: LikeButtonProps) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (pending) return

    const nextLiked = !liked
    onLikedChange(peripheralId, nextLiked)
    setPending(true)

    try {
      const res = await fetch(`/api/peripherals/${peripheralId}/like`, {
        method: nextLiked ? "POST" : "DELETE",
      })

      if (res.status === 401) {
        onLikedChange(peripheralId, !nextLiked)
        router.push("/login")
        return
      }

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        onLikedChange(peripheralId, !nextLiked)
        toast.error(nextLiked ? "Não foi possível curtir" : "Não foi possível remover", {
          description: data?.error,
        })
        return
      }
    } catch {
      onLikedChange(peripheralId, !nextLiked)
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={liked ? "Remover dos favoritos" : "Adicionar aos favoritos"}
      aria-pressed={liked}
      className={cn(
        "z-10 flex size-8 items-center justify-center rounded-full border border-border/60 bg-card/80 backdrop-blur-sm transition-transform duration-150 hover:scale-110 active:scale-90",
        className
      )}
    >
      <Heart
        className={cn(
          "size-4 transition-all duration-150",
          liked ? "scale-110 fill-red-500 text-red-500" : "fill-none text-muted-foreground"
        )}
      />
    </button>
  )
}
