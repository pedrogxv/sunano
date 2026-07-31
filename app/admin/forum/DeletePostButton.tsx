"use client"

import { useTransition } from "react"
import { Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"

export function DeletePostButton({
  action,
  postTitle,
}: {
  action: () => Promise<void>
  postTitle: string
}) {
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    if (
      !confirm(
        `Excluir definitivamente este tópico ("${postTitle}")? Todos os comentários e aura também serão apagados. Essa ação não pode ser desfeita.`
      )
    ) {
      return
    }
    startTransition(() => {
      action()
    })
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={handleClick}
      className="h-8 gap-1.5 border-destructive/40 text-destructive text-xs hover:bg-destructive/10"
      title="Excluir tópico"
    >
      <Trash2 className="size-3.5" />
      {isPending ? "Excluindo…" : "Excluir"}
    </Button>
  )
}
