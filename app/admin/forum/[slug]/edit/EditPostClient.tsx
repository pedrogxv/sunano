"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { format } from "date-fns"
import { ptBR } from "date-fns/locale"
import {
  ArrowLeft, Check, Eye, EyeOff, ExternalLink,
  Lock, LockOpen, Pin, PinOff, X,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { supabase } from "@/lib/supabase"

type Peripheral = { id: string; name: string; brand: string; category: string }

type Post = {
  id: string
  slug: string
  title: string
  body: string
  author_name: string
  peripheral_refs: string[]
  peripherals: Peripheral[]
  is_hidden: boolean
  is_locked: boolean
  is_pinned: boolean
  vote_score: number
  created_at: string
}

const MAX_BODY = 5000

export default function EditPostClient({
  post: initialPost,
  canWrite,
}: {
  post: Post
  canWrite: boolean
}) {
  const router = useRouter()

  const [title, setTitle] = useState(initialPost.title)
  const [body, setBody] = useState(initialPost.body)
  const [peripherals, setPeripherals] = useState<Peripheral[]>(initialPost.peripherals)
  const [peripheralSearch, setPeripheralSearch] = useState("")
  const [peripheralResults, setPeripheralResults] = useState<Peripheral[]>([])

  const [flags, setFlags] = useState({
    is_hidden: initialPost.is_hidden,
    is_locked: initialPost.is_locked,
    is_pinned: initialPost.is_pinned,
  })

  const [saving, setSaving] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saved" | "error">("idle")
  const [error, setError] = useState<string | null>(null)

  // Reset save status after 3s
  useEffect(() => {
    if (saveStatus === "saved") {
      const t = setTimeout(() => setSaveStatus("idle"), 3000)
      return () => clearTimeout(t)
    }
  }, [saveStatus])

  // Peripheral search
  useEffect(() => {
    if (peripheralSearch.trim().length < 2) { setPeripheralResults([]); return }
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from("peripherals").select("id, name, brand, category")
        .ilike("name", `%${peripheralSearch.trim()}%`).limit(8)
      const existing = new Set(peripherals.map((p) => p.id))
      setPeripheralResults(((data ?? []) as Peripheral[]).filter((p) => !existing.has(p.id)))
    }, 300)
    return () => clearTimeout(timer)
  }, [peripheralSearch, peripherals])

  function addPeripheral(p: Peripheral) {
    if (peripherals.length >= 3) return
    setPeripherals((prev) => [...prev, p])
    setPeripheralSearch("")
    setPeripheralResults([])
  }

  function removePeripheral(id: string) {
    setPeripherals((prev) => prev.filter((p) => p.id !== id))
  }

  async function handleSave() {
    if (!canWrite) return
    try {
      setSaving(true)
      setError(null)
      const res = await fetch(`/api/forum/posts/${initialPost.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          peripheral_refs: peripherals.map((p) => p.id),
        }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao salvar")
      setSaveStatus("saved")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao salvar")
      setSaveStatus("error")
    } finally {
      setSaving(false)
    }
  }

  async function handleToggle(field: "is_hidden" | "is_locked" | "is_pinned") {
    if (!canWrite) return
    try {
      setToggling(field)
      const newValue = !flags[field]
      const res = await fetch(`/api/forum/posts/${initialPost.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: newValue }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao atualizar")
      setFlags((prev) => ({ ...prev, [field]: newValue }))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao atualizar")
    } finally {
      setToggling(null)
    }
  }

  const isDirty =
    title.trim() !== initialPost.title ||
    body.trim() !== initialPost.body ||
    JSON.stringify(peripherals.map((p) => p.id).sort()) !==
      JSON.stringify([...initialPost.peripheral_refs].sort())

  const canSave = canWrite && isDirty && title.trim().length >= 4 && body.trim().length >= 20

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/admin/forum"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="size-4" />
            Moderação
          </Link>
          <span className="text-border">/</span>
          <span className="text-sm text-foreground font-medium truncate max-w-[240px]">
            {initialPost.title}
          </span>
        </div>
        <Link
          href={`/forum/${initialPost.slug}`}
          target="_blank"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
        >
          <ExternalLink className="size-3.5" />
          Ver no fórum
        </Link>
      </div>

      {/* Status card */}
      <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">
              por {initialPost.author_name}
              <span className="ml-2 text-xs text-muted-foreground font-normal">
                {format(new Date(initialPost.created_at), "dd 'de' MMM 'de' yyyy", { locale: ptBR })}
              </span>
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge
                variant="secondary"
                className={flags.is_pinned ? "bg-primary/15 text-primary text-[10px]" : "bg-muted/40 text-muted-foreground text-[10px]"}
              >
                {flags.is_pinned ? "Fixado" : "Não fixado"}
              </Badge>
              <Badge
                variant="secondary"
                className={flags.is_hidden ? "bg-red-500/15 text-red-400 text-[10px]" : "bg-green-500/15 text-green-400 text-[10px]"}
              >
                {flags.is_hidden ? "Oculto" : "Visível"}
              </Badge>
              <Badge
                variant="secondary"
                className={flags.is_locked ? "bg-amber-500/15 text-amber-400 text-[10px]" : "bg-muted/40 text-muted-foreground text-[10px]"}
              >
                {flags.is_locked ? "Bloqueado" : "Aberto"}
              </Badge>
              <Badge variant="secondary" className="bg-muted/40 text-muted-foreground text-[10px]">
                {initialPost.vote_score > 0 ? "+" : ""}{initialPost.vote_score} votos
              </Badge>
            </div>
          </div>
        </div>

        {canWrite && (
          <div className="flex flex-wrap gap-2 pt-1 border-t border-border/50">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={toggling === "is_pinned"}
              onClick={() => handleToggle("is_pinned")}
              className={`h-8 gap-1.5 text-xs ${flags.is_pinned ? "border-primary/40 text-primary hover:bg-primary/10" : "border-border"}`}
            >
              {flags.is_pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              {flags.is_pinned ? "Desafixar" : "Fixar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={toggling === "is_hidden"}
              onClick={() => handleToggle("is_hidden")}
              className="h-8 gap-1.5 border-border text-xs"
            >
              {flags.is_hidden ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              {flags.is_hidden ? "Tornar visível" : "Ocultar"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={toggling === "is_locked"}
              onClick={() => handleToggle("is_locked")}
              className="h-8 gap-1.5 border-border text-xs"
            >
              {flags.is_locked ? <LockOpen className="size-3.5" /> : <Lock className="size-3.5" />}
              {flags.is_locked ? "Desbloquear" : "Bloquear"}
            </Button>
          </div>
        )}
      </div>

      {/* Edit form */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-5">
        <h2 className="text-sm font-semibold text-foreground">Conteúdo do post</h2>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Título</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!canWrite}
            className="border-border bg-muted/20"
            maxLength={120}
          />
          <p className="text-right text-[10px] text-muted-foreground">{title.length}/120</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Corpo</label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={!canWrite}
            className="min-h-[220px] border-border bg-muted/20 font-mono text-sm"
            maxLength={MAX_BODY}
          />
          <p className={`text-right text-[10px] ${body.length > MAX_BODY * 0.9 ? "text-amber-400" : "text-muted-foreground"}`}>
            {body.length}/{MAX_BODY}
          </p>
        </div>

        {/* Peripheral selector */}
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Periféricos relacionados <span className="normal-case font-normal">(até 3)</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {peripherals.map((p) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1.5 text-xs text-primary"
              >
                <span className="font-medium">{p.brand} {p.name}</span>
                <span className="text-primary/60">· {p.category}</span>
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => removePeripheral(p.id)}
                    className="ml-0.5 hover:text-destructive transition-colors"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </span>
            ))}
            {peripherals.length === 0 && (
              <span className="text-xs text-muted-foreground">Nenhum periférico vinculado</span>
            )}
          </div>
          {canWrite && peripherals.length < 3 && (
            <div className="relative">
              <Input
                value={peripheralSearch}
                onChange={(e) => setPeripheralSearch(e.target.value)}
                className="border-border bg-muted/20 text-sm"
                placeholder="Buscar periférico para vincular…"
              />
              {peripheralResults.length > 0 && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-border bg-card shadow-xl">
                  {peripheralResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => addPeripheral(p)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/40"
                    >
                      <span className="font-medium text-foreground">{p.name}</span>
                      <span className="text-muted-foreground">{p.brand}</span>
                      <span className="ml-auto text-xs text-muted-foreground/60">{p.category}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {canWrite && (
          <div className="flex items-center justify-between border-t border-border/50 pt-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {saveStatus === "saved" && (
                <span className="flex items-center gap-1 text-green-400">
                  <Check className="size-3.5" />
                  Salvo com sucesso
                </span>
              )}
              {!isDirty && saveStatus === "idle" && (
                <span>Sem alterações pendentes</span>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-border text-xs"
                onClick={() => router.push("/admin/forum")}
              >
                Voltar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleSave}
                disabled={saving || !canSave}
                className="gap-1.5 text-xs"
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
