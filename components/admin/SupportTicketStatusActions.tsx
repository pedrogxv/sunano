"use client"

import { useTransition } from "react"
import { Check, RotateCcw, X } from "lucide-react"
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

/** Ações de status do chamado (resolver/cancelar/reabrir), cada uma atrás de um modal de confirmação — evita fechar ou reabrir um chamado por clique acidental. */
export function SupportTicketStatusActions({
  status,
  onResolve,
  onCancel,
  onReopen,
}: {
  status: "open" | "resolved" | "cancelled"
  onResolve: () => Promise<void>
  onCancel: () => Promise<void>
  onReopen: () => Promise<void>
}) {
  const [isPending, startTransition] = useTransition()

  function run(action: () => Promise<void>, successMessage: string) {
    startTransition(async () => {
      try {
        await action()
        toast.success(successMessage)
      } catch (err) {
        toast.error("Não foi possível atualizar o chamado", {
          description: err instanceof Error ? err.message : undefined,
        })
      }
    })
  }

  if (status === "open") {
    return (
      <div className="flex flex-col gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="outline"
              className="h-9 w-full justify-center gap-2 border-emerald-500/30 bg-emerald-500/10 text-xs text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300"
              disabled={isPending}
            >
              <Check className="size-3.5" />
              Marcar como resolvido
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Marcar chamado como resolvido?</AlertDialogTitle>
              <AlertDialogDescription>
                O cliente será notificado de que o chamado foi encerrado e poderá avaliar o atendimento.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
              <AlertDialogAction onClick={() => run(onResolve, "Chamado marcado como resolvido")} disabled={isPending}>
                {isPending ? "Resolvendo…" : "Resolver"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              size="sm"
              variant="ghost"
              className="h-9 w-full justify-center gap-2 text-xs text-muted-foreground hover:bg-red-500/10 hover:text-red-400"
              disabled={isPending}
            >
              <X className="size-3.5" />
              Cancelar chamado
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Cancelar este chamado?</AlertDialogTitle>
              <AlertDialogDescription>
                O chamado será encerrado sem resolução. Você pode reabri-lo depois, se precisar.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => run(onCancel, "Chamado cancelado")}
                disabled={isPending}
                className="bg-red-600 text-white hover:bg-red-500"
              >
                {isPending ? "Cancelando…" : "Cancelar chamado"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    )
  }

  return (
    <div>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            size="sm"
            variant="outline"
            className="h-9 w-full justify-center gap-2 border-sky-500/30 bg-sky-500/10 text-xs text-sky-400 hover:bg-sky-500/20 hover:text-sky-300"
            disabled={isPending}
          >
            <RotateCcw className="size-3.5" />
            Reabrir chamado
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir este chamado?</AlertDialogTitle>
            <AlertDialogDescription>
              O chamado voltará a ficar aberto e aguardando sua resposta, como se ainda estivesse em andamento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={() => run(onReopen, "Chamado reaberto")} disabled={isPending}>
              {isPending ? "Reabrindo…" : "Reabrir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
