import Link from "next/link"
import { redirect } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { Inbox } from "lucide-react"

import { PeripheralRequestStatusBadge } from "@/components/peripherals/requests/PeripheralRequestStatusBadge"
import { Button } from "@/components/ui/button"
import { hasAdminPermission } from "@/lib/admin-permissions"
import {
  PERIPHERAL_REQUEST_STATUSES,
  PERIPHERAL_REQUEST_STATUS_LABEL,
  peripheralRequestNumber,
} from "@/lib/peripheral-requests"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import {
  getPeripheralRequestStats,
  listPeripheralRequestsForAdmin,
  type AdminRequestStatusFilter,
} from "@/lib/server/repositories/peripheral-requests-repository"
import { CATEGORY_PLURAL_LABELS } from "@/lib/tag-options"
import { cn } from "@/lib/utils"

export const dynamic = "force-dynamic"

const PAGE_SIZE = 20

function parseStatus(value: string | undefined): AdminRequestStatusFilter {
  if (value === "all" || value === "open") return value
  return PERIPHERAL_REQUEST_STATUSES.find((status) => status === value) ?? "open"
}

function queueHref(status: AdminRequestStatusFilter, page = 1) {
  const params = new URLSearchParams()
  if (status !== "open") params.set("status", status)
  if (page > 1) params.set("page", String(page))
  const query = params.toString()
  return `/admin/perifericos/pedidos${query ? `?${query}` : ""}`
}

export default async function AdminPeripheralRequestsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>
}) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "peripherals_read")) {
    redirect("/admin")
  }

  const { status: statusParam, page: pageParam } = await searchParams
  const status = parseStatus(statusParam)
  const page = Math.max(1, Number(pageParam) || 1)

  const [{ requests, total }, stats] = await Promise.all([
    listPeripheralRequestsForAdmin({ status, page, pageSize: PAGE_SIZE }),
    getPeripheralRequestStats(),
  ])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const allCount = PERIPHERAL_REQUEST_STATUSES.reduce((sum, key) => sum + stats[key], 0)

  const filters: Array<{ value: AdminRequestStatusFilter; label: string; count: number }> = [
    { value: "open", label: "Em aberto", count: stats.pending + stats.in_review },
    ...(["pending", "in_review", "added", "duplicate", "rejected", "cancelled"] as const).map((key) => ({
      value: key,
      label: PERIPHERAL_REQUEST_STATUS_LABEL[key],
      count: stats[key],
    })),
    { value: "all", label: "Todos", count: allCount },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.value}
            href={queueHref(filter.value)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
              filter.value === status
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {filter.label}
            <span className="tabular-nums opacity-70">{filter.count}</span>
          </Link>
        ))}
      </div>

      {requests.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Inbox className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum pedido nesta fila.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pedido</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Solicitante</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Enviado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {requests.map((request) => (
                <tr key={request.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <p className="max-w-[300px] truncate text-sm font-semibold text-foreground">
                      {request.brand_name} {request.model_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span className="tabular-nums">{peripheralRequestNumber(request.number)}</span>
                      {" · "}
                      {CATEGORY_PLURAL_LABELS[request.category]}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-foreground">{request.user_display_name ?? "Usuário"}</p>
                  </td>
                  <td className="px-4 py-3">
                    <PeripheralRequestStatusBadge status={request.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(request.created_at), { addSuffix: true, locale: ptBR })}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/perifericos/pedidos/${request.id}`}>Ver pedido</Link>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
            <p className="text-xs text-muted-foreground">
              Página {page} de {totalPages} · {total} pedido{total === 1 ? "" : "s"}
            </p>
            <div className="flex gap-1.5">
              {page > 1 && (
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <Link href={queueHref(status, page - 1)}>Anterior</Link>
                </Button>
              )}
              {page < totalPages && (
                <Button asChild size="sm" variant="outline" className="h-8 text-xs">
                  <Link href={queueHref(status, page + 1)}>Próxima</Link>
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
