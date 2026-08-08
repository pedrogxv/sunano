"use client"

import Image from "next/image"
import Link from "next/link"
import { ArrowRight, Award, CheckCircle2, Sparkles } from "lucide-react"
import { useEffect, useState } from "react"

import { MEDAL_RARITY_SOLID, MEDAL_RARITY_STYLES } from "@/lib/profile-showcase"
import type { EventDisplay } from "@/lib/events"
import { cn } from "@/lib/utils"

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
            Medalhas por tempo ou vagas limitadas — ainda dá tempo de resgatar
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
      <div className="flex flex-wrap gap-4">
        {events.map((event) => {
          const claimed = claimedMedalIds.has(event.medalId)
          const ringColor = MEDAL_RARITY_SOLID[event.rarity]

          return (
            <Link
              key={event.id}
              href="/conquistas"
              style={{ "--glow-color": ringColor } as React.CSSProperties}
              className={cn(
                "event-card-glow event-card-glow-strong group relative flex w-48 shrink-0 flex-col items-center gap-3 rounded-2xl border-2 bg-card p-6 text-center transition-transform hover:z-10 hover:-translate-y-1",
                MEDAL_RARITY_STYLES[event.rarity]
              )}
            >
              {claimed && (
                <span className="absolute left-2.5 top-2.5 flex size-5 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                  <CheckCircle2 className="size-3.5" />
                </span>
              )}

              <div className="flex size-20 items-center justify-center rounded-full bg-card">
                {event.imageUrl ? (
                  <Image
                    src={event.imageUrl}
                    alt={event.name}
                    width={48}
                    height={48}
                    className="size-12 object-contain"
                  />
                ) : (
                  <Award className="size-9" />
                )}
              </div>

              <p className="line-clamp-1 text-sm font-semibold text-foreground">{event.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {event.maxParticipants !== null ? `${event.currentCount}/${event.maxParticipants} vagas` : `${event.currentCount} resgates`}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
