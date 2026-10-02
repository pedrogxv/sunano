"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Heart, HeartOff } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useStoreFavorites } from "@/components/providers/store-favorites-context"
import { cn } from "@/lib/utils"

/**
 * Coração de favoritar um produto da Loja. `overlay` é o botão redondo por
 * cima da foto do card; `inline` é o botão com texto da página do produto.
 * `confirmRemoval` pede confirmação antes de desfavoritar — usado na lista de
 * favoritos, onde o clique tira o card da tela na hora.
 */
export function FavoriteButton({
  productId,
  productName,
  variant = "overlay",
  confirmRemoval = false,
  className,
}: {
  productId: string
  productName: string
  variant?: "overlay" | "inline"
  confirmRemoval?: boolean
  className?: string
}) {
  const { isFavorite, toggle, loading } = useStoreFavorites()
  const [confirmOpen, setConfirmOpen] = useState(false)
  // Logo depois de favoritar o mouse ainda está em cima do botão: sem esta
  // trava, o "Favoritado" viraria "Remover dos favoritos" no mesmo instante.
  // O convite a remover só aparece depois que o mouse sai e volta.
  const [justToggled, setJustToggled] = useState(false)
  const active = isFavorite(productId)
  const handleClick = () => {
    setJustToggled(true)
    if (active && confirmRemoval) setConfirmOpen(true)
    else toggle(productId)
  }
  const offerRemoval = active && !justToggled
  const confirmDialog = confirmRemoval && (
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remover dos favoritos?</AlertDialogTitle>
          <AlertDialogDescription>
            {productName} vai sair da sua lista de favoritos. Você pode
            favoritar de novo quando quiser.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => toggle(productId)}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            Remover
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  const label = active
    ? `Remover ${productName} dos favoritos`
    : `Favoritar ${productName}`

  if (variant === "inline") {
    return (
      <div className="flex shrink-0 flex-col items-end gap-1.5">
        <button
          type="button"
          onClick={handleClick}
          onMouseLeave={() => setJustToggled(false)}
          disabled={loading}
          aria-pressed={active}
          aria-label={label}
          title={active ? "Remover dos favoritos" : undefined}
          className={cn(
            "group/fav inline-flex h-[46px] shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:opacity-60",
            active
              ? "border-rose-500/40 bg-rose-500/10 text-rose-300"
              : "border-border text-muted-foreground hover:border-foreground/25 hover:text-foreground",
            offerRemoval &&
              "hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300",
            className
          )}
        >
          <Heart
            className={cn(
              "size-[18px]",
              active && "fill-current",
              offerRemoval && "group-hover/fav:hidden"
            )}
            strokeWidth={2}
          />
          {offerRemoval && (
            <HeartOff
              className="hidden size-[18px] group-hover/fav:block"
              strokeWidth={2}
            />
          )}
          <span className="hidden sm:inline">
            {active ? (
              <>
                <span className={cn(offerRemoval && "group-hover/fav:hidden")}>
                  Favoritado
                </span>
                {offerRemoval && (
                  <span className="hidden group-hover/fav:inline">
                    Remover dos favoritos
                  </span>
                )}
              </>
            ) : (
              "Favoritar"
            )}
          </span>
        </button>
        {active && (
          <Link
            href="/loja/favoritos"
            className="inline-flex items-center gap-1 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-rose-300"
          >
            Ver meus favoritos
            <ArrowRight className="size-3" />
          </Link>
        )}
        {confirmDialog}
      </div>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          // O card inteiro é link: o coração não pode abrir o produto junto.
          event.preventDefault()
          event.stopPropagation()
          handleClick()
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
        <Heart
          className={cn("size-4", active && "fill-current")}
          strokeWidth={2.1}
        />
      </button>
      {confirmDialog}
    </>
  )
}
