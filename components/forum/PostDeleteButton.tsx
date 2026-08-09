"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2 } from "lucide-react"
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
 * Botão de excluir o próprio post — irreversível, ao contrário de ocultar
 * (`PostVisibilityButton`), por isso sempre pede confirmação. Sem `onDeleted`
 * (ex: na página do post), redireciona pra `/forum` depois de excluir; com
 * `onDeleted` (ex: numa listagem), deixa o chamador remover o card sem navegação.
 */
export function PostDeleteButton({
  postSlug,
  onDeleted,
}: {
  postSlug: string
  onDeleted?: (slug: string) => void
}) {
  const router = useRouter()
  const [submitting, setSubmitting] = useState(false)

  async function handleDelete() {
    try {
      setSubmitting(true)
      const res = await fetch(`/api/forum/posts/${postSlug}/delete`, { method: "POST" })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Erro ao excluir post")
      toast.success("Post excluído")
      if (onDeleted) onDeleted(postSlug)
      else router.push("/forum")
    } catch (err) {
      toast.error("Erro ao excluir post", { description: err instanceof Error ? err.message : undefined })
      setSubmitting(false)
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 border-destructive/40 text-destructive text-xs hover:bg-destructive/10"
          title="Excluir post"
        >
          <Trash2 className="size-3.5 shrink-0" />
          <span className="hidden sm:inline">Excluir post</span>
          <span className="sm:hidden">Excluir</span>
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir este post?</AlertDialogTitle>
          <AlertDialogDescription>
            Essa ação é definitiva. O post e todos os comentários serão removidos e não
            podem ser recuperados.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={submitting}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDelete}
            disabled={submitting}
            className="bg-red-600 text-white hover:bg-red-500"
          >
            {submitting ? "Excluindo…" : "Excluir"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
