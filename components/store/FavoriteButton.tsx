"use client"

import { Heart } from "lucide-react"

import { useStoreFavorites } from "@/components/providers/store-favorites-context"
import { cn } from "@/lib/utils"

/**
 * Coração de favoritar um produto da Loja. `overlay` é o botão redondo por
 * cima da foto do card; `inline` é o botão com texto da página do produto.
 */
export function FavoriteButton({
  productId,
  productName,
  variant = "overlay",
  className,
}: {
  productId: string
  productName: string
  variant?: "overlay" | "inline"
  className?: string
}) {
  const { isFavorite, toggle, loading } = useStoreFavorites()
  const active = isFavorite(productId)
  const label = active ? `Remover ${productName} dos favoritos` : `Favoritar ${productName}`

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={() => toggle(productId)}
        disabled={loading}
        aria-pressed={active}
        aria-label={label}
        className={cn(
          "inline-flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60",
          active
            ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/15"
            : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
          className
        )}
      >
        <Heart className={cn("size-[18px]", active && "fill-current")} strokeWidth={2} />
        <span className="hidden sm:inline">{active ? "Favoritado" : "Favoritar"}</span>
      </button>
    )
  }

  return (
    <button
      type="button"
      onClick={(event) => {
        // O card inteiro é link: o coração não pode abrir o produto junto.
        event.preventDefault()
        event.stopPropagation()
        toggle(productId)
      }}
      disabled={loading}
      aria-pressed={active}
      aria-label={label}
      title={active ? "Remover dos favoritos" : "Favoritar"}
      className={cn(
        "flex size-8 items-center justify-center rounded-full border backdrop-blur-sm transition-all disabled:opacity-60",
        active
          ? "border-rose-400/40 bg-rose-500/15 text-rose-400"
          : "border-white/10 bg-black/40 text-white/70 hover:border-white/25 hover:text-white",
        className
      )}
    >
      <Heart className={cn("size-4", active && "fill-current")} strokeWidth={2.1} />
    </button>
  )
}
