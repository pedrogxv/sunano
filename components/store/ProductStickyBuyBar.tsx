"use client"

import { useEffect, useState, type RefObject } from "react"
import { Rocket, Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"

/**
 * Altura reservada no rodapé enquanto a barra está na tela. Quem flutua no
 * mesmo canto (o botão de suporte) soma esta variável ao próprio `bottom`,
 * em vez de cada um conhecer o outro.
 */
export const MOBILE_BOTTOM_BAR_VAR = "--mobile-bottom-bar-h"
const BAR_HEIGHT = "4.75rem"

/** Abaixo de `lg` a página de produto é uma coluna só, e o botão de comprar some ao rolar. */
const SINGLE_COLUMN_QUERY = "(max-width: 1023px)"

/**
 * Barra de compra fixa no rodapé, só em telas de uma coluna: aparece quando o
 * bloco de compra principal (`targetRef`) sai da tela — na descrição, na
 * ficha, nas avaliações — e some quando ele volta. É o padrão de loja no
 * celular: a decisão de comprar acontece lendo, e voltar ao topo para achar o
 * botão é atrito puro.
 *
 * Compra exatamente o que o botão principal compraria (mesma seleção, mesma
 * quantidade): é o mesmo `onBuy`.
 */
export function ProductStickyBuyBar({
  targetRef,
  productName,
  priceCents,
  showPixHint,
  preOrder,
  ctaLabel,
  onBuy,
}: {
  targetRef: RefObject<HTMLElement | null>
  productName: string
  priceCents: number
  /** "no PIX" ao lado do preço (sem cartão, ou serviço de preço único, não tem). */
  showPixHint: boolean
  preOrder: boolean
  ctaLabel: string
  onBuy: () => void
}) {
  const [outOfView, setOutOfView] = useState(false)
  const [singleColumn, setSingleColumn] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(SINGLE_COLUMN_QUERY)
    const sync = () => setSingleColumn(media.matches)
    sync()
    media.addEventListener("change", sync)
    return () => media.removeEventListener("change", sync)
  }, [])

  useEffect(() => {
    const target = targetRef.current
    if (!target || typeof IntersectionObserver === "undefined") return
    const observer = new IntersectionObserver(([entry]) => setOutOfView(!entry.isIntersecting))
    observer.observe(target)
    return () => observer.disconnect()
  }, [targetRef])

  const visible = outOfView && singleColumn

  useEffect(() => {
    const root = document.documentElement
    if (visible) root.style.setProperty(MOBILE_BOTTOM_BAR_VAR, BAR_HEIGHT)
    else root.style.removeProperty(MOBILE_BOTTOM_BAR_VAR)
    return () => {
      root.style.removeProperty(MOBILE_BOTTOM_BAR_VAR)
    }
  }, [visible])

  const Icon = preOrder ? Rocket : Zap

  return (
    <div
      // Escondida, fica fora do foco e do leitor de tela (só saiu da vista).
      inert={!visible}
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-2.5 pb-[calc(0.625rem_+_env(safe-area-inset-bottom))] shadow-[0_-12px_28px_-16px_rgba(0,0,0,0.8)] backdrop-blur-md transition-transform duration-200 motion-reduce:transition-none lg:hidden",
        visible ? "translate-y-0" : "translate-y-full"
      )}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted-foreground">{productName}</p>
          <p className="flex items-baseline gap-1.5 font-display text-lg font-bold leading-tight text-foreground">
            {formatBRL(priceCents)}
            {showPixHint && <span className="text-xs font-semibold text-emerald-400/90">no PIX</span>}
          </p>
        </div>
        <Button
          onClick={onBuy}
          className={cn(
            "h-11 shrink-0 gap-1.5 rounded-xl px-4 text-[15px] font-bold",
            preOrder
              ? "bg-gradient-to-r from-amber-300 to-amber-500 text-[#1a1200] hover:brightness-105"
              : "bg-gradient-to-r from-[#7F77DD] to-[#D4537E] text-white hover:brightness-110"
          )}
        >
          <Icon className="size-4" />
          {ctaLabel}
        </Button>
      </div>
    </div>
  )
}
