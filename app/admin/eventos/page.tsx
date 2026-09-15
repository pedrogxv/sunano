"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers"
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { AlertCircle, Edit, GripVertical, Medal, Plus, Trash2 } from "lucide-react"
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

/** Linha arrastável de uma conquista — mesmo padrão de app/admin/banners/page.tsx. */
function SortableEventRow({
  event,
  position,
  onDelete,
}: {
  event: EventDisplay
  position: number
  onDelete: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: event.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-colors",
        isDragging && "z-10 border-primary/40 shadow-lg"
      )}
    >
      <button
        type="button"
        aria-label={`Reordenar conquista ${position}`}
        className="cursor-grab touch-none rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>

      <span className="w-5 shrink-0 text-center text-xs font-bold text-muted-foreground">
        {position}
      </span>

      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border",
          MEDAL_RARITY_STYLES[event.rarity]
        )}
      >
        {event.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={event.imageUrl} alt={event.name} className="h-full w-full object-contain p-0.5" />
        ) : (
          <Medal className="size-5" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{event.name}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {event.criteriaType === "manual_opt_in"
            ? "Resgate manual"
            : event.criteriaType === "aura_redeem"
              ? `${event.auraCost?.toLocaleString("pt-BR")} Aura${event.maxParticipants ? ` · ${event.maxParticipants.toLocaleString("pt-BR")} vagas` : " · ilimitado"}`
              : event.criteriaType === "staff_grant"
                ? "Premiação da Staff"
                : `Primeiros ${event.maxParticipants?.toLocaleString("pt-BR")} cadastros`}
          {event.requiresVip && " · VIP"}
          {" · "}
          {event.maxParticipants !== null
            ? `${event.currentCount} / ${event.maxParticipants}`
            : `${event.currentCount} resgates`}
        </p>
      </div>

      <Badge
        variant="secondary"
        className={cn(
          "shrink-0 text-[10px]",
          event.active ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-500/10 text-muted-foreground"
        )}
      >
        {event.active ? "Ativo" : "Encerrado"}
      </Badge>

      <div className="flex shrink-0 items-center gap-1">
        <Link href={`/admin/eventos/${event.id}`}>
          <Button size="icon" variant="ghost" className="size-8 text-muted-foreground hover:text-foreground">
            <Edit className="size-3.5" />
          </Button>
        </Link>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 text-red-500/60 hover:text-red-400"
          onClick={() => onDelete(event.id)}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}

export default function AdminEventsPage() {
  const [events, setEvents] = useState<EventDisplay[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: "" })
  const [deleting, setDeleting] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

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

  async function handleDragEnd(dragEvent: DragEndEvent) {
    const { active, over } = dragEvent
    if (!over || active.id === over.id) return

    const oldIndex = events.findIndex((e) => e.id === active.id)
    const newIndex = events.findIndex((e) => e.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const previous = events
    const reordered = arrayMove(events, oldIndex, newIndex)
    setEvents(reordered)

    try {
      const res = await fetch("/api/admin/events/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: reordered.map((e) => e.id) }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        throw new Error(data?.error ?? "Erro ao reordenar.")
      }
    } catch (err) {
      setEvents(previous)
      const message = err instanceof Error ? err.message : "Erro ao reordenar."
      toast.error("Não foi possível reordenar", { description: message })
    }
  }

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={events.map((e) => e.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {events.map((e, index) => (
                <SortableEventRow
                  key={e.id}
                  event={e}
                  position={index + 1}
                  onDelete={(id) => setDeleteDialog({ open: true, id })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent className="border border-border bg-card">
          <DialogHeader>
            <DialogTitle>Deletar conquista?</DialogTitle>
            <DialogDescription>
              A medalha já concedida a quem participou não é removida; só a conquista deixa de existir.
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
