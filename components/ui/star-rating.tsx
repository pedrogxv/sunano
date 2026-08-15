"use client"

import { useState } from "react"
import { Star } from "lucide-react"

import { cn } from "@/lib/utils"

const SIZE_CLASSES = { sm: "size-3.5", md: "size-5", lg: "size-7" } as const

interface StarRatingProps {
  /** 0-5, em passos de 0.5. */
  value: number
  /** Presente = interativo (clique/toque escolhe a nota); ausente = só leitura. */
  onChange?: (value: number) => void
  size?: keyof typeof SIZE_CLASSES
  className?: string
}

/**
 * 5 estrelas com suporte a meia-estrela — preenchimento fracionário via uma
 * estrela cheia sobreposta e clipada em `width: {fraction*100}%`, técnica
 * padrão pra evitar 10 ícones diferentes (cheia/meia/vazia × 5).
 *
 * Interativo: cada estrela tem duas zonas de clique (metade esquerda =
 * X.5, metade direita = X), com preview no hover/toque antes de confirmar.
 */
export function StarRating({ value, onChange, size = "md", className }: StarRatingProps) {
  const [hoverValue, setHoverValue] = useState<number | null>(null)
  const interactive = Boolean(onChange)
  const displayValue = interactive ? (hoverValue ?? value) : value
  const iconClass = SIZE_CLASSES[size]

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", className)}
      onMouseLeave={interactive ? () => setHoverValue(null) : undefined}
      role={interactive ? "radiogroup" : "img"}
      aria-label={interactive ? "Nota" : `${value} de 5 estrelas`}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const fraction = Math.min(1, Math.max(0, displayValue - (star - 1)))

        function pick(event: React.MouseEvent<HTMLElement>, commit: boolean) {
          if (!interactive) return
          const rect = event.currentTarget.getBoundingClientRect()
          const isLeftHalf = event.clientX - rect.left < rect.width / 2
          const next = isLeftHalf ? star - 0.5 : star
          if (commit) onChange?.(next)
          else setHoverValue(next)
        }

        const starNode = (
          <span className={cn("relative inline-block", iconClass)}>
            <Star className={cn(iconClass, "text-muted-foreground/30")} />
            <span
              className="absolute inset-y-0 left-0 overflow-hidden"
              style={{ width: `${fraction * 100}%` }}
            >
              <Star className={cn(iconClass, "fill-amber-400 text-amber-400")} />
            </span>
          </span>
        )

        if (!interactive) {
          return <span key={star}>{starNode}</span>
        }

        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value >= star}
            aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
            className="cursor-pointer"
            onMouseMove={(e) => pick(e, false)}
            onClick={(e) => pick(e, true)}
          >
            {starNode}
          </button>
        )
      })}
    </div>
  )
}
