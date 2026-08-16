"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Loader2, Package, Plus, TrendingDown } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import BoxLoader from "@/components/ui/box-loader"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { useAuthUser } from "@/components/providers/auth-context"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"

type MyListing = {
  id: string
  title: string
  price_cents: number
  images: string[]
  status: "pending_review" | "active" | "rejected" | "sold" | "removed"
  rejection_reason: string | null
  created_at: string
}

const STATUS_LABEL: Record<MyListing["status"], string> = {
  pending_review: "Em análise",
  active: "Ativo",
  rejected: "Rejeitado",
  sold: "Vendido",
  removed: "Removido",
}

const STATUS_STYLE: Record<MyListing["status"], string> = {
  pending_review: "bg-amber-500/10 text-amber-400",
  active: "bg-emerald-500/10 text-emerald-400",
  rejected: "bg-red-500/10 text-red-400",
  sold: "bg-blue-500/10 text-blue-400",
  removed: "bg-slate-500/10 text-muted-foreground",
}

export default function MeusAnunciosPage() {
  const { user, loading: loadingAuth } = useAuthUser()
  const [listings, setListings] = useState<MyListing[]>([])
  const [loading, setLoading] = useState(true)
  const [priceDialog, setPriceDialog] = useState<{ open: boolean; listing: MyListing | null; value: string }>({
    open: false,
    listing: null,
    value: "",
  })
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/market/listings?mine=1")
      const data = (await res.json()) as { listings?: MyListing[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setListings(data.listings ?? [])
    } catch (err) {
      toast.error("Erro ao carregar seus anúncios", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (user) load()
  }, [user, load])

  async function handleMarkSold(listing: MyListing) {
    try {
      const res = await fetch(`/api/market/listings/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mark_sold: true }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao atualizar")
      toast.success("Anúncio marcado como vendido")
      load()
    } catch (err) {
      toast.error("Erro ao marcar como vendido", {
        description: err instanceof Error ? err.message : undefined,
      })
    }
  }

  async function handleReducePrice() {
    if (!priceDialog.listing) return
    const newPriceCents = Math.round(parseFloat(priceDialog.value.replace(",", ".")) * 100)
    if (!Number.isFinite(newPriceCents) || newPriceCents <= 0) {
      toast.error("Preço inválido")
      return
    }

    setSaving(true)
    try {
      const res = await fetch(`/api/market/listings/${priceDialog.listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ price_cents: newPriceCents }),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Erro ao atualizar preço")
      toast.success("Preço atualizado")
      setPriceDialog({ open: false, listing: null, value: "" })
      load()
    } catch (err) {
      toast.error("Erro ao atualizar preço", {
        description: err instanceof Error ? err.message : undefined,
      })
    } finally {
      setSaving(false)
    }
  }

  if (loadingAuth) return null

  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm text-muted-foreground">Você precisa estar logado para ver seus anúncios.</p>
        <Link href="/login" className="mt-4 inline-block">
          <Button variant="outline" size="sm">Entrar</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <Link
        href="/mercado"
        className="mb-6 flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Voltar ao Mercado
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-black tracking-tight text-foreground">Meus anúncios</h1>
        <Link href="/mercado/novo">
          <Button size="sm" className="gap-2">
            <Plus className="size-3.5" />
            Novo anúncio
          </Button>
        </Link>
      </div>

      {loading ? (
        <div className="flex justify-center py-14">
          <BoxLoader />
        </div>
      ) : listings.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border py-16 text-center">
          <Package className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Você ainda não publicou nenhum anúncio.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {listings.map((listing) => (
            <div
              key={listing.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
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
                  {listing.status === "rejected" && listing.rejection_reason && (
                    <p className="mt-0.5 text-[11px] text-red-400">Motivo: {listing.rejection_reason}</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className={cn("text-[10px]", STATUS_STYLE[listing.status])}>
                  {STATUS_LABEL[listing.status]}
                </Badge>

                {listing.status === "active" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() =>
                        setPriceDialog({
                          open: true,
                          listing,
                          value: (listing.price_cents / 100).toFixed(2).replace(".", ","),
                        })
                      }
                    >
                      <TrendingDown className="size-3.5" />
                      Reduzir preço
                    </Button>
                    <Button size="sm" onClick={() => handleMarkSold(listing)}>
                      Marcar vendido
                    </Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={priceDialog.open} onOpenChange={(open) => setPriceDialog({ ...priceDialog, open })}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Reduzir preço</DialogTitle>
            <DialogDescription>
              O preço só pode cair — nunca subir. Tentar burlar essa regra pode resultar em
              banimento do Mercado.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              type="text"
              inputMode="decimal"
              value={priceDialog.value}
              onChange={(e) => setPriceDialog((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="0,00"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setPriceDialog({ open: false, listing: null, value: "" })}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button onClick={handleReducePrice} disabled={saving}>
              {saving && <Loader2 className="mr-2 size-4 animate-spin" />}
              Salvar novo preço
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
