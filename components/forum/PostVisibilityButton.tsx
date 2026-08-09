"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Eye, EyeOff } from "lucide-react"
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

/**
 * Botão de ocultar/mostrar o próprio post (mesma semântica `is_hidden` da
 * moderação). Ocultar pede confirmação (some da listagem pública); mostrar
 * de volta é reversível e não precisa. Sem `onChanged` (ex: na página do
 * post), redireciona pra `/forum` depois de ocultar; com `onChanged` (ex:
 * numa listagem), deixa o chamador atualizar a UI sem navegação.
 */
export function PostVisibilityButton({
  postSlug,
  isHidden,
  onChanged,
}: {
  postSlug: string
  isHidden: boolean
  onChanged?: (slug: string, hidden: boolean) => void
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  async function setHidden(hidden: boolean) {
    try {
      setSubmitting(true)
      const res = await fetch(`/api/forum/posts/${postSlug}/visibility`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hidden }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao atualizar post")
      toast.success(hidden ? "Post ocultado" : "Post reativado")
      if (onChanged) onChanged(postSlug, hidden)
      else if (hidden) router.push("/forum")
    } catch (err) {
      toast.error("Erro ao atualizar post", { description: err instanceof Error ? err.message : undefined })
    } finally {
      setSubmitting(false)
    }
  }

  if (isHidden) {
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="h-7 gap-1.5 text-xs"
        title="Mostrar post"
        disabled={submitting}
        onClick={() => setHidden(false)}
      >
        <Eye className="size-3.5 shrink-0" />
        <span className="hidden sm:inline">{submitting ? "Reativando…" : "Mostrar post"}</span>
        <span className="sm:hidden">{submitting ? "Reativando…" : "Mostrar"}</span>
      </Button>
    )
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 border-destructive/40 text-destructive text-xs hover:bg-destructive/10"
          title="Ocultar post"
        >
          <EyeOff className="size-3.5 shrink-0" />
          <span className="hidden sm:inline">Ocultar post</span>
          <span className="sm:hidden">Ocultar</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Ocultar este post?</AlertDialogTitle>
          <AlertDialogDescription>
            Seu post deixará de aparecer no fórum para outros usuários. Você pode reativá-lo
            quando quiser pela aba &quot;Meus Posts&quot;.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => setHidden(true)}
            disabled={submitting}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {submitting ? "Ocultando…" : "Ocultar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
