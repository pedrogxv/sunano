"use client"

import { useEffect, useState } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

type CommissionEvent = {
  id: string
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

export default function ExtratoAfiliadoPage() {
  const [events, setEvents] = useState<CommissionEvent[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/afiliados/extrato?page=${page}&pageSize=20`)
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events ?? [])
        setHasMore(Boolean(data.hasMore))
      })
      .finally(() => setIsLoading(false))
  }, [page])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-6 font-display text-2xl font-bold tracking-tight">Extrato de comissões</h1>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma movimentação ainda.</p>
      ) : (
        <div className="space-y-3">
          {events.map((event) => (
            <Card key={event.id}>
              <CardContent className="flex items-center justify-between py-2">
                <div>
                  <Badge variant={event.type === "credit" ? "default" : "secondary"}>
                    {TYPE_LABELS[event.type]}
                  </Badge>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {new Date(event.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <span className={event.amount_cents < 0 ? "text-destructive" : "text-foreground"}>
                  {event.amount_cents < 0 ? "-" : "+"}
                  {formatCents(Math.abs(event.amount_cents))}
                </span>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-center gap-2">
        <Button variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
          Anterior
        </Button>
        <Button variant="outline" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
          Próxima
        </Button>
      </div>
    </div>
  )
}
