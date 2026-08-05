import Link from "next/link"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CommentFormatHint } from "./CommentBody"

/** Formulário inline de resposta a um comentário raiz, aberto sob o comentário. */
export function ReplyForm({
  authUser,
  value,
  onChange,
  onCancel,
  onSubmit,
  saving,
  error,
}: {
  authUser: { display_name: string; avatar_url: string | null } | null
  value: string
  onChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
  saving: boolean
  error: string | null
}) {
  if (!authUser) {
    return (
      <p className="text-xs text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline">Entre na sua conta</Link>
        {" "}para responder.
      </p>
    )
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-1 duration-200 space-y-2 rounded-lg border border-border bg-muted/10 p-3">
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      <Textarea
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-[72px] border-border bg-background text-sm"
        placeholder="Escreva sua resposta..."
      />
      <CommentFormatHint />
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button size="sm" onClick={onSubmit} disabled={saving || value.trim().length < 4}>
          {saving ? "Enviando…" : "Responder"}
        </Button>
      </div>
    </div>
  )
}
