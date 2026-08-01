"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Medal, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { EventCard } from "@/components/events/EventCard"
import type { EventDisplay } from "@/lib/events"

interface EventsContentProps {
  initialEvents: EventDisplay[]
  initialClaimedMedalIds: string[]
  isLoggedIn: boolean
}

/**
 * Client Component da página `/eventos`: mantém o estado local dos eventos
 * (contador de vagas, status) para atualização otimista após um resgate
 * manual, no mesmo espírito de `LikeButton`/`forum-content.tsx` — sem
 * depender de revalidar a página inteira a cada clique.
 */
export function EventsContent({ initialEvents, initialClaimedMedalIds, isLoggedIn }: EventsContentProps) {
  const router = useRouter()
  const [events, setEvents] = useState(initialEvents)
  const [claimedMedalIds, setClaimedMedalIds] = useState(() => new Set(initialClaimedMedalIds))
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
      const res = await fetch(`/api/eventos/${event.id}/claim`, { method: "POST" })
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
      toast.success("Medalha resgatada!", { description: event.name })
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 md:px-6 lg:px-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-foreground md:text-4xl">
          Eventos
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medalhas por tempo ou vagas limitadas. Passe o mouse sobre um card para ver os detalhes.
        </p>
      </div>

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
                  Em andamento
                </h2>
              </div>
              <div className="flex flex-wrap gap-6">
                {active.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    claimed={claimedMedalIds.has(event.medalId)}
                    isLoggedIn={isLoggedIn}
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
                  Encerrados
                </h2>
              </div>
              <div className="flex flex-wrap gap-6">
                {ended.map((event) => (
                  <EventCard
                    key={event.id}
                    event={event}
                    claimed={claimedMedalIds.has(event.medalId)}
                    isLoggedIn={isLoggedIn}
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
