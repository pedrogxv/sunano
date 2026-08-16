"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Check, Package, X } from "lucide-react"
import { toast } from "sonner"

import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

type PayoutRequest = {
  id: string
  affiliate_id: string
  amount_cents: number
  status: "requested" | "paid" | "rejected" | "cancelled"
  pix_key: string
  pix_key_type: string
  created_at: string
}

function formatCents(cents: number) {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
}

const TABS = [
  { key: "requested", label: "Pendentes" },
  { key: "paid", label: "Pagos" },
  { key: "rejected", label: "Rejeitados" },
] as const

export default function AdminAfiliadosSaquesPage() {
  const [status, setStatus] = useState<(typeof TABS)[number]["key"]>("requested")
  const [payouts, setPayouts] = useState<PayoutRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; id: string; reason: string }>({
    open: false,
    id: "",
    reason: "",
  })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/afiliados/saques?status=${status}`)
      const data = (await res.json()) as { payouts?: PayoutRequest[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setPayouts(data.payouts ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar saques", { description: message })
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  async function handleMarkPaid(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/afiliados/saques/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid" }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao marcar como pago")
      toast.success("Saque marcado como pago")
      setPayouts((prev) => prev.filter((p) => p.id !== id))
    } catch (err) {
      toast.error("Erro ao marcar como pago", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/afiliados/saques/${rejectDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectDialog.reason.trim() || undefined }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao rejeitar")
      toast.success("Saque rejeitado")
      setPayouts((prev) => prev.filter((p) => p.id !== rejectDialog.id))
      setRejectDialog({ open: false, id: "", reason: "" })
    } catch (err) {
      toast.error("Erro ao rejeitar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  usePageHeader("Saques de Afiliados", "Pague manualmente e marque como concluído, ou rejeite a solicitação.")

  return (
    <div className="space-y-6">
      <div className="flex rounded-lg border border-border bg-muted/30 p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatus(tab.key)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-all",
              status === tab.key
                ? "bg-primary/20 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

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
      ) : payouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Package className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum saque nesta fila.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payouts.map((payout) => (
            <div key={payout.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{formatCents(payout.amount_cents)}</p>
                  <p className="text-xs text-muted-foreground">
                    Chave PIX: {payout.pix_key_type} — {payout.pix_key}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Solicitado em {new Date(payout.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>

                {status === "requested" && (
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">Pendente</Badge>
                    <Button size="sm" disabled={busy} onClick={() => handleMarkPaid(payout.id)}>
                      <Check className="mr-1 size-3.5" /> Marcar como pago
                    </Button>
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => setRejectDialog({ open: true, id: payout.id, reason: "" })}
                    >
                      <X className="mr-1 size-3.5" /> Rejeitar
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog((d) => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar saque</DialogTitle>
            <DialogDescription>O saldo do afiliado permanece disponível para uma nova solicitação.</DialogDescription>
          </DialogHeader>
          <Input
            value={rejectDialog.reason}
            onChange={(e) => setRejectDialog((d) => ({ ...d, reason: e.target.value }))}
            placeholder="Motivo (opcional)"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, id: "", reason: "" })}>
              Cancelar
            </Button>
            <Button variant="destructive" disabled={busy} onClick={handleReject}>
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
