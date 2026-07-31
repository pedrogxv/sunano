"use client"

import { useState } from "react"
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
import { ChevronDown, ChevronRight, Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"

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
import { Label } from "@/components/ui/label"

type Category = {
  id: string
  parentId: string | null
  slug: string
  name: string
  sortOrder: number
  isActive: boolean
}

type CategoryNode = Category & { children: Category[] }

function buildTree(categories: Category[]): CategoryNode[] {
  const roots = categories.filter((c) => !c.parentId).sort((a, b) => a.sortOrder - b.sortOrder)
  return roots.map((root) => ({
    ...root,
    children: categories
      .filter((c) => c.parentId === root.id)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  }))
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
}

/**
 * CRUD + reordenação (drag and drop) das categorias do fórum. A hierarquia
 * é fixa em 2 níveis: cada raiz tem sua própria lista de subcategorias, e
 * cada nível reordena de forma independente (um `DndContext` por raiz para
 * suas filhas, e um para a lista de raízes).
 */
export function CategoriesClient({
  initialCategories,
  canWrite,
}: {
  initialCategories: Category[]
  canWrite: boolean
}) {
  const [categories, setCategories] = useState<Category[]>(initialCategories)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [parentForNew, setParentForNew] = useState<string | null>(null)
  const [name, setName] = useState("")
  const [slug, setSlug] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState(false)

  const tree = buildTree(categories)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function openCreate(parentId: string | null) {
    setEditing(null)
    setParentForNew(parentId)
    setName("")
    setSlug("")
    setFormOpen(true)
  }

  function openEdit(category: Category) {
    setEditing(category)
    setParentForNew(category.parentId)
    setName(category.name)
    setSlug(category.slug)
    setFormOpen(true)
  }

  async function handleSubmit() {
    if (!canWrite) return
    try {
      setSaving(true)
      if (editing) {
        const res = await fetch(`/api/admin/forum/categories/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, slug }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao salvar categoria.")
        setCategories((prev) => prev.map((c) => (c.id === editing.id ? { ...c, name, slug } : c)))
        toast.success("Categoria atualizada")
      } else {
        const res = await fetch("/api/admin/forum/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parentId: parentForNew, name, slug }),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao criar categoria.")
        const created = data.category as Category
        setCategories((prev) => [...prev, created])
        toast.success(parentForNew ? "Subcategoria criada" : "Categoria criada")
        if (parentForNew) setExpanded((prev) => new Set(prev).add(parentForNew))
      }
      setFormOpen(false)
    } catch (err) {
      toast.error("Erro ao salvar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive(category: Category) {
    if (!canWrite) return
    const previous = categories
    setCategories((prev) =>
      prev.map((c) => (c.id === category.id ? { ...c, isActive: !c.isActive } : c))
    )
    try {
      const res = await fetch(`/api/admin/forum/categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !category.isActive }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setCategories(previous)
      toast.error("Erro ao alterar categoria")
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    try {
      setDeleting(true)
      const res = await fetch(`/api/admin/forum/categories/${deleteTarget.id}`, { method: "DELETE" })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error ?? "Erro ao excluir categoria.")
      setCategories((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      setDeleteTarget(null)
      toast.success("Categoria excluída")
    } catch (err) {
      toast.error("Erro ao excluir", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setDeleting(false)
    }
  }

  async function persistOrder(orderedIds: string[]) {
    try {
      const res = await fetch("/api/admin/forum/categories/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: orderedIds }),
      })
      if (!res.ok) throw new Error()
    } catch {
      toast.error("Erro ao reordenar categorias")
    }
  }

  function applyOrder(orderedIds: string[]) {
    setCategories((prev) => {
      const next = [...prev]
      const indexById = new Map(orderedIds.map((id, index) => [id, index]))
      for (const category of next) {
        const index = indexById.get(category.id)
        if (index !== undefined) category.sortOrder = index
      }
      return next
    })
  }

  function handleRootDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const ids = tree.map((r) => r.id)
    const oldIndex = ids.indexOf(active.id as string)
    const newIndex = ids.indexOf(over.id as string)
    if (oldIndex === -1 || newIndex === -1) return
    const reordered = arrayMove(ids, oldIndex, newIndex)
    applyOrder(reordered)
    persistOrder(reordered)
  }

  function handleChildDragEnd(children: Category[]) {
    return (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      const ids = children.map((c) => c.id)
      const oldIndex = ids.indexOf(active.id as string)
      const newIndex = ids.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return
      const reordered = arrayMove(ids, oldIndex, newIndex)
      applyOrder(reordered)
      persistOrder(reordered)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Categorias do Fórum</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Categoria e subcategoria usadas para classificar os posts (ex: Teclado &gt; Magnético).
          </p>
        </div>
        {canWrite && (
          <Button className="gap-2" onClick={() => openCreate(null)}>
            <Plus className="size-4" />
            Nova categoria
          </Button>
        )}
      </div>

      {tree.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Nenhuma categoria cadastrada.
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
          onDragEnd={handleRootDragEnd}
        >
          <SortableContext items={tree.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">
              {tree.map((root) => (
                <div key={root.id} className="rounded-xl border border-border bg-card">
                  <SortableCategoryRow
                    category={root}
                    hasChildren={root.children.length > 0}
                    expanded={expanded.has(root.id)}
                    onToggleExpand={() => toggleExpanded(root.id)}
                    onEdit={() => openEdit(root)}
                    onToggleActive={() => handleToggleActive(root)}
                    onDelete={() => setDeleteTarget(root)}
                    onAddChild={() => openCreate(root.id)}
                    canWrite={canWrite}
                  />
                  {expanded.has(root.id) && root.children.length > 0 && (
                    <div className="border-t border-border/50 p-2 pl-8">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
                        onDragEnd={handleChildDragEnd(root.children)}
                      >
                        <SortableContext
                          items={root.children.map((c) => c.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-1.5">
                            {root.children.map((child) => (
                              <SortableCategoryRow
                                key={child.id}
                                category={child}
                                hasChildren={false}
                                expanded={false}
                                onEdit={() => openEdit(child)}
                                onToggleActive={() => handleToggleActive(child)}
                                onDelete={() => setDeleteTarget(child)}
                                canWrite={canWrite}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="border border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar categoria" : parentForNew ? "Nova subcategoria" : "Nova categoria"}
            </DialogTitle>
            <DialogDescription>
              {parentForNew && !editing
                ? "Subcategoria dentro da categoria selecionada."
                : "Categoria usada para classificar posts do fórum."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nome</Label>
              <Input
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (!editing) setSlug(slugify(e.target.value))
                }}
                placeholder="Ex: Teclado"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Slug</Label>
              <Input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} placeholder="ex-teclado" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFormOpen(false)}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={saving || !name.trim() || !slug.trim()}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent className="border border-border bg-card sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir categoria</DialogTitle>
            <DialogDescription>
              Excluir &quot;{deleteTarget?.name}&quot;? Categorias com posts ou subcategorias não podem ser
              excluídas — desative-as em vez disso.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function SortableCategoryRow({
  category,
  hasChildren,
  expanded,
  onToggleExpand,
  onEdit,
  onToggleActive,
  onDelete,
  onAddChild,
  canWrite,
}: {
  category: Category
  hasChildren: boolean
  expanded: boolean
  onToggleExpand?: () => void
  onEdit: () => void
  onToggleActive: () => void
  onDelete: () => void
  onAddChild?: () => void
  canWrite: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
  })

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-lg p-2.5 transition-colors ${
        isDragging ? "z-10 border border-primary/40 bg-card shadow-lg" : ""
      } ${!category.isActive ? "opacity-50" : ""}`}
    >
      {canWrite && (
        <button
          type="button"
          aria-label="Reordenar"
          className="cursor-grab touch-none rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      )}

      {onToggleExpand ? (
        <button type="button" onClick={onToggleExpand} className="text-muted-foreground hover:text-foreground">
          {hasChildren ? (
            expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />
          ) : (
            <span className="inline-block size-4" />
          )}
        </button>
      ) : (
        <span className="inline-block size-4" />
      )}

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{category.name}</p>
        <p className="truncate text-xs text-muted-foreground">/{category.slug}</p>
      </div>

      {canWrite && (
        <div className="flex shrink-0 items-center gap-1">
          {onAddChild && (
            <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={onAddChild}>
              <Plus className="size-3.5" />
              Sub
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            onClick={onToggleActive}
            title={category.isActive ? "Desativar" : "Ativar"}
          >
            {category.isActive ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={onEdit} title="Editar">
            <Pencil className="size-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
            onClick={onDelete}
            title="Excluir"
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
