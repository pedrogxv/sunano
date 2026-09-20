import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"
import { ArrowRight, ExternalLink } from "lucide-react"

import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { PeripheralRequestReviewForm } from "@/components/admin/PeripheralRequestReviewForm"
import { PeripheralRequestStatusBadge } from "@/components/peripherals/requests/PeripheralRequestStatusBadge"
import { hasAdminPermission } from "@/lib/admin-permissions"
import { peripheralRequestNumber } from "@/lib/peripheral-requests"
import { safeHref } from "@/lib/safe-url"
import { getAuthorizedProfile } from "@/lib/server/auth/admin-auth"
import { getPeripheralRequestForAdmin } from "@/lib/server/repositories/peripheral-requests-repository"
import { CATEGORY_PLURAL_LABELS } from "@/lib/tag-options"

export const dynamic = "force-dynamic"

export default async function AdminPeripheralRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const auth = await getAuthorizedProfile()
  if (!auth.profile || !hasAdminPermission(auth.profile, "peripherals_read")) {
    redirect("/admin")
  }
  const canWrite = hasAdminPermission(auth.profile, "peripherals_write")

  const { id } = await params
  const request = await getPeripheralRequestForAdmin(id)
  if (!request) notFound()

  const referenceHref = safeHref(request.reference_url)

  return (
    <div className="space-y-6">
      <BackBreadcrumb
        href="/admin/perifericos/pedidos"
        parentLabel="Pedidos"
        currentLabel={`${request.brand_name} ${request.model_name}`}
      />

      <div className="rounded-xl border border-border bg-card p-4">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <PeripheralRequestStatusBadge status={request.status} />
          <span className="text-xs tabular-nums text-muted-foreground">{peripheralRequestNumber(request.number)}</span>
        </div>
        <h1 className="text-xl font-bold text-foreground">
          {request.brand_name} {request.model_name}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {request.user_display_name ?? "Usuário"}
          {request.user_email ? ` · ${request.user_email}` : ""}
          {" · "}
          {formatDistanceToNow(new Date(request.created_at), { addSuffix: true, locale: ptBR })}
        </p>

        <dl className="mt-4 divide-y divide-border rounded-lg border border-border text-sm">
          <Row label="Categoria">{CATEGORY_PLURAL_LABELS[request.category]}</Row>
          <Row label="Marca">{request.brand_name}</Row>
          <Row label="Modelo">{request.model_name}</Row>
          <Row label="Link">
            {referenceHref ? (
              <a
                href={referenceHref}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex max-w-full items-center gap-1.5 text-primary hover:underline"
              >
                <span className="truncate">{request.reference_url}</span>
                <ExternalLink className="size-3 shrink-0" />
              </a>
            ) : (
              <span className="text-muted-foreground">Não informado</span>
            )}
          </Row>
          <Row label="Observações">
            {request.notes ? (
              <span className="whitespace-pre-wrap">{request.notes}</span>
            ) : (
              <span className="text-muted-foreground">Nenhuma</span>
            )}
          </Row>
        </dl>

        {request.reviewed_at && (
          <p className="mt-3 text-xs text-muted-foreground">
            Última análise{request.reviewed_by_name ? ` por ${request.reviewed_by_name}` : ""}{" "}
            {formatDistanceToNow(new Date(request.reviewed_at), { addSuffix: true, locale: ptBR })}.
          </p>
        )}

        {request.peripheral && (
          <Link
            href={request.peripheral.href}
            target="_blank"
            className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 transition-colors hover:bg-emerald-500/10"
          >
            <span className="truncate text-sm font-medium text-foreground">{request.peripheral.displayName}</span>
            <ArrowRight className="size-4 shrink-0 text-emerald-400" />
          </Link>
        )}
      </div>

      {request.status === "cancelled" ? (
        <p className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          A pessoa cancelou este pedido. Não há mais o que fazer aqui.
        </p>
      ) : canWrite ? (
        <PeripheralRequestReviewForm
          key={`${request.status}:${request.reviewed_at ?? ""}`}
          requestId={request.id}
          initialStatus={request.status}
          initialResponse={request.staff_response}
          initialPeripheral={request.peripheral}
          modelName={request.model_name}
        />
      ) : (
        <p className="rounded-xl border border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
          Seu cargo pode ver os pedidos, mas não respondê-los.
        </p>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[8rem_1fr] sm:gap-4">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-foreground">{children}</dd>
    </div>
  )
}
