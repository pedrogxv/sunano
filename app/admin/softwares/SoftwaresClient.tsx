"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { ExternalLink, ImagePlus, Pencil, Plus, ShieldAlert, Trash2 } from "lucide-react"
import { toast } from "sonner"

import { usePageHeader } from "@/components/providers/page-header-context"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Combobox } from "@/components/ui/combobox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { safeHref } from "@/lib/safe-url"
import { compareSoftwareNames, type Software } from "@/lib/softwares"

type Brand = { id: string; name: string }

type FormState = { brandId: string; logoUrl: string; hubUrl: string }

const EMPTY_FORM: FormState = { brandId: "", logoUrl: "", hubUrl: "" }

const LOGO_ACCEPT = "image/png,image/webp,image/jpeg"

/**
 * Cadastro dos cards de /softwares: marca, logo e link do Web Hub. O mesmo
 * formulário do topo serve para criar e editar.
 */
export function SoftwaresClient({
  initialSoftwares,
  canWrite,
}: {
  initialSoftwares: Software[]
  canWrite: boolean
}) {
  usePageHeader("Softwares", "Web hubs das marcas exibidos em /softwares.")

  const [softwares, setSoftwares] = useState<Software[]>(initialSoftwares)
  const [editing, setEditing] = useState<Software | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const formRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [brands, setBrands] = useState<Brand[]>([])
  const [loadingBrands, setLoadingBrands] = useState(canWrite)

  const [deleteTarget, setDeleteTarget] = useState<Software | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    if (!canWrite) return
    let cancelled = false
    fetch("/api/admin/brands", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((json: { brands?: Brand[] } | null) => {
        if (!cancelled) setBrands(json?.brands ?? [])
      })
      .catch(() => {
        if (!cancelled) toast.error("Não foi possível carregar as marcas.")
      })
      .finally(() => {
        if (!cancelled) setLoadingBrands(false)
      })
    return () => {
      cancelled = true
    }
  }, [canWrite])

  // Marca que já tem card some do seletor (o banco também recusa), menos a do
  // card que está sendo editado.
  const brandOptions = useMemo(() => {
    const taken = new Set(softwares.filter((s) => s.id !== editing?.id).map((s) => s.brandId))
    return brands.filter((b) => !taken.has(b.id)).map((b) => ({ value: b.id, label: b.name }))
  }, [brands, softwares, editing])

  const canSave = Boolean(form.brandId && form.logoUrl && form.hubUrl.trim()) && !saving && !uploading

  function resetForm() {
    setEditing(null)
    setForm(EMPTY_FORM)
  }

  function startEditing(software: Software) {
    setEditing(software)
    setForm({ brandId: software.brandId, logoUrl: software.logoUrl, hubUrl: software.hubUrl })
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  async function handleUpload(file: File) {
    setUploading(true)
    try {
      const body = new FormData()
      body.append("file", file)
      const res = await fetch("/api/admin/softwares/upload-image", { method: "POST", body })
      const data = (await res.json().catch(() => null)) as { publicUrl?: string; error?: string } | null
      if (!res.ok || !data?.publicUrl) throw new Error(data?.error ?? "Erro ao enviar a logo.")
      const publicUrl = data.publicUrl
      setForm((prev) => ({ ...prev, logoUrl: publicUrl }))
    } catch (err) {
      toast.error("Erro no upload", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ""
    }
  }

  async function handleSave() {
    if (!canSave) return
    setSaving(true)
    try {
      const res = await fetch(editing ? `/api/admin/softwares/${editing.id}` : "/api/admin/softwares", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, hubUrl: form.hubUrl.trim() }),
      })
      const json = (await res.json().catch(() => null)) as { software?: Software; error?: string } | null
      if (!res.ok || !json?.software) throw new Error(json?.error ?? "Falha ao salvar o software.")
      const saved = json.software
      setSoftwares((prev) => [...prev.filter((s) => s.id !== saved.id), saved].sort(compareSoftwareNames))
      toast.success(editing ? "Software atualizado." : "Software criado.", { description: saved.name })
      resetForm()
    } catch (err) {
      toast.error("Falha ao salvar", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    setDeleting(true)
    try {
      const res = await fetch(`/api/admin/softwares/${target.id}`, { method: "DELETE" })
      const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Falha ao excluir o software.")
      setSoftwares((prev) => prev.filter((s) => s.id !== target.id))
      if (editing?.id === target.id) resetForm()
      toast.success("Software excluído.", { description: target.name })
      setDeleteTarget(null)
    } catch (err) {
      toast.error("Falha ao excluir", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div ref={formRef} className="scroll-mt-24">
          <Card className="border-border bg-card/40">
            <CardContent className="space-y-4 p-4">
              <p className="text-sm font-semibold text-foreground">
                {editing ? `Editando ${editing.name}` : "Novo software"}
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Marca</Label>
                  <Combobox
                    options={brandOptions}
                    value={form.brandId}
                    onValueChange={(value) => setForm((prev) => ({ ...prev, brandId: value }))}
                    placeholder={loadingBrands ? "Carregando marcas..." : "Selecionar marca"}
                    searchPlaceholder="Buscar marca..."
                    emptyText="Nenhuma marca disponível."
                    disabled={loadingBrands}
                    className="border-border bg-background"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="software-hub-url">Link do Web Hub</Label>
                  <Input
                    id="software-hub-url"
                    type="url"
                    inputMode="url"
                    value={form.hubUrl}
                    onChange={(e) => setForm((prev) => ({ ...prev, hubUrl: e.target.value }))}
                    placeholder="https://"
                    className="border-border bg-background"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Logo da marca</Label>
                <div className="flex items-center gap-3">
                  <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/30">
                    {form.logoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={form.logoUrl} alt="" className="size-full object-contain" />
                    ) : (
                      <ImagePlus className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? "Enviando..." : form.logoUrl ? "Trocar logo" : "Enviar logo"}
                    </Button>
                    <p className="text-[11px] leading-snug text-muted-foreground">
                      PNG, WebP ou JPG, de preferência quadrada e sem margem sobrando.
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={LOGO_ACCEPT}
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) void handleUpload(file)
                    }}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                {editing && (
                  <Button variant="ghost" onClick={resetForm} disabled={saving}>
                    Cancelar
                  </Button>
                )}
                <Button onClick={() => void handleSave()} disabled={!canSave} className="gap-1.5">
                  {!editing && <Plus className="size-4" />}
                  {saving ? "Salvando..." : editing ? "Salvar" : "Adicionar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="border-border bg-card/40">
        <CardContent className="p-0">
          {softwares.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nenhum software cadastrado.</p>
          ) : (
            <ul className="divide-y divide-border">
              {softwares.map((software) => (
                <li key={software.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="size-11 shrink-0 overflow-hidden rounded-lg bg-muted/30">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={software.logoUrl} alt="" className="size-full object-contain" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{software.name}</p>
                    <a
                      href={safeHref(software.hubUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                    >
                      <ExternalLink className="size-3 shrink-0" />
                      <span className="truncate">{software.hubUrl}</span>
                    </a>
                  </div>
                  {canWrite && (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEditing(software)}
                        className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Pencil className="size-3.5" />
                        <span className="hidden sm:inline">Editar</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setDeleteTarget(software)}
                        className="gap-1.5 border-red-500/30 text-xs text-red-400 hover:border-red-500/50 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="size-3.5" />
                        <span className="hidden sm:inline">Excluir</span>
                      </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deleting) setDeleteTarget(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-400">
              <ShieldAlert className="size-4.5" />
              Excluir o software de {deleteTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O card sai de /softwares e dos favoritos de quem tinha marcado. A marca continua cadastrada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void handleDelete()
              }}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-500"
            >
              <Trash2 className="mr-1.5 size-3.5" />
              {deleting ? "Excluindo..." : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
