"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowDownLeft, ArrowUpRight, Receipt, SlidersHorizontal } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

type CommissionEvent = {
  id: string
  order_id: string | null
  type: "credit" | "refund_debit" | "adjustment" | "payout_debit"
  amount_cents: number
  order_total_cents: number
  commission_bps: number
  note: string | null
  created_at: string
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const TYPE_META: Record<
  CommissionEvent["type"],
  { label: string; description: string; variant: "default" | "secondary" | "outline" }
> = {
  credit: {
    label: "Comissão",
    description: "Venda confirmada pelo seu link.",
    variant: "default",
  },
  refund_debit: {
    label: "Estorno",
    description: "O cliente foi reembolsado, então a comissão foi devolvida.",
    variant: "secondary",
  },
  adjustment: {
    label: "Ajuste",
    description: "Correção manual feita pela equipe.",
    variant: "outline",
  },
  payout_debit: {
    label: "Saque pago",
    description: "Valor enviado para a sua chave PIX.",
    variant: "outline",
  },
}

/**
 * Um `refund_debit` gravado pelo fluxo de chargeback carrega a origem em
 * `note` (ver `syncCommissionForChargeback`) — sem isso, uma disputa de cartão
 * apareceria como um "estorno" comum e o afiliado não entenderia de onde veio.
 */
function describeEvent(event: CommissionEvent): string {
  if (event.note === "chargeback") {
    return "O cliente abriu uma disputa no cartão. Se a loja vencer, o valor volta."
  }
  if (event.note === "chargeback_reversal") {
    return "A loja venceu a disputa no cartão e a comissão voltou para você."
  }
  return TYPE_META[event.type].description
}

export default function ExtratoAfiliadoPage() {
  const [events, setEvents] = useState<CommissionEvent[]>([])
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    setIsLoading(true)
    fetch(`/api/afiliados/extrato?page=${page}&pageSize=20`)
      .then((res) => res.json())
      .then((data) => {
        setEvents(data.events ?? [])
        setTotal(data.total ?? 0)
        setHasMore(Boolean(data.hasMore))
      })
      .finally(() => setIsLoading(false))
  }, [page])

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2 text-muted-foreground">
        <Link href="/afiliados">
          <ArrowLeft className="size-4" /> Painel do afiliado
        </Link>
      </Button>

      <h1 className="font-display text-2xl font-bold tracking-tight">Extrato de comissões</h1>
      <p className="mb-6 mt-1 text-sm text-muted-foreground">
        Todas as movimentações do seu saldo, incluindo os saques já pagos. Para pedir um saque ou
        acompanhar um em análise, vá em{" "}
        <Link href="/afiliados/saques" className="font-medium text-primary underline-offset-4 hover:underline">
          Saques
        </Link>
        .
      </p>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : events.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Receipt className="mx-auto mb-3 size-8 text-muted-foreground/50" />
            <p className="text-sm font-medium">Nenhuma movimentação ainda</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
              Assim que alguém comprar pelo seu link e o pagamento for confirmado, a comissão
              aparece aqui.
            </p>
            <Button asChild variant="outline" size="sm" className="mt-4">
              <Link href="/afiliados">Voltar ao painel</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {events.map((event) => {
            const meta = TYPE_META[event.type]
            const isPositive = event.amount_cents >= 0
            return (
              <Card key={event.id}>
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={meta.variant} className="gap-1">
                          {isPositive ? (
                            <ArrowUpRight className="size-3" />
                          ) : (
                            <ArrowDownLeft className="size-3" />
                          )}
                          {meta.label}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(event.created_at).toLocaleString("pt-BR")}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">{describeEvent(event)}</p>
                      {/* De onde saiu o número: sem isto, "R$ 4,50" é um valor
                          sem origem e qualquer dúvida vira ticket de suporte.
                          Um saque não tem pedido nem percentual por trás, então
                          essa linha simplesmente não se aplica a ele. */}
                      {event.type !== "payout_debit" && event.order_id && (
                        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <SlidersHorizontal className="size-3 shrink-0" />
                          {(event.commission_bps / 100).toLocaleString("pt-BR")}% sobre{" "}
                          {formatCents(event.order_total_cents)}
                          <span className="text-muted-foreground/60">
                            · pedido {event.order_id.slice(0, 8)}
                          </span>
                        </p>
                      )}
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-display text-lg font-semibold tabular-nums",
                        isPositive ? "text-foreground" : "text-destructive"
                      )}
                    >
                      {isPositive ? "+" : "−"}
                      {formatCents(Math.abs(event.amount_cents))}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {(hasMore || page > 1) && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">
            Página {page}
            {total > 0 && ` · ${total} ${total === 1 ? "movimentação" : "movimentações"}`}
          </span>
          <Button variant="outline" size="sm" disabled={!hasMore} onClick={() => setPage((p) => p + 1)}>
            Próxima
          </Button>
        </div>
      )}
    </div>
  )
}
