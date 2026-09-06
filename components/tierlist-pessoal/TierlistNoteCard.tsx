"use client"

import { useState } from "react"
import { Loader2, MessageSquareQuote, Pencil, X } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CARD_SURFACE } from "@/lib/ui-styles"
import { TIERLIST_NOTE_MAX_LENGTH } from "@/lib/personal-tierlist"

/**
 * Mini comentário que o dono deixa na própria tierlist.
 *
 * Um recado curto ("por que o S é esse", "testei tudo em 2026"), não uma
 * segunda bio — daí o limite de 280 caracteres e o card de uma linha em vez
 * de um editor de texto rico.
 *
 * Para visitantes é estático: quando não há recado, o componente some
 * (`null`) em vez de deixar um bloco vazio no perfil. Para o dono VIP ele
 * vira um botão "Escrever recado" mesmo vazio — a página da tierlist é o
 * único lugar onde o recado pode ser escrito.
 */
export function TierlistNoteCard({
  note,
  canEdit,
  compact = false,
}: {
  note: string | null
  /** Dono com VIP ativo — só então o card vira editável. */
  canEdit: boolean
  /** Versão espremida usada no preview do perfil: sem edição, texto menor. */
  compact?: boolean
}) {
  const [value, setValue] = useState(note ?? "")
  const [saved, setSaved] = useState(note)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)

  if (!saved && !canEdit) return null

  async function handleSave() {
    const trimmed = value.trim()
    if (trimmed === (saved ?? "")) {
      setEditing(false)
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/perfil/tierlist/nota", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: trimmed || null }),
      })
      const data = (await res.json().catch(() => null)) as { error?: string; note?: string | null } | null

      if (!res.ok) {
        toast.error(data?.error ?? "Não foi possível salvar o recado.")
        return
      }

      setSaved(data?.note ?? null)
      setValue(data?.note ?? "")
      setEditing(false)
      toast.success(trimmed ? "Recado salvo." : "Recado removido.")
    } catch {
      toast.error("Erro de conexão. Tente novamente.")
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    const remaining = TIERLIST_NOTE_MAX_LENGTH - value.length

    return (
      <div className={cn("rounded-xl border p-3", CARD_SURFACE)}>
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, TIERLIST_NOTE_MAX_LENGTH))}
          rows={2}
          autoFocus
          placeholder="Um recado curto sobre a sua tierlist..."
          className="resize-none text-sm"
        />

        <div className="mt-2 flex items-center justify-between gap-2">
          <span className={cn("text-[11px]", remaining < 20 ? "text-amber-500" : "text-muted-foreground")}>
            {remaining} caracteres restantes
          </span>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => {
                setValue(saved ?? "")
                setEditing(false)
              }}
            >
              Cancelar
            </Button>
            <Button type="button" size="sm" disabled={saving} onClick={handleSave}>
              {saving && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
              Salvar
            </Button>
          </div>
        </div>
      </div>
    )
  }

  if (!saved) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className={cn(
          "flex w-full items-center gap-2 rounded-xl border border-dashed p-3 text-left text-xs text-muted-foreground transition-colors hover:border-[var(--vip-accent)]/50 hover:text-foreground",
          CARD_SURFACE
        )}
      >
        <MessageSquareQuote className="size-4 shrink-0" style={{ color: "var(--vip-accent)" }} />
        Deixe um recado curto sobre a sua tierlist.
      </button>
    )
  }

  return (
    <div
      className={cn(
        "group flex items-start gap-2 rounded-xl border",
        CARD_SURFACE,
        compact ? "p-2.5" : "p-3"
      )}
    >
      <MessageSquareQuote
        className={cn("mt-0.5 shrink-0", compact ? "size-3.5" : "size-4")}
        style={{ color: "var(--vip-accent)" }}
      />

      <p className={cn("min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground", compact ? "text-[11px]" : "text-sm")}>
        {saved}
      </p>

      {canEdit && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Editar recado"
            onClick={() => setEditing(true)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            <Pencil className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Remover recado"
            onClick={() => {
              setValue("")
              setEditing(true)
            }}
            className="text-muted-foreground transition-colors hover:text-destructive"
          >
            <X className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}
