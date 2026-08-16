"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, Ban, Check, Package, ShieldOff, X } from "lucide-react"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { usePageHeader } from "@/components/providers/page-header-context"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/format"

type ModerationListing = {
  id: string
  title: string
  description: string | null
  price_cents: number
  images: string[]
  status: string
  fee_cents: number
  is_free_vip_slot: boolean
  olx_url: string
  seller_id: string
  seller_display_name: string | null
  seller_market_banned_at: string | null
  created_at: string
}

const TABS = [
  { key: "pending_review", label: "Em análise" },
  { key: "active", label: "Ativos" },
  { key: "rejected", label: "Rejeitados" },
  { key: "sold", label: "Vendidos" },
] as const

export default function AdminMarketPage() {
  const [status, setStatus] = useState<(typeof TABS)[number]["key"]>("pending_review")
  const [listings, setListings] = useState<ModerationListing[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rejectDialog, setRejectDialog] = useState<{ open: boolean; id: string; reason: string }>({
    open: false,
    id: "",
    reason: "",
  })
  const [banDialog, setBanDialog] = useState<{ open: boolean; userId: string; reason: string }>({
    open: false,
    userId: "",
    reason: "",
  })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/market/listings?status=${status}`)
      const data = (await res.json()) as { listings?: ModerationListing[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setListings(data.listings ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar anúncios", { description: message })
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => { load() }, [load])

  async function handleApprove(id: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/admin/market/listings/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao aprovar")
      toast.success("Anúncio aprovado")
      setListings((prev) => prev.filter((l) => l.id !== id))
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
      const res = await fetch(`/api/admin/market/listings/${rejectDialog.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectDialog.reason.trim() }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao rejeitar")
      toast.success("Anúncio rejeitado")
      setListings((prev) => prev.filter((l) => l.id !== rejectDialog.id))
      setRejectDialog({ open: false, id: "", reason: "" })
    } catch (err) {
      toast.error("Erro ao rejeitar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function handleBan() {
    if (!banDialog.reason.trim()) {
      toast.error("Informe o motivo do banimento")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/admin/market/ban", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: banDialog.userId, reason: banDialog.reason.trim() }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao banir")
      toast.success("Vendedor banido do Mercado")
      setBanDialog({ open: false, userId: "", reason: "" })
      load()
    } catch (err) {
      toast.error("Erro ao banir", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  async function handleUnban(userId: string) {
    setBusy(true)
    try {
      const res = await fetch("/api/admin/market/ban", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao desbanir")
      toast.success("Banimento removido")
      load()
    } catch (err) {
      toast.error("Erro ao desbanir", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setBusy(false)
    }
  }

  usePageHeader("Mercado", "Modere os anúncios publicados pela comunidade e gerencie banimentos.")

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
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Package className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum anúncio nesta fila.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div key={listing.id} className="rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="size-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                    {listing.images?.[0] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={listing.images[0]} alt={listing.title} className="h-full w-full object-contain p-1" />
                    ) : (
                      <div className="flex h-full items-center justify-center">
                        <Package className="size-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{listing.title}</p>
                    <p className="text-sm font-bold text-amber-400">{formatBRL(listing.price_cents)}</p>
                    <p className="text-[11px] text-muted-foreground">
                      Vendedor: {listing.seller_display_name ?? listing.seller_id}
                      {listing.is_free_vip_slot ? " · vaga VIP grátis" : ` · taxa ${formatBRL(listing.fee_cents)}`}
                    </p>
                    <a
                      href={listing.olx_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] text-primary hover:underline"
                    >
                      Ver link da OLX
                    </a>
                    {listing.seller_market_banned_at && (
                      <Badge variant="secondary" className="mt-1 block w-fit bg-red-500/10 text-[10px] text-red-400">
                        Vendedor banido do Mercado
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {status === "pending_review" && (
                    <>
                      <Button size="sm" className="gap-1.5" onClick={() => handleApprove(listing.id)} disabled={busy}>
                        <Check className="size-3.5" />
                        Aprovar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => setRejectDialog({ open: true, id: listing.id, reason: "" })}
                        disabled={busy}
                      >
                        <X className="size-3.5" />
                        Rejeitar
                      </Button>
                    </>
                  )}

                  {listing.seller_market_banned_at ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => handleUnban(listing.seller_id)}
                      disabled={busy}
                    >
                      <ShieldOff className="size-3.5" />
                      Desbanir vendedor
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5 border-red-500/40 text-red-400 hover:bg-red-500/10"
                      onClick={() => setBanDialog({ open: true, userId: listing.seller_id, reason: "" })}
                      disabled={busy}
                    >
                      <Ban className="size-3.5" />
                      Banir do Mercado
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={rejectDialog.open} onOpenChange={(open) => setRejectDialog({ ...rejectDialog, open })}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Rejeitar anúncio</DialogTitle>
            <DialogDescription>O vendedor não é reembolsado da taxa paga (quando houver).</DialogDescription>
          </DialogHeader>
          <Input
            value={rejectDialog.reason}
            onChange={(e) => setRejectDialog((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder="Motivo da rejeição"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog({ open: false, id: "", reason: "" })} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleReject} disabled={busy}>
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={banDialog.open} onOpenChange={(open) => setBanDialog({ ...banDialog, open })}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Banir do Mercado</DialogTitle>
            <DialogDescription>
              Impede o usuário de criar ou editar anúncios. O resto da conta continua funcionando normalmente.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={banDialog.reason}
            onChange={(e) => setBanDialog((prev) => ({ ...prev, reason: e.target.value }))}
            placeholder="Motivo do banimento"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setBanDialog({ open: false, userId: "", reason: "" })} disabled={busy}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleBan} disabled={busy}>
              Banir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
