"use client"

import { useEffect, useState } from "react"
import { ArrowBigDown, ArrowBigUp } from "lucide-react"
import { toast } from "sonner"

import { nextReaction, type Reaction } from "@/components/forum/AuraButton"
import { useAuthUser } from "@/components/providers/auth-context"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { notifyAuraChanged } from "@/lib/client/aura-events"
import { cn } from "@/lib/utils"

interface PeripheralVoteBoxProps {
  peripheralId: string
}

/**
 * "BOM OU BAGRE?" — voto binário da comunidade sobre o periférico (não sobre
 * um comentário). Reagir aqui credita Aura pra quem VOTA (não existe "autor"
 * pra premiar, diferente de curtir um comentário) — a missão diária "aura" é
 * fechada no primeiro voto, no servidor (`toggle_peripheral_vote`).
 */
export function PeripheralVoteBox({ peripheralId }: PeripheralVoteBoxProps) {
  const { user: authUser } = useAuthUser()
  const [reaction, setReaction] = useState<Reaction>(null)
  const [likes, setLikes] = useState(0)
  const [dislikes, setDislikes] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [verdictTooltipOpen, setVerdictTooltipOpen] = useState(false)

  useEffect(() => {
    let active = true
    fetch(`/api/peripherals/${peripheralId}/vote`, { cache: "no-store" })
      .then((res) => res.json())
      .then((data: { reaction?: Reaction; likes?: number; dislikes?: number }) => {
        if (!active) return
        setReaction(data.reaction ?? null)
        setLikes(data.likes ?? 0)
        setDislikes(data.dislikes ?? 0)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => {
      active = false
    }
  }, [peripheralId])

  async function handleReact(kind: "like" | "dislike") {
    if (!authUser) return
    const prevReaction = reaction
    const prevLikes = likes
    const prevDislikes = dislikes
    const next = nextReaction(prevReaction, kind)

    let optimisticLikes = prevLikes
    let optimisticDislikes = prevDislikes
    if (prevReaction === "like") optimisticLikes -= 1
    if (prevReaction === "dislike") optimisticDislikes -= 1
    if (next === "like") optimisticLikes += 1
    if (next === "dislike") optimisticDislikes += 1

    setReaction(next)
    setLikes(optimisticLikes)
    setDislikes(optimisticDislikes)

    try {
      const res = await fetch(`/api/peripherals/${peripheralId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao votar")
      setReaction(data.reaction ?? null)
      setLikes(data.likes ?? 0)
      setDislikes(data.dislikes ?? 0)
      notifyAuraChanged()
    } catch (err) {
      setReaction(prevReaction)
      setLikes(prevLikes)
      setDislikes(prevDislikes)
      toast.error(err instanceof Error ? err.message : "Erro ao votar")
    }
  }

  const verdict = likes > dislikes ? "good" : dislikes > likes ? "bad" : "tie"

  const verdictCardStyles: Record<typeof verdict, string> = {
    good: "border-emerald-500/40 bg-emerald-500/10",
    bad: "border-red-500/40 bg-red-500/10",
    tie: "border-border bg-card",
  }

  const verdictTitle: Record<typeof verdict, string> = {
    good: "PERIFÉRICO BOM",
    bad: "PERIFÉRICO DE BAGRE",
    tie: "EMPATE",
  }

  const verdictTitleColor: Record<typeof verdict, string> = {
    good: "text-emerald-400",
    bad: "text-red-400",
    tie: "text-muted-foreground",
  }

  const verdictTooltip: Record<typeof verdict, string> = {
    good: "Periférico bom, maior parte da comunidade julga esse periférico como bom",
    bad: "Periférico de BAGRE: maior parte da comunidade julga esse periférico como ruim ou não recomenda",
    tie: "EMPATE: a comunidade ainda não votou o suficiente para determinar um lado",
  }

  const authTitle = !authUser ? "Entre na sua conta para votar" : undefined

  return (
    <div className={cn("rounded-2xl border p-5 space-y-4 transition-colors", verdictCardStyles[verdict])}>
      <h2 className="text-center text-lg font-bold tracking-tight text-foreground">BOM OU BAGRE?</h2>

      <div className={cn("flex items-center justify-center gap-6 transition-opacity", loaded ? "opacity-100" : "pointer-events-none opacity-0")}>
        <button
          type="button"
          onClick={() => handleReact("like")}
          disabled={!authUser}
          aria-pressed={reaction === "like"}
          aria-label="Bom"
          title={authTitle}
          className={cn(
            "flex size-14 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            reaction === "like"
              ? "border-emerald-500 bg-emerald-500/15 text-emerald-400"
              : "border-border text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400"
          )}
        >
          <ArrowBigUp className="size-8" fill={reaction === "like" ? "currentColor" : "none"} />
        </button>

        <button
          type="button"
          onClick={() => handleReact("dislike")}
          disabled={!authUser}
          aria-pressed={reaction === "dislike"}
          aria-label="Bagre"
          title={authTitle}
          className={cn(
            "flex size-14 items-center justify-center rounded-full border-2 transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            reaction === "dislike"
              ? "border-red-500 bg-red-500/15 text-red-400"
              : "border-border text-muted-foreground hover:border-red-500/50 hover:text-red-400"
          )}
        >
          <ArrowBigDown className="size-8" fill={reaction === "dislike" ? "currentColor" : "none"} />
        </button>
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
        <p className="text-xs font-medium text-muted-foreground">
          👍 {likes} · 👎 {dislikes}
        </p>
      </div>
    </div>
  )
}
