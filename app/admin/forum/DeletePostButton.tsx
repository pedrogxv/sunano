"use client"

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

export function DeletePostButton({
  action,
  postTitle,
}: {
  action: () => Promise<void>
  postTitle: string
}) {
  async function handleConfirm() {
    try {
      await action()
      toast.success("Tópico excluído")
    } catch (err) {
      toast.error("Erro ao excluir tópico", { description: err instanceof Error ? err.message : undefined })
    }
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8 w-full gap-1.5 border-destructive/40 text-destructive text-xs hover:bg-destructive/10"
          title="Excluir tópico"
        >
          <Trash2 className="size-3.5" />
          Excluir
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir tópico?</AlertDialogTitle>
          <AlertDialogDescription>
            Excluir definitivamente &quot;{postTitle}&quot;? Todos os comentários e aura também serão apagados.
            Essa ação não pode ser desfeita.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={handleConfirm} className="bg-red-600 text-white hover:bg-red-500">
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
