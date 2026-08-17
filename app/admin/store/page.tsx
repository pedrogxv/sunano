"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, AlertTriangle, Edit, LayoutGrid, MessageSquare, Plus, ShoppingCart, Store, Tag, Trash2 } from "lucide-react"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
import { AnimatedCounter } from "@/components/animated-counter"
import { usePageHeader } from "@/components/providers/page-header-context"
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
import { formatBRL } from "@/lib/format"

interface StoreProduct {
  id: string
  slug: string
  name: string
  price_cents: number
  stock: number | null
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

/* ── Stat chip — também funciona como atalho de filtro ─── */
function StatChip({
  icon: Icon,
  value,
  label,
  colorClass,
  active,
  hoverClass,
  onClick,
}: {
  icon: React.ElementType
  value: number
  label: string
  colorClass: string
  active: boolean
  hoverClass: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-xl border p-3 text-left transition-all duration-200",
        "hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5",
        active ? "border-primary/50 bg-primary/10" : "border-border bg-card/60",
        hoverClass
      )}
    >
      <div className={cn("flex size-7 items-center justify-center rounded-lg", colorClass)}>
        <Icon className="size-3.5" />
      </div>
      <p className="mt-2 text-xl font-bold tabular-nums text-foreground">
        <AnimatedCounter value={value} duration={800} />
      </p>
      <p className="truncate text-[11px] text-muted-foreground">{label}</p>
    </button>
  )
}

const PAGE_SIZE = 50

export default function AdminStorePage() {
  const [products, setProducts] = useState<StoreProduct[]>([])
  const [total, setTotal] = useState(0)
  const [counts, setCounts] = useState({ all: 0, store: 0, bazaar: 0, outOfStock: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<"all" | "store" | "bazaar">("all")
  const [outOfStockOnly, setOutOfStockOnly] = useState(false)
  const [page, setPage] = useState(1)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(PAGE_SIZE) })
      if (filter !== "all") params.set("type", filter)
      if (outOfStockOnly) params.set("outOfStock", "1")
      const res = await fetch(`/api/admin/store/products?${params}`)
      const data = (await res.json()) as { products?: StoreProduct[]; total?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setProducts(data.products ?? [])
      setTotal(data.total ?? 0)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar produtos", { description: message })
    } finally {
      setLoading(false)
    }
  }, [filter, page, outOfStockOnly])

  useEffect(() => { load() }, [load])

  // Contadores dos StatChips (Todos/Loja/Bazar) — vêm do total real de cada
  // filtro no banco, não do array da página atual (que só tem PAGE_SIZE itens).
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch("/api/admin/store/products?pageSize=1").then((r) => r.json()),
      fetch("/api/admin/store/products?type=store&pageSize=1").then((r) => r.json()),
      fetch("/api/admin/store/products?type=bazaar&pageSize=1").then((r) => r.json()),
      fetch("/api/admin/store/products?outOfStock=1&pageSize=1").then((r) => r.json()),
    ])
      .then(([all, store, bazaar, outOfStock]) => {
        if (cancelled) return
        setCounts({ all: all.total ?? 0, store: store.total ?? 0, bazaar: bazaar.total ?? 0, outOfStock: outOfStock.total ?? 0 })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [total])

  useEffect(() => { setPage(1) }, [filter, outOfStockOnly])

  async function handleDelete() {
    if (!deleteDialog.id) return
    const target = products.find((p) => p.id === deleteDialog.id)
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/store/products/${deleteDialog.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao deletar")
      setProducts((prev) => prev.filter((p) => p.id !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "" })
      toast.success("Produto deletado", { description: target?.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao deletar"
      setError(message)
      toast.error("Erro ao deletar produto", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  // O filtro "sem estoque" já é aplicado no banco (query `outOfStockOnly`),
  // então `products` chega pronto — sem filtro adicional em memória.
  const visibleProducts = products

  usePageHeader("Loja", "Gerencie os produtos da loja e os itens do bazar (usados pelo Sunano).")

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex justify-end">
        <div className="flex gap-2">
          <Link href="/admin/store/new?type=store">
            <Button variant="outline" className="gap-2 border-border">
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

      {/* Stats — também funcionam como atalho de filtro */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatChip
          icon={LayoutGrid}
          value={counts.all}
          label="Todos"
          colorClass="bg-primary/15 text-primary"
          active={filter === "all" && !outOfStockOnly}
          hoverClass="hover:border-primary/40 hover:bg-primary/5"
          onClick={() => { setFilter("all"); setOutOfStockOnly(false) }}
        />
        <StatChip
          icon={ShoppingCart}
          value={counts.store}
          label="Loja"
          colorClass="bg-blue-500/15 text-blue-300"
          active={filter === "store"}
          hoverClass="hover:border-blue-400/40 hover:bg-blue-500/5"
          onClick={() => { setFilter((prev) => (prev === "store" ? "all" : "store")); setOutOfStockOnly(false) }}
        />
        <StatChip
          icon={Tag}
          value={counts.bazaar}
          label="Bazar"
          colorClass="bg-amber-500/15 text-amber-300"
          active={filter === "bazaar"}
          hoverClass="hover:border-amber-400/40 hover:bg-amber-500/5"
          onClick={() => { setFilter((prev) => (prev === "bazaar" ? "all" : "bazaar")); setOutOfStockOnly(false) }}
        />
        <StatChip
          icon={AlertTriangle}
          value={counts.outOfStock}
          label="Sem estoque"
          colorClass="bg-red-500/15 text-red-400"
          active={outOfStockOnly}
          hoverClass="hover:border-red-400/40 hover:bg-red-500/5"
          onClick={() => setOutOfStockOnly((prev) => !prev)}
        />
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
      ) : products.length === 0 && outOfStockOnly ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-border py-16 text-center">
          <AlertTriangle className="size-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">Nenhum produto sem estoque</p>
        </div>
      ) : products.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Store className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum produto cadastrado</p>
          <Link href="/admin/store/new">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="size-3.5" />
              Criar produto
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Produto</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Condição</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Preço</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Estoque</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleProducts.map((p) => (
                <tr key={p.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {p.images?.[0] ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <div className="flex h-full items-center justify-center text-[9px] font-bold text-muted-foreground">
                            {p.name.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-foreground">{p.name}</p>
                        {p.category && (
                          <p className="text-[10px] text-muted-foreground">{p.category}</p>
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
                        : p.stock !== null && p.stock <= 3
                          ? "bg-amber-500/15 text-amber-300"
                          : "bg-muted text-foreground/80"
                    )}>
                      {p.stock === null ? "Sem controle" : p.stock === 0 ? "Esgotado" : `${p.stock} un.`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        p.is_active
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-500/10 text-muted-foreground"
                      )}
                    >
                      {p.is_active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link href={`/admin/store/${p.id}/reviews`}>
                        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground">
                          <MessageSquare className="size-3.5" />
                        </Button>
                      </Link>
                      <Link href={`/admin/store/${p.id}`}>
                        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground">
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

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Anterior
          </Button>
          <span className="text-xs text-muted-foreground">Página {page} de {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Próxima
          </Button>
        </div>
      )}

      {/* Delete dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent className="border border-border bg-card">
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
