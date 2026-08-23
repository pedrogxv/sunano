"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Edit, Plus, Sparkles, Trash2 } from "lucide-react"
import { toast } from "sonner"
import BoxLoader from "@/components/ui/box-loader"
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
import type { AuraItemAdmin } from "@/lib/server/repositories/aura-store-repository"

export default function AdminAuraItemsPage() {
  const [items, setItems] = useState<AuraItemAdmin[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/aura-itens")
      const data = (await res.json()) as { items?: AuraItemAdmin[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setItems(data.items ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar itens de Aura", { description: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    if (!deleteDialog.id) return
    const target = items.find((i) => i.id === deleteDialog.id)
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/aura-itens/${deleteDialog.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao deletar")
      setItems((prev) => prev.filter((i) => i.id !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "" })
      toast.success("Item deletado", { description: target?.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao deletar"
      setError(message)
      toast.error("Erro ao deletar item", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  usePageHeader("Itens de Aura", "Gerencie o catálogo de molduras de avatar compráveis com Aura na Central de Aura.")

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href="/admin/aura-itens/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            Novo item
          </Button>
        </Link>
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
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Sparkles className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum item cadastrado</p>
          <Link href="/admin/aura-itens/new">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="size-3.5" />
              Criar item
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Item</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Custo</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Ordem</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
                        {item.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <Sparkles className="size-5 text-muted-foreground" />
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground">{item.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      🔥 {item.auraCost.toLocaleString("pt-BR")} Aura
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">{item.sortOrder}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        item.active
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-500/10 text-muted-foreground"
                      )}
                    >
                      {item.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link href={`/admin/aura-itens/${item.id}`}>
                        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground">
                          <Edit className="size-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-red-500/60 hover:text-red-400"
                        onClick={() => setDeleteDialog({ open: true, id: item.id })}
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

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Deletar item?</DialogTitle>
            <DialogDescription>
              Quem já resgatou este item perde a moldura (ela some do perfil equipado, se estiver em uso).
            </DialogDescription>
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
