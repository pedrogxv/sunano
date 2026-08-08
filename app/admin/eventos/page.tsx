"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Edit, Medal, Plus, Trash2 } from "lucide-react"
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
import { MEDAL_RARITY_STYLES } from "@/lib/profile-showcase"
import type { EventDisplay } from "@/lib/events"

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/admin/events")
      const data = (await res.json()) as { events?: EventDisplay[]; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Erro ao carregar")
      setEvents(data.events ?? [])
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao carregar"
      setError(message)
      toast.error("Erro ao carregar conquistas", { description: message })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  async function handleDelete() {
    if (!deleteDialog.id) return
    const target = events.find((e) => e.id === deleteDialog.id)
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/events/${deleteDialog.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Erro ao deletar")
      setEvents((prev) => prev.filter((e) => e.id !== deleteDialog.id))
      setDeleteDialog({ open: false, id: "" })
      toast.success("Conquista deletada", { description: target?.name })
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao deletar"
      setError(message)
      toast.error("Erro ao deletar conquista", { description: message })
    } finally {
      setDeleting(false)
    }
  }

  usePageHeader("Conquistas", "Gerencie as conquistas que concedem medalhas automaticamente.")

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Link href="/admin/eventos/new">
          <Button className="gap-2">
            <Plus className="size-4" />
            Nova conquista
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
      ) : events.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-border py-16 text-center">
          <Medal className="size-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma conquista cadastrada</p>
          <Link href="/admin/eventos/new">
            <Button variant="outline" size="sm" className="gap-2">
              <Plus className="size-3.5" />
              Criar conquista
            </Button>
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Medalha</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Critério</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Progresso</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">Status</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {events.map((e) => (
                <tr key={e.id} className="transition-colors hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
                        MEDAL_RARITY_STYLES[e.rarity]
                      )}>
                        {e.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={e.imageUrl} alt={e.name} className="h-full w-full object-contain p-0.5" />
                        ) : (
                          <Medal className="size-5" />
                        )}
                      </div>
                      <p className="text-sm font-semibold text-foreground">{e.name}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">
                      {e.criteriaType === "manual_opt_in"
                        ? "Resgate manual"
                        : e.criteriaType === "aura_redeem"
                          ? `${e.auraCost?.toLocaleString("pt-BR")} Aura${e.maxParticipants ? ` · ${e.maxParticipants.toLocaleString("pt-BR")} vagas` : " · ilimitado"}`
                          : `Primeiros ${e.maxParticipants?.toLocaleString("pt-BR")} cadastros`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-foreground">
                      {e.maxParticipants !== null ? `${e.currentCount} / ${e.maxParticipants}` : `${e.currentCount} resgates`}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      variant="secondary"
                      className={cn(
                        "text-[10px]",
                        e.active
                          ? "bg-emerald-500/10 text-emerald-400"
                          : "bg-slate-500/10 text-muted-foreground"
                      )}
                    >
                      {e.active ? "Ativo" : "Encerrado"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <Link href={`/admin/eventos/${e.id}`}>
                        <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground">
                          <Edit className="size-3.5" />
                        </Button>
                      </Link>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-red-500/60 hover:text-red-400"
                        onClick={() => setDeleteDialog({ open: true, id: e.id })}
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
            <DialogTitle>Deletar conquista?</DialogTitle>
            <DialogDescription>
              A medalha já concedida a quem participou não é removida — só a conquista deixa de existir.
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
