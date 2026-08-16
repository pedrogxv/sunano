"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Receipt } from "lucide-react"
import { toast } from "sonner"

import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"

type CommissionEvent = {
  id: string
  affiliate_id: string
  order_id: string
  type: "credit" | "refund_debit" | "adjustment"
  amount_cents: number
  created_at: string
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const TYPE_LABELS: Record<CommissionEvent["type"], string> = {
  credit: "Comissão",
  refund_debit: "Estorno",
  adjustment: "Ajuste",
}

export default function AdminAfiliadosComissoesPage() {
  const [events, setEvents] = useState<CommissionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/afiliados/comissoes?pageSize=50")
      const data = (await res.json()) as { events?: CommissionEvent[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setEvents(data.events ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar comissões", { description: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  usePageHeader("Comissões", "Histórico de comissões geradas e estornadas para afiliados.")

  return (
    <div className="space-y-6">
      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex justify-center py-14">
          <BoxLoader />
        </div>
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Receipt className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma comissão registrada ainda.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <div key={event.id} className="flex items-center justify-between rounded-xl border border-border bg-card p-4">
              <div>
                <Badge variant={event.type === "credit" ? "default" : "secondary"}>{TYPE_LABELS[event.type]}</Badge>
                <p className="mt-1 text-xs text-muted-foreground">Pedido {event.order_id}</p>
                <p className="text-xs text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</p>
              </div>
              <span className={event.amount_cents < 0 ? "text-destructive" : "text-foreground"}>
                {event.amount_cents < 0 ? "-" : "+"}
                {formatCents(Math.abs(event.amount_cents))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
