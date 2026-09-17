"use client"

import type { ReactNode } from "react"
import { Heart } from "lucide-react"

import { safeHref } from "@/lib/safe-url"
import type { Software } from "@/lib/softwares"
import { cn } from "@/lib/utils"

export type SoftwareCardProps = {
  software: Software
  favorited: boolean
  /** Enquanto os favoritos não chegam o coração fica invisível, para não piscar vazio e depois cheio. */
  favoriteReady: boolean
  onToggleFavorite: (software: Software) => void
  /** Chamado ao abrir o Web Hub. Alimenta "Mais usados". */
  onOpen: (software: Software) => void
  /** Alça de arrastar, só na aba Favoritos de quem pode reordenar. */
  dragHandle?: ReactNode
  className?: string
}

/**
 * Card de /softwares: nome da marca em cima e a logo ocupando o resto, sem
 * margem interna.
 *
 * Link e coração são irmãos, não aninhados: botão dentro de `<a>` é HTML
 * inválido e o clique no coração abriria o Web Hub junto.
 */
export function SoftwareCard({
  software,
  favorited,
  favoriteReady,
  onToggleFavorite,
  onOpen,
  dragHandle,
  className,
}: SoftwareCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl border border-border bg-card p-1.5 transition-colors hover:border-foreground/25",
        className
      )}
    >
      <a
        href={safeHref(software.hubUrl)}
        target="_blank"
        rel="noopener noreferrer"
        draggable={false}
        onClick={() => onOpen(software)}
        aria-label={`${software.name}: abrir o Web Hub em nova aba`}
        className="block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className={cn("flex h-9 items-center pr-9", dragHandle ? "pl-9" : "pl-2")}>
          <span className="truncate text-sm font-semibold text-foreground">{software.name}</span>
        </div>
        <div className="aspect-square overflow-hidden rounded-lg bg-muted/30">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={software.logoUrl}
            alt=""
            loading="lazy"
            draggable={false}
            className="size-full object-contain"
          />
        </div>
      </a>

      {dragHandle && <div className="absolute left-2 top-2.5">{dragHandle}</div>}

      <button
        type="button"
        onClick={() => onToggleFavorite(software)}
        aria-label={favorited ? `Remover ${software.name} dos favoritos` : `Favoritar ${software.name}`}
        aria-pressed={favorited}
        className={cn(
          "absolute right-2 top-2 flex size-8 items-center justify-center rounded-full transition-[opacity,transform] duration-150 hover:scale-110 hover:bg-muted active:scale-90",
          favoriteReady ? "opacity-100" : "pointer-events-none opacity-0"
        )}
      >
        <Heart
          className={cn(
            "size-4 transition-colors",
            favorited ? "fill-red-500 text-red-500" : "text-muted-foreground"
          )}
        />
      </button>
    </div>
  )
}
