"use client"

import { useMemo, useState } from "react"
import { Pencil, Plus, Search, ShieldAlert, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { usePageHeader } from "@/components/providers/page-header-context"

type Brand = {
  id: string
  name: string
  createdAt: string
  updatedAt: string
}

const PAGE_SIZE = 20

/**
 * CRUD de marcas de periféricos — single page. Leitura/criação/edição exigem
 * `brands_write`; exclusão é exclusiva do WEB Master (reforçado de novo no
 * endpoint, a checagem aqui só evita mostrar um botão que 403 na certa).
 */
export function BrandsClient({
  initialBrands,
  canWrite,
  canDelete,
}: {
  initialBrands: Brand[]
  canWrite: boolean
  canDelete: boolean
}) {
  usePageHeader("Marcas", "Marcas de periféricos usadas no cadastro da tierlist.")

  const [brands, setBrands] = useState<Brand[]>(initialBrands)
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const [newName, setNewName] = useState("")
  const [creating, setCreating] = useState(false)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState("")
  const [saving, setSaving] = useState(false)

  const [deleteTarget, setDeleteTarget] = useState<Brand | null>(null)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [deleting, setDeleting] = useState(false)

  const filteredBrands = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return brands
    return brands.filter((b) => b.name.toLowerCase().includes(query))
  }, [brands, search])

  const totalPages = Math.max(1, Math.ceil(filteredBrands.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedBrands = useMemo(
    () => filteredBrands.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filteredBrands, safePage]
  )

  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  const deleteConfirmMatches =
    !!deleteTarget && deleteConfirmText.trim().toLowerCase() === deleteTarget.name.trim().toLowerCase()

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const res = await fetch("/api/admin/brands", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = (await res.json().catch(() => null)) as { brand?: Brand; error?: string } | null
      if (!res.ok || !json?.brand) throw new Error(json?.error ?? "Falha ao criar marca.")
      setBrands((prev) => [...prev, json.brand!].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName("")
      toast.success("Marca criada.", { description: json.brand.name })
    } catch (err) {
      toast.error("Falha ao criar marca", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setCreating(false)
    }
  }

  function startEditing(brand: Brand) {
    setEditingId(brand.id)
    setEditingName(brand.name)
  }

  function cancelEditing() {
    setEditingId(null)
    setEditingName("")
  }

  async function handleSaveEdit(id: string) {
    const name = editingName.trim()
    if (!name) return
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/brands/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      const json = (await res.json().catch(() => null)) as { brand?: Brand; error?: string } | null
      if (!res.ok || !json?.brand) throw new Error(json?.error ?? "Falha ao salvar marca.")
      setBrands((prev) =>
        prev.map((b) => (b.id === id ? json.brand! : b)).sort((a, b) => a.name.localeCompare(b.name))
      )
      cancelEditing()
      toast.success("Marca atualizada.")
    } catch (err) {
      toast.error("Falha ao salvar marca", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteConfirm() {
    if (!deleteTarget || !deleteConfirmMatches) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/brands/${deleteTarget.id}`, { method: "DELETE" })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Falha ao excluir marca.")
      setBrands((prev) => prev.filter((b) => b.id !== deleteTarget.id))
      toast.success("Marca excluída.", { description: deleteTarget.name })
      setDeleteTarget(null)
      setDeleteConfirmText("")
    } catch (err) {
      toast.error("Falha ao excluir marca", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <Card className="border-border bg-card/40">
          <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  void handleCreate()
                }
              }}
              placeholder="Nome da nova marca"
              className="border-border bg-background"
            />
            <Button
              onClick={() => void handleCreate()}
              disabled={!newName.trim() || creating}
              className="gap-1.5 shrink-0"
            >
              <Plus className="size-4" />
              {creating ? "Adicionando..." : "Adicionar"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Buscar marca..."
          className="border-border bg-background pl-9"
        />
      </div>

      <Card className="border-border bg-card/40">
        <CardContent className="p-0">
          {filteredBrands.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              {brands.length === 0 ? "Nenhuma marca cadastrada." : "Nenhuma marca encontrada."}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {pagedBrands.map((brand) => {
                const isEditing = editingId === brand.id
                return (
                  <li key={brand.id} className="flex items-center gap-3 px-4 py-2.5">
                    {isEditing ? (
                      <>
                        <Input
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault()
                              void handleSaveEdit(brand.id)
                            }
                            if (e.key === "Escape") cancelEditing()
                          }}
                          autoFocus
                          className="h-8 border-border bg-background"
                        />
                        <Button
                          size="sm"
                          onClick={() => void handleSaveEdit(brand.id)}
                          disabled={!editingName.trim() || saving}
                        >
                          {saving ? "Salvando..." : "Salvar"}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={cancelEditing} disabled={saving}>
                          <X className="size-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 truncate text-sm text-foreground">{brand.name}</span>
                        {canWrite && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => startEditing(brand)}
                            className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="size-3.5" />
                            <span className="hidden sm:inline">Editar</span>
                          </Button>
                        )}
                        {canDelete && (
                          <AlertDialog
                            open={deleteTarget?.id === brand.id}
                            onOpenChange={(open) => {
                              if (!open) {
                                setDeleteTarget(null)
                                setDeleteConfirmText("")
                              }
                            }}
                          >
                            <AlertDialogTrigger asChild>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setDeleteTarget(brand)}
                                className="gap-1.5 border-red-500/30 text-xs text-red-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                              >
                                <Trash2 className="size-3.5" />
                                <span className="hidden sm:inline">Excluir</span>
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2 text-red-400">
                                  <ShieldAlert className="size-4.5" />
                                  Excluir marca &quot;{brand.name}&quot;?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                  Essa ação não pode ser desfeita. Se houver periféricos cadastrados com esta
                                  marca, a exclusão será bloqueada.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">
                                  Digite <span className="font-semibold text-foreground">{brand.name}</span> para confirmar
                                </label>
                                <Input
                                  value={deleteConfirmText}
                                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                                  placeholder={brand.name}
                                  autoComplete="off"
                                  className="border-border bg-background"
                                />
                              </div>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={(e) => {
                                    e.preventDefault()
                                    void handleDeleteConfirm()
                                  }}
                                  disabled={!deleteConfirmMatches || deleting}
                                  className="bg-red-600 text-white hover:bg-red-500 disabled:opacity-40"
                                >
                                  <Trash2 className="mr-1.5 size-3.5" />
                                  {deleting ? "Excluindo..." : "Confirmar exclusão"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {filteredBrands.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Página {safePage} de {totalPages} · {filteredBrands.length} marca{filteredBrands.length === 1 ? "" : "s"}
          </p>
          {totalPages > 1 && (
            <div className="flex gap-1.5">
              {safePage > 1 && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-border text-xs"
                  onClick={() => setPage(safePage - 1)}
                >
                  Anterior
                </Button>
              )}
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                const windowSize = Math.min(totalPages, 5)
                const start = Math.min(Math.max(safePage - 2, 1), totalPages - windowSize + 1)
                const p = start + i
                return (
                  <Button
                    key={p}
                    size="sm"
                    variant={p === safePage ? "default" : "outline"}
                    className={`h-8 w-8 border-border text-xs ${p === safePage ? "" : "text-muted-foreground"}`}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </Button>
                )
              })}
              {safePage < totalPages && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-border text-xs"
                  onClick={() => setPage(safePage + 1)}
                >
                  Próxima
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
