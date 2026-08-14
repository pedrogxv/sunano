"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"

import { AuraButton, nextReaction, type Reaction } from "@/components/forum/AuraButton"
import { useAuthUser } from "@/components/providers/auth-context"
import { notifyAuraChanged } from "@/lib/client/aura-events"
import { cn } from "@/lib/utils"

interface PeripheralVoteBoxProps {
  peripheralId: string
}

/**
 * "BOM OU BAGRE?" — voto binário da comunidade sobre o periférico (não sobre
 * um comentário), mesmo widget visual do `AuraButton` do fórum. Reagir aqui
 * credita Aura pra quem VOTA (não existe "autor" pra premiar, diferente de
 * curtir um comentário) — a missão diária "aura" é fechada no primeiro voto,
 * no servidor (`toggle_peripheral_vote`).
 */
export function PeripheralVoteBox({ peripheralId }: PeripheralVoteBoxProps) {
  const { user: authUser } = useAuthUser()
  const [reaction, setReaction] = useState<Reaction>(null)
  const [likes, setLikes] = useState(0)
  const [dislikes, setDislikes] = useState(0)
  const [loaded, setLoaded] = useState(false)

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

  const verdictStyles: Record<typeof verdict, string> = {
    good: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    bad: "border-red-500/30 bg-red-500/10 text-red-300",
    tie: "border-border bg-muted/40 text-muted-foreground",
  }

  const verdictText: Record<typeof verdict, string> = {
    good: "Periférico bom, maior parte da comunidade julga esse periférico como bom",
    bad: "Periférico de BAGRE: Maior parte da comunidade julga esse periférico como ruim ou não recomenda",
    tie: "EMPATE: A comunidade ainda não votou o suficiente para determinar um lado",
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold tracking-tight text-foreground">BOM OU BAGRE?</h2>
        <div className={cn("transition-opacity", loaded ? "opacity-100" : "pointer-events-none opacity-0")}>
          <AuraButton
            auraCount={likes - dislikes}
            reaction={reaction}
            disabled={!authUser}
            onReact={handleReact}
          />
        </div>
      </div>

      <div className={cn("rounded-xl border px-4 py-3 text-sm font-medium", verdictStyles[verdict])}>
        {verdictText[verdict]}
      </div>

      <p className="text-xs text-muted-foreground">
        Se você já teve ou testou esse periférico, recomendamos deixar o seu feedback na parte dos comentários.
      </p>
    </div>
  )
}
