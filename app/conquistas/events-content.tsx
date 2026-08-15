"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Medal, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { EventCard } from "@/components/events/EventCard"
import { AchievementsGrid } from "@/components/profile/AchievementsGrid"
import { notifyAuraChanged } from "@/lib/client/aura-events"
import type { EventDisplay } from "@/lib/events"
import type { AchievementTrack, ShowcaseAchievement } from "@/lib/achievements"

interface EventsContentProps {
  initialEvents: EventDisplay[]
  initialClaimedMedalIds: string[]
  initialAuraBalance: number
  isLoggedIn: boolean
  /** Conquistas gerais (posts/comentários/seguidores) já desbloqueadas — vazio quando deslogado. */
  achievements: ShowcaseAchievement[]
  achievementCounts: Record<AchievementTrack, number>
}

/**
 * Client Component da página `/conquistas`: mantém o estado local dos eventos
 * (contador de vagas, status) para atualização otimista após um resgate
 * manual, no mesmo espírito de `LikeButton`/`forum-content.tsx` — sem
 * depender de revalidar a página inteira a cada clique. `auraBalance`
 * segue o mesmo padrão: decrementado otimisticamente num resgate
 * `aura_redeem`, reconciliado com o evento retornado pela API.
 */
export function EventsContent({
  initialEvents,
  initialClaimedMedalIds,
  initialAuraBalance,
  isLoggedIn,
  achievements,
  achievementCounts,
}: EventsContentProps) {
  const router = useRouter()
  const [events, setEvents] = useState(initialEvents)
  const [claimedMedalIds, setClaimedMedalIds] = useState(() => new Set(initialClaimedMedalIds))
  const [auraBalance, setAuraBalance] = useState(initialAuraBalance)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const { active, ended } = useMemo(() => {
    const active: EventDisplay[] = []
    const ended: EventDisplay[] = []
    for (const event of events) (event.active ? active : ended).push(event)
    return { active, ended }
  }, [events])

  async function handleClaim(event: EventDisplay) {
    if (pendingId) return

    if (!isLoggedIn) {
      router.push("/login")
      return
    }

    setPendingId(event.id)
    try {
      const res = await fetch(`/api/conquistas/${event.id}/claim`, { method: "POST" })
      const data = (await res.json().catch(() => null)) as { event?: EventDisplay; error?: string } | null

      if (res.status === 401) {
        router.push("/login")
        return
      }

      if (!res.ok || !data?.event) {
        toast.error(data?.error ?? "Não foi possível resgatar essa medalha.")
        return
      }

      setEvents((prev) => prev.map((e) => (e.id === event.id ? data.event! : e)))
      setClaimedMedalIds((prev) => new Set(prev).add(event.medalId))
      if (event.criteriaType === "aura_redeem" && event.auraCost) {
        setAuraBalance((prev) => prev - event.auraCost!)
        notifyAuraChanged()
      }
      toast.success("Medalha resgatada!", { description: event.name })
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-2 py-6 sm:px-4 md:px-6 lg:px-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Conquistas
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medalhas por tempo ou vagas limitadas. Passe o mouse sobre um card para ver os detalhes.
        </p>
      </div>

      {isLoggedIn && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Gerais
            </h2>
          </div>
          <AchievementsGrid achievements={achievements} counts={achievementCounts} showTitle={false} />
        </section>
      )}

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-border bg-card/50 py-16 text-center">
          <Medal className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum evento no momento. Volte em breve!</p>
        </div>
      ) : (
        <>
          {active.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Eventos em andamento
                </h2>
              </div>
              <div className="flex flex-wrap gap-6">
                {active.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    claimed={claimedMedalIds.has(event.medalId)}
                    isLoggedIn={isLoggedIn}
                    auraBalance={auraBalance}
                    pending={pendingId === event.id}
                    onClaim={() => handleClaim(event)}
                  />
                ))}
              </div>
            </section>
          )}

          {ended.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <Medal className="size-4 text-muted-foreground" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  Eventos encerrados
                </h2>
              </div>
              <div className="flex flex-wrap gap-6">
                {ended.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    claimed={claimedMedalIds.has(event.medalId)}
                    isLoggedIn={isLoggedIn}
                    auraBalance={auraBalance}
                    pending={false}
                    onClaim={() => handleClaim(event)}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  )
}
