"use client"

import { useEffect, useState } from "react"

import { StarRating } from "@/components/ui/star-rating"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface PeripheralVoteBoxProps {
  peripheralId: string
}

type Verdict = "good" | "bad" | "tie"

const verdictCardStyles: Record<Verdict, string> = {
  good: "border-emerald-500/40 bg-emerald-500/10",
  bad: "border-red-500/40 bg-red-500/10",
  tie: "border-border bg-card",
}

const verdictTitle: Record<Verdict, string> = {
  good: "PERIFÉRICO BOM",
  bad: "PERIFÉRICO DE BAGRE",
  tie: "EMPATE",
}

const verdictTitleColor: Record<Verdict, string> = {
  good: "text-emerald-400",
  bad: "text-red-400",
  tie: "text-muted-foreground",
}

const verdictTooltip: Record<Verdict, string> = {
  good: "Periférico bom: a média das avaliações da comunidade é maior que 3 estrelas",
  bad: "Periférico de BAGRE: a média das avaliações da comunidade é menor que 3 estrelas",
  tie: "EMPATE: a média das avaliações é 3 estrelas, ou ainda não há avaliações suficientes",
}

/**
 * "BOM OU BAGRE?" — veredito calculado a partir da média das avaliações em
 * estrelas do periférico (`peripheral_reviews`), não mais do vote binário
 * antigo (like/dislike). Sem ação do usuário aqui: avaliar acontece pelo
 * fluxo de "Meus Reviews" no perfil.
 */
export function PeripheralVoteBox({ peripheralId }: PeripheralVoteBoxProps) {
  const [average, setAverage] = useState<number | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [verdictTooltipOpen, setVerdictTooltipOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/peripherals/${peripheralId}/reviews?page=1&limit=1`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { average?: number | null; totalCount?: number }) => {
        if (!active) return
        setAverage(data.average ?? null)
        setTotalCount(data.totalCount ?? 0)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [peripheralId])

  const verdict: Verdict = average === null || average === 3 ? "tie" : average > 3 ? "good" : "bad"

  return (
    <div className={cn("rounded-2xl border p-5 space-y-4 transition-colors", verdictCardStyles[verdict])}>
      <h2 className="text-center text-lg font-bold tracking-tight text-foreground">BOM OU BAGRE?</h2>

      <div className={cn("flex flex-col items-center gap-1.5 transition-opacity", loaded ? "opacity-100" : "pointer-events-none opacity-0")}>
        <StarRating value={average ?? 0} size="lg" />
        <p className="text-sm font-medium text-muted-foreground">
          {average !== null ? `${average.toFixed(1)} ★ · ${totalCount} review${totalCount === 1 ? "" : "s"}` : "Sem reviews ainda"}
        </p>
      </div>

      <div className="flex flex-col items-center gap-1.5">
        {/* Radix Tooltip só abre em hover/focus por padrão — sem suporte a toque no
            mobile. Controla `open` manualmente pra abrir também com tap. */}
        <Tooltip open={verdictTooltipOpen} onOpenChange={setVerdictTooltipOpen}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setVerdictTooltipOpen((open) => !open)}
              className={cn(
                "cursor-default text-center text-sm font-bold uppercase tracking-wide",
                verdictTitleColor[verdict],
              )}
            >
              {verdictTitle[verdict]}
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="max-w-56 text-center">
            {verdictTooltip[verdict]}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
