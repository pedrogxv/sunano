import { Medal } from "lucide-react"

import { listActiveEventsForDisplay } from "@/lib/server/repositories/events-repository"
import { EventCard } from "@/components/events/EventCard"

export const revalidate = 30

export default async function EventosPage() {
  const events = await listActiveEventsForDisplay()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-foreground">Eventos Ativos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Medalhas por tempo ou vagas limitadas. Passe o mouse sobre um card para ver os detalhes.
        </p>
      </div>

      {events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Medal className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum evento no momento. Volte em breve!</p>
        </div>
      ) : (
        <div className="flex flex-wrap gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
