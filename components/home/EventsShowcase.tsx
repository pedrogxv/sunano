"use client"

import Link from "next/link"
import { ArrowRight, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

import { MedalCard } from "@/components/events/MedalCard"
import type { EventDisplay } from "@/lib/events"

/**
 * Prévia de eventos na Home — estrutura de dados (lista de eventos ativos)
 * vem do server (`getHomeData`, cacheável/ISR); "já resgatei essa?" é
 * personalização por usuário e por isso é buscada aqui no client, no mesmo
 * espírito do `isAdmin` em `PublicSidebar`, sem depender de tornar a Home
 * inteira dinâmica por causa de uma seção.
 */
export function EventsShowcase({ events }: { events: EventDisplay[] }) {
  const [claimedMedalIds, setClaimedMedalIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let mounted = true
    fetch("/api/conquistas/resgataveis")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { claimedMedalIds?: string[] } | null) => {
        if (mounted && data?.claimedMedalIds) setClaimedMedalIds(new Set(data.claimedMedalIds))
      })
      .catch(() => {})
    return () => {
      mounted = false
    }
  }, [])

  if (events.length === 0) return null

  return (
    <section>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <Sparkles className="size-5 text-primary" />
            <h2 className="text-xl font-bold tracking-tight text-foreground md:text-2xl">
              Conquistas em destaque
            </h2>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground md:text-sm">
            Medalhas por tempo ou vagas limitadas, ainda dá tempo de resgatar
          </p>
        </div>
        <Link
          href="/conquistas"
          className="group flex shrink-0 items-center gap-1 rounded-lg border border-border bg-muted/40 px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:border-foreground/20 hover:bg-muted hover:text-foreground"
        >
          Ver todos
          <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>

      {/* flex-wrap com cards de largura fixa (não grid de colunas fixas): a
          fileira acompanha a quantidade real de eventos em vez de reservar
          um número fixo de "slots" vazios quando há só 1 ou 2. */}
      <div className="flex flex-wrap gap-6">
        {events.map((event) => (
          <Link
            key={event.id}
            href="/conquistas"
            aria-label={`${event.name} — ver conquistas`}
            className="w-48 shrink-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MedalCard
              event={event}
              claimed={claimedMedalIds.has(event.medalId)}
              glow="strong"
            />
          </Link>
        ))}
      </div>
    </section>
  )
}
