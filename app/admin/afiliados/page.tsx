"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Ban, Check, Handshake, X } from "lucide-react"
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

type AffiliateApplication = {
  id: string
  user_id: string
  code: string | null
  status: "pending" | "approved" | "rejected" | "suspended"
  commission_bps: number
  balance_cents: number
  pix_key: string | null
  pix_key_type: string | null
  rejection_reason: string | null
  created_at: string
}

const TABS = [
  { key: "pending", label: "Solicitações" },
  { key: "approved", label: "Aprovados" },
  { key: "rejected", label: "Rejeitados" },
  { key: "suspended", label: "Suspensos" },
] as const

export default function AdminAfiliadosPage() {
  const [status, setStatus] = useState<(typeof TABS)[number]["key"]>("pending")
  const [affiliates, setAffiliates] = useState<AffiliateApplication[]>([])
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
      const res = await fetch(`/api/admin/afiliados?status=${status}`)
      const data = (await res.json()) as { affiliates?: AffiliateApplication[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setAffiliates(data.affiliates ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar afiliados", { description: message })
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    load()
  }, [load])

  async function handleApprove(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/afiliados/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao aprovar")
      toast.success("Afiliado aprovado")
      setAffiliates((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      toast.error("Erro ao aprovar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function handleReject() {
    if (!rejectDialog.reason.trim()) {
      toast.error("Informe o motivo da rejeição")
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/afiliados/${rejectDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectDialog.reason.trim() }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao rejeitar")
      toast.success("Solicitação rejeitada")
      setAffiliates((prev) => prev.filter((a) => a.id !== rejectDialog.id))
      setRejectDialog({ open: false, id: "", reason: "" })
    } catch (err) {
      toast.error("Erro ao rejeitar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function handleSuspend(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/afiliados/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "suspend" }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao suspender")
      toast.success("Afiliado suspenso")
      setAffiliates((prev) => prev.filter((a) => a.id !== id))
    } catch (err) {
      toast.error("Erro ao suspender", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  usePageHeader("Afiliados", "Aprove solicitações e gerencie o programa de afiliados da loja.")

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
      ) : affiliates.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Handshake className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum afiliado nesta fila.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {affiliates.map((affiliate) => (
            <div key={affiliate.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{affiliate.code ?? "(sem código ainda)"}</p>
                  <p className="text-xs text-muted-foreground">
                    Chave PIX: {affiliate.pix_key_type} — {affiliate.pix_key}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Solicitado em {new Date(affiliate.created_at).toLocaleString("pt-BR")}
                  </p>
                  {affiliate.rejection_reason && (
                    <p className="mt-1 text-xs text-destructive">Motivo: {affiliate.rejection_reason}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant="outline">{(affiliate.commission_bps / 100).toLocaleString("pt-BR")}%</Badge>

                  {status === "pending" && (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => handleApprove(affiliate.id)}>
                        <Check className="mr-1 size-3.5" /> Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={busy}
                        onClick={() => setRejectDialog({ open: true, id: affiliate.id, reason: "" })}
                      >
                        <X className="mr-1 size-3.5" /> Rejeitar
                      </Button>
                    </>
                  )}

                  {status === "approved" && (
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => handleSuspend(affiliate.id)}>
                      <Ban className="mr-1 size-3.5" /> Suspender
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog((d) => ({ ...d, open }))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar solicitação</DialogTitle>
            <DialogDescription>Informe o motivo — o afiliado poderá enviar uma nova solicitação depois.</DialogDescription>
          </DialogHeader>
          <Input
            value={rejectDialog.reason}
            onChange={(e) => setRejectDialog((d) => ({ ...d, reason: e.target.value }))}
            placeholder="Motivo da rejeição"
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
