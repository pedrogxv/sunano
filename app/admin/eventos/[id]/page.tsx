"use client"

import { useEffect, useState } from "react"
import { useRouter, useParams } from "next/navigation"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { EventForm } from "../form"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"
import type { EventDisplay } from "@/lib/events"

export default function EditEventPage() {
  const router = useRouter()
  const { id } = useParams<{ id: string }>()
  const [event, setEvent] = useState<EventDisplay | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/admin/events/${id}`)
        const data = (await res.json()) as { event?: EventDisplay; error?: string }
        if (!res.ok || !data.event) throw new Error(data.error ?? "Evento não encontrado")
        setEvent(data.event)
      } catch (err) {
        const message = err instanceof Error ? err.message : "Erro ao carregar"
        setError(message)
        toast.error("Erro ao carregar evento", { description: message })
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  usePageHeader("Editar evento", event ? event.name : "Atualize os dados do evento e da medalha.")

  const currentLabel = event?.name ?? (loading ? "Carregando…" : "Editar evento")

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <BackBreadcrumb href="/admin/eventos" parentLabel="Eventos" currentLabel={currentLabel} />
        <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-border bg-card/40 py-20">
          <BoxLoader />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">Carregando evento…</p>
            <p className="mt-1 text-xs text-muted-foreground">Buscando dados da medalha e do progresso.</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !event) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <BackBreadcrumb href="/admin/eventos" parentLabel="Eventos" />
        <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
          <p className="text-sm text-red-400">{error ?? "Evento não encontrado"}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <BackBreadcrumb href="/admin/eventos" parentLabel="Eventos" currentLabel={event.name} />
      <div className="rounded-xl border border-border bg-card p-6">
        <EventForm
          event={event}
          onSuccess={() => router.push("/admin/eventos")}
          onCancel={() => router.push("/admin/eventos")}
        />
      </div>
    </div>
  )
}
