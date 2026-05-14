"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Edit, Plus, Store, Tag, Trash2 } from "lucide-react"
import BoxLoader from "@/components/ui/box-loader"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { formatBRL } from "@/lib/stripe"

interface StoreProduct {
  id: string
  slug: string
  name: string
  price_cents: number
  stock: number
  images: string[]
  category: string | null
  type: "store" | "bazaar"
  condition: "new" | "used" | "opened"
  is_active: boolean
  created_at: string
}

const CONDITION_LABEL: Record<string, string> = {
  new: "Novo",
  opened: "Emb. aberta",
  used: "Usado",
}

const CONDITION_COLOR: Record<string, string> = {
  new: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  opened: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  used: "text-orange-400 bg-orange-500/10 border-orange-500/30",
}

export default function AdminStorePage() {
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "store" | "bazaar">("all")
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const url = filter === "all" ? "/api/admin/store/products" : `/api/admin/store/products?type=${filter}`
      const res = await fetch(url)
      const data = (await res.json()) as { products?: StoreProduct[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setProducts(data.products ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar")
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    if (!deleteDialog.id) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/store/products/${deleteDialog.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao deletar")
      setProducts((prev) => prev.filter((p) => p.id !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "" })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao deletar")
    } finally {
      setDeleting(false)
    }
  }

  const storeCount = products.filter((p) => p.type === "store").length
  const bazaarCount = products.filter((p) => p.type === "bazaar").length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-50">Loja & Bazar</h1>
          <p className="mt-1 text-sm text-slate-400">
            Gerencie os produtos da loja e os itens do bazar (usados pelo Sunano)
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/store/new?type=store">
            <Button variant="outline" className="gap-2 border-white/[0.12]">
              <Plus className="size-4" />
              Novo produto
            </Button>
          </Link>
          <Link href="/admin/store/new?type=bazaar">
            <Button className="gap-2">
              <Tag className="size-4" />
              Item do Bazar
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Todos", value: products.length, key: "all" as const },
          { label: "Loja", value: storeCount, key: "store" as const },
          { label: "Bazar", value: bazaarCount, key: "bazaar" as const },
          {
            label: "Sem estoque",
            value: products.filter((p) => p.stock === 0).length,
            key: "all" as const,
          },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => setFilter(stat.key)}
            className={cn(
              "rounded-xl border p-4 text-left transition-all",
              filter === stat.key && stat.key !== "all"
                ? "border-primary/40 bg-primary/10"
                : "border-white/[0.08] bg-white/[0.02] hover:border-white/[0.15]"
            )}
          >
            <p className="text-2xl font-black text-slate-100">{stat.value}</p>
            <p className="mt-0.5 text-xs text-slate-500">{stat.label}</p>
          </button>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex rounded-lg border border-white/[0.08] bg-white/[0.02] p-1 w-fit">
        {(["all", "store", "bazaar"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "rounded-md px-4 py-2 text-sm font-medium transition-all",
              filter === f
                ? "bg-primary/20 text-primary"
                : "text-slate-400 hover:bg-white/[0.05] hover:text-slate-200"
            )}
          >
            {f === "all" ? "Todos" : f === "store" ? "🛒 Loja" : "♻️ Bazar"}
          </button>
        ))}
      </div>

      {error && (
        <Alert className="border-red-500/30 bg-red-500/10 py-2">
          <AlertCircle className="size-3.5 text-red-400" />
          <AlertDescription className="text-xs text-red-300">{error}</AlertDescription>
        </Alert>
      )}

      {/* Products table */}
      {loading ? (
        <div className="flex justify-center py-14">
          <BoxLoader />
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/[0.08] py-16 text-center">
          <Store className="size-10 text-slate-700" />
          <p className="text-sm text-slate-500">Nenhum produto cadastrado</p>
          <Link href="/admin/store/new">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="size-3.5" />
              Criar produto
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-card">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.08]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Condição</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Preço</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Estoque</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {products.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-white/[0.02]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-white/[0.05]">
                        {p.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[9px] font-bold text-slate-600">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-slate-200">{p.name}</p>
                        {p.category && (
                          <p className="text-[10px] text-slate-600">{p.category}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                      p.type === "store"
                        ? "bg-blue-500/15 text-blue-300"
                        : "bg-amber-500/15 text-amber-300"
                    )}>
                      {p.type === "store" ? "🛒 Loja" : "♻️ Bazar"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                      CONDITION_COLOR[p.condition]
                    )}>
                      {CONDITION_LABEL[p.condition]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-emerald-400 text-sm">{formatBRL(p.price_cents)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-bold",
                      p.stock === 0
                        ? "bg-red-500/15 text-red-400"
                        : p.stock <= 3
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-white/[0.06] text-slate-300"
                    )}>
                      {p.stock === 0 ? "Esgotado" : `${p.stock} un.`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        p.is_active
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-500/10 text-slate-500"
                      )}
                    >
                      {p.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link href={`/admin/store/${p.id}`}>
                        <Button size="icon" variant="ghost" className="size-8 text-slate-400 hover:text-slate-100">
                          <Edit className="size-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-red-500/60 hover:text-red-400"
                        onClick={() => setDeleteDialog({ open: true, id: p.id })}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent className="border border-white/[0.12] bg-[#0a0e17]/95">
          <DialogHeader>
            <DialogTitle>Deletar produto?</DialogTitle>
            <DialogDescription>Esta ação não pode ser desfeita.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, id: "" })} disabled={deleting}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deletando..." : "Deletar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
