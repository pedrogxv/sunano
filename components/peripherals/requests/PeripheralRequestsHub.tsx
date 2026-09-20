"use client"

import Link from "next/link"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ChevronRight, Inbox } from "lucide-react"

import { PeripheralRequestForm } from "@/components/peripherals/requests/PeripheralRequestForm"
import { PeripheralRequestStatusBadge } from "@/components/peripherals/requests/PeripheralRequestStatusBadge"
import BoxLoader from "@/components/ui/box-loader"
import { useAuthUser } from "@/components/providers/auth-context"
import { usePeripheralRequests } from "@/lib/hooks/use-peripheral-requests"
import { MAX_OPEN_PERIPHERAL_REQUESTS, peripheralRequestNumber } from "@/lib/peripheral-requests"
import { CATEGORY_PLURAL_LABELS } from "@/lib/tag-options"

/** Formulário de pedido + "Meus pedidos" numa página só (/perifericos/pedidos). */
export function PeripheralRequestsHub() {
  const { user } = useAuthUser()
  const { requests, openCount, loading, reload } = usePeripheralRequests()

  return (
    <div className="flex flex-col gap-12">
      <PeripheralRequestForm openCount={openCount} onCreated={reload} />

      {user && (
        <section aria-labelledby="meus-pedidos">
          <div className="mb-4 flex items-end justify-between gap-3">
            <div className="space-y-1">
              <h2 id="meus-pedidos" className="text-sm font-semibold uppercase tracking-wider text-foreground">
                Meus pedidos
              </h2>
              <p className="text-xs text-muted-foreground">
                {openCount} de {MAX_OPEN_PERIPHERAL_REQUESTS} em aberto.
              </p>
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <BoxLoader />
            </div>
          ) : requests.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border py-10 text-center">
              <Inbox className="size-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Você ainda não fez nenhum pedido.</p>
            </div>
          ) : (
            <ul className="space-y-3">
              {requests.map((request) => (
                <li key={request.id}>
                  <Link
                    href={`/perifericos/pedidos/${request.id}`}
                    className="flex items-center justify-between gap-4 rounded-xl border border-border bg-muted/20 p-4 transition-colors hover:border-border/70"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="mb-1.5 flex flex-wrap items-center gap-2">
                        <PeripheralRequestStatusBadge status={request.status} />
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {peripheralRequestNumber(request.number)}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(request.updated_at), { addSuffix: true, locale: ptBR })}
                        </span>
                      </div>
                      <p className="truncate text-sm font-medium text-foreground">
                        {request.brand_name} {request.model_name}
                      </p>
                      <p className="text-xs text-muted-foreground">{CATEGORY_PLURAL_LABELS[request.category]}</p>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}
