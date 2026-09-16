"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  AlertCircle,
  AlertTriangle,
  CreditCard,
  Crown,
  ExternalLink,
  Gift,
  Loader2,
  QrCode,
  Receipt,
  RefreshCw,
  ShieldOff,
  Ban,
} from "lucide-react"
import { toast } from "sonner"

import BoxLoader from "@/components/ui/box-loader"
import { BackBreadcrumb } from "@/components/admin/BackBreadcrumb"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Button } from "@/components/ui/button"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"
import { safeHref } from "@/lib/safe-url"
import type { VipAdminRow } from "@/lib/server/repositories/vip-admin-repository"

type AsaasState = {
  status: string
  deleted: boolean
  nextDueDate: string | null
  valueCents: number | null
}

type PaymentRow = {
  id: string
  status: string
  valueCents: number | null
  dueDate: string | null
  paymentDate: string | null
  billingType: string | null
  invoiceUrl: string | null
  receiptUrl: string | null
}

type DetailResponse = {
  vip: VipAdminRow
  asaas: AsaasState | null
  payments: PaymentRow[]
  asaasUnavailable: boolean
  syncFailed: boolean
  /** Cosmético: o guard das rotas de escrita é quem de fato autoriza. */
  canWrite: boolean
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  const date = iso.length === 10 ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })
}

const SUBSCRIPTION_STATUS: Record<string, { label: string; className: string }> = {
  active: { label: "Ativa", className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  past_due: { label: "Em atraso", className: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  pending: { label: "Aguardando pagamento", className: "bg-sky-500/15 text-sky-400 border-sky-500/30" },
  canceled: { label: "Cancelada", className: "bg-muted text-muted-foreground border-border" },
  expired: { label: "Expirada", className: "bg-muted text-muted-foreground border-border" },
}

/** Status de cobrança da Asaas, nos termos que o admin entende. */
const PAYMENT_STATUS: Record<string, { label: string; className: string }> = {
  RECEIVED: { label: "Recebido", className: "text-emerald-400" },
  CONFIRMED: { label: "Confirmado", className: "text-emerald-400" },
  RECEIVED_IN_CASH: { label: "Recebido em dinheiro", className: "text-emerald-400" },
  PENDING: { label: "Aguardando", className: "text-sky-400" },
  OVERDUE: { label: "Vencido", className: "text-amber-400" },
  REFUNDED: { label: "Estornado", className: "text-muted-foreground" },
  REFUND_REQUESTED: { label: "Estorno pedido", className: "text-muted-foreground" },
  CHARGEBACK_REQUESTED: { label: "Chargeback", className: "text-red-400" },
  CHARGEBACK_DISPUTE: { label: "Chargeback em disputa", className: "text-red-400" },
  DELETED: { label: "Removida", className: "text-muted-foreground" },
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm text-foreground">{children}</span>
    </div>
  )
}

export default function AdminVipDetailPage() {
  const params = useParams<{ userId: string }>()
  const userId = params.userId

  const [detail, setDetail] = useState<DetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [cancelOpen, setCancelOpen] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [grantOpen, setGrantOpen] = useState(false)
  const [grantMonths, setGrantMonths] = useState("1")

  usePageHeader("VIPs", "Assinaturas VIP: estado na Asaas, cobranças e concessão manual.")

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/vips/${userId}`)
      const data = (await res.json()) as DetailResponse & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setDetail(data)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar VIP", { description: message })
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    load()
  }, [load])

  async function act(
    path: string,
    body: unknown,
    messages: { success: string; failure: string }
  ) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/vips/${userId}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      })
      const data = (await res.json()) as { error?: string; unverified?: boolean; changed?: boolean }
      if (!res.ok) throw new Error(data.error ?? messages.failure)

      if (data.unverified) {
        toast.warning("A Asaas não pôde ser consultada", {
          description: "Nada foi alterado. Tente de novo em instantes.",
        })
      } else if (path === "sync" && data.changed === false) {
        toast.success("Tudo certo", { description: "O estado local já batia com a Asaas." })
      } else {
        toast.success(messages.success)
      }

      setCancelOpen(false)
      setRevokeOpen(false)
      setGrantOpen(false)
      await load()
    } catch (err) {
      toast.error(messages.failure, {
        description: err instanceof Error ? err.message : "Erro inesperado",
      })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <BoxLoader />
      </div>
    )
  }

  if (error || !detail) {
    return (
      <div className="space-y-6">
        <BackBreadcrumb href="/admin/vips" parentLabel="VIPs" />
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 p-3">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-red-400" />
          <p className="text-sm text-red-400">{error ?? "VIP não encontrado."}</p>
        </div>
      </div>
    )
  }

  const { vip, asaas, payments, asaasUnavailable, canWrite } = detail
  const subscription = vip.subscription
  const status = subscription ? SUBSCRIPTION_STATUS[subscription.status] : null
  const canCancel =
    canWrite &&
    subscription?.asaasSubscriptionId != null &&
    (subscription.status === "active" ||
      subscription.status === "past_due" ||
      subscription.status === "pending")

  return (
    <div className="space-y-6">
      <BackBreadcrumb href="/admin/vips" parentLabel="VIPs" currentLabel={vip.displayName} />

      {/* Cabeçalho do membro */}
      <div className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
        <UserAvatar name={vip.displayName} avatarUrl={vip.avatarUrl} size={14} frame={vip.frame} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-lg font-semibold text-foreground">{vip.displayName}</h2>
            {vip.vipActive ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-400">
                <Crown className="size-3" />
                VIP ativo
              </span>
            ) : (
              <span className="rounded-md border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                sem VIP
              </span>
            )}
          </div>
          {vip.email && <p className="truncate text-sm text-muted-foreground">{vip.email}</p>}
          {vip.displaySlug && (
            <Link
              href={`/perfil/${vip.displaySlug}`}
              className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              ver perfil público
              <ExternalLink className="size-3" />
            </Link>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={busy} className="gap-1.5">
            <RefreshCw className={cn("size-3.5", busy && "animate-spin")} />
            Recarregar
          </Button>
          {canWrite && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  act("sync", {}, { success: "Sincronizado com a Asaas.", failure: "Falha ao sincronizar" })
                }
                disabled={busy}
                className="gap-1.5"
              >
                <RefreshCw className="size-3.5" />
                Sincronizar com a Asaas
              </Button>
              <Button size="sm" onClick={() => setGrantOpen(true)} disabled={busy} className="gap-1.5">
                <Gift className="size-3.5" />
                Conceder VIP
              </Button>
            </>
          )}
        </div>
      </div>

      {asaasUnavailable && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <p className="text-sm text-amber-400">
            Não foi possível consultar a Asaas agora. O que aparece abaixo é o estado local —
            cobranças e status na origem podem estar desatualizados.
          </p>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Acesso VIP */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            <Crown className="size-4 text-amber-400" />
            Acesso VIP
          </h3>
          <div className="divide-y divide-border">
            <InfoRow label="Situação">
              {vip.vipActive ? (
                <span className="text-emerald-400">ativo</span>
              ) : (
                <span className="text-muted-foreground">inativo</span>
              )}
            </InfoRow>
            <InfoRow label="Válido até">
              {vip.vipExpiresAt === null ? (
                <span className="text-amber-400">sem expiração</span>
              ) : (
                formatDate(vip.vipExpiresAt)
              )}
            </InfoRow>
            <InfoRow label="Origem">
              {vip.origin === "subscription" ? "Assinatura recorrente" : "Aura ou concessão manual"}
            </InfoRow>
          </div>

          {canWrite && vip.vipActive && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setRevokeOpen(true)}
              disabled={busy}
              className="mt-4 w-full gap-1.5 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:text-red-400"
            >
              <ShieldOff className="size-3.5" />
              Revogar VIP
            </Button>
          )}
        </div>

        {/* Assinatura */}
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
            {subscription?.paymentMethod === "pix" ? (
              <QrCode className="size-4 text-sky-400" />
            ) : (
              <CreditCard className="size-4 text-sky-400" />
            )}
            Assinatura na Asaas
          </h3>

          {!subscription ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Este membro nunca teve assinatura recorrente.
            </p>
          ) : (
            <>
              <div className="divide-y divide-border">
                <InfoRow label="Status local">
                  <span
                    className={cn(
                      "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium",
                      status?.className
                    )}
                  >
                    {status?.label ?? subscription.status}
                  </span>
                </InfoRow>
                <InfoRow label="Status na Asaas">
                  {asaas ? (
                    <span className={asaas.deleted ? "text-muted-foreground" : "text-foreground"}>
                      {asaas.deleted ? "excluída" : asaas.status}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </InfoRow>
                <InfoRow label="Forma de pagamento">
                  {subscription.paymentMethod === "pix" ? "PIX" : "Cartão de crédito"}
                </InfoRow>
                {/* Plano CONTRATADO (fonte do tempo de acesso concedido) ao
                    lado do valor REAL cobrado na Asaas. É esse par que revela
                    uma divergência: R$ 8,90 num plano anual, ou vice-versa,
                    significa assinatura editada fora do fluxo — o webhook
                    barra a cobrança e o acesso não avança. */}
                <InfoRow label="Plano">
                  {subscription.billingPeriod === "yearly"
                    ? `Anual · ${formatBRL(subscription.priceCents)}/ano`
                    : `Mensal · ${formatBRL(subscription.priceCents)}/mês`}
                </InfoRow>
                <InfoRow label="Valor cobrado na Asaas">
                  {asaas?.valueCents != null ? formatBRL(asaas.valueCents) : "—"}
                </InfoRow>
                <InfoRow label="Próxima cobrança">{formatDate(asaas?.nextDueDate ?? null)}</InfoRow>
                <InfoRow label="Fim do período pago">
                  {formatDate(subscription.currentPeriodEnd)}
                </InfoRow>
                {subscription.canceledAt && (
                  <InfoRow label="Cancelada em">{formatDate(subscription.canceledAt)}</InfoRow>
                )}
                <InfoRow label="ID na Asaas">
                  <code className="rounded bg-muted px-1.5 py-0.5 text-[11px]">
                    {subscription.asaasSubscriptionId ?? "—"}
                  </code>
                </InfoRow>
              </div>

              {canCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCancelOpen(true)}
                  disabled={busy}
                  className="mt-4 w-full gap-1.5"
                >
                  <Ban className="size-3.5" />
                  Cancelar assinatura
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Cobranças */}
      {subscription?.asaasSubscriptionId && (
        <div className="rounded-xl border border-border bg-card">
          <h3 className="flex items-center gap-2 border-b border-border px-5 py-4 text-sm font-semibold text-foreground">
            <Receipt className="size-4 text-muted-foreground" />
            Cobranças da assinatura
          </h3>

          {payments.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {asaasUnavailable
                ? "Não foi possível carregar as cobranças."
                : "Nenhuma cobrança gerada ainda."}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vencimento</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Pago em</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">Valor</th>
                    <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {payments.map((payment) => {
                    const meta = PAYMENT_STATUS[payment.status]
                    const link = safeHref(payment.receiptUrl ?? payment.invoiceUrl ?? "")
                    return (
                      <tr key={payment.id} className="transition-colors hover:bg-muted/30">
                        <td className="px-5 py-3 text-sm text-foreground">{formatDate(payment.dueDate)}</td>
                        <td className="px-5 py-3">
                          <span className={cn("text-sm", meta?.className ?? "text-muted-foreground")}>
                            {meta?.label ?? payment.status}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-sm text-muted-foreground">
                          {formatDate(payment.paymentDate)}
                        </td>
                        <td className="px-5 py-3 text-right text-sm tabular-nums text-foreground">
                          {payment.valueCents != null ? formatBRL(payment.valueCents) : "—"}
                        </td>
                        <td className="px-5 py-3 text-right">
                          {link && (
                            <a
                              href={link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                            >
                              {payment.receiptUrl ? "comprovante" : "fatura"}
                              <ExternalLink className="size-3" />
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Diálogos ─────────────────────────────────────────────────── */}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancelar assinatura</DialogTitle>
            <DialogDescription>
              A cobrança recorrente na Asaas é encerrada agora.{" "}
              <strong className="text-foreground">O VIP já pago não é retirado</strong> — o acesso
              vale até {formatDate(vip.vipExpiresAt)}. Para tirar o acesso na hora, use Revogar VIP.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCancelOpen(false)} disabled={busy}>
              Voltar
            </Button>
            <Button
              onClick={() =>
                act(
                  "cancel",
                  {},
                  { success: "Assinatura cancelada na Asaas.", failure: "Falha ao cancelar" }
                )
              }
              disabled={busy}
              className="gap-2"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />}
              Cancelar assinatura
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={revokeOpen} onOpenChange={setRevokeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revogar VIP</DialogTitle>
            <DialogDescription>
              O membro volta a ser comum <strong className="text-foreground">imediatamente</strong>,
              mesmo que haja período pago restante.
              {canCancel && " A assinatura na Asaas é cancelada junto, para não seguir cobrando."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRevokeOpen(false)} disabled={busy}>
              Voltar
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                act(
                  "grant",
                  { revoke: true },
                  { success: "VIP revogado.", failure: "Falha ao revogar" }
                )
              }
              disabled={busy}
              className="gap-2"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldOff className="size-4" />}
              Revogar VIP
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={grantOpen} onOpenChange={setGrantOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conceder VIP</DialogTitle>
            <DialogDescription>
              O tempo é somado ao VIP atual (nunca encurta) e nenhuma cobrança é criada na Asaas.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">Duração</label>
            <Select value={grantMonths} onValueChange={setGrantMonths}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 mês</SelectItem>
                <SelectItem value="3">3 meses</SelectItem>
                <SelectItem value="6">6 meses</SelectItem>
                <SelectItem value="12">12 meses</SelectItem>
                <SelectItem value="lifetime">Sem expiração</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setGrantOpen(false)} disabled={busy}>
              Voltar
            </Button>
            <Button
              onClick={() =>
                act(
                  "grant",
                  grantMonths === "lifetime" ? { lifetime: true } : { months: Number(grantMonths) },
                  { success: "VIP concedido.", failure: "Falha ao conceder" }
                )
              }
              disabled={busy}
              className="gap-2"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Crown className="size-4" />}
              Conceder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
