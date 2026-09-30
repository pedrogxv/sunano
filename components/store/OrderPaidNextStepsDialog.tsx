"use client"

import { useState } from "react"
import { RouteLink } from "@/components/ui/route-link"
import { Bell, LifeBuoy, PackageSearch, Truck } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { orderNumber } from "@/lib/order-number"

/** Uma vez por pedido: recarregar a tela de confirmação não reabre a janela. */
const SEEN_KEY_PREFIX = "sunano:order-next-steps:"

function alreadySeen(orderId: string): boolean {
  try {
    return window.localStorage.getItem(SEEN_KEY_PREFIX + orderId) === "1"
  } catch {
    return false
  }
}

function markSeen(orderId: string) {
  try {
    window.localStorage.setItem(SEEN_KEY_PREFIX + orderId, "1")
  } catch {
    // Sem storage (aba anônima, bloqueio): a janela só volta a abrir ao recarregar.
  }
}

type Step = { icon: React.ElementType; title: string; text: string }

/**
 * Janela que abre quando o pagamento é confirmado, dizendo o que acontece
 * dali em diante e ONDE acompanhar. A tela de confirmação sozinha dizia
 * "acompanhe pelo seu perfil", e a pessoa não achava o pedido: acabava
 * abrindo o suporte para perguntar dele.
 *
 * Serviço tem um caminho diferente: o chamado de suporte é aberto sozinho no
 * pagamento (`openServiceOrderTicket`) e é lá que a equipe combina o
 * atendimento, então o botão principal leva para os chamados.
 */
export function OrderPaidNextStepsDialog({
  orderId,
  requiresShipping,
}: {
  orderId: string
  requiresShipping: boolean
}) {
  // Só monta depois que o pedido chegou do fetch (a tela é client e começa
  // sem pedido), então ler o storage na inicialização não diverge do SSR.
  const [open, setOpen] = useState(() => !alreadySeen(orderId))

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) markSeen(orderId)
  }

  const number = orderNumber(orderId)
  const steps: Step[] = requiresShipping
    ? [
        {
          icon: PackageSearch,
          title: "Acompanhe em Meus Pedidos",
          text: "Status, código de rastreio e comprovante ficam no menu da sua conta, em Meus Pedidos.",
        },
        {
          icon: Truck,
          title: "Separação e envio",
          text: "A equipe separa os itens e despacha. Quando sair, o código de rastreio aparece no pedido.",
        },
        {
          icon: Bell,
          title: "Avisos no sino",
          text: "Cada mudança de status chega nas suas notificações, sem precisar ficar conferindo.",
        },
      ]
    : [
        {
          icon: LifeBuoy,
          title: "Abrimos um chamado para você",
          text: `O chamado do pedido #${number} já está em Meus Tickets. A equipe responde por lá para combinar o atendimento.`,
        },
        {
          icon: Bell,
          title: "Avisos no sino",
          text: "Quando a equipe responder, você recebe uma notificação.",
        },
        {
          icon: PackageSearch,
          title: "O pedido fica em Meus Pedidos",
          text: "Status e comprovante continuam no menu da sua conta, em Meus Pedidos.",
        },
      ]

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pedido #{number} confirmado</DialogTitle>
          <DialogDescription>
            {requiresShipping
              ? "Acompanhe suas compras em Meus Pedidos. Veja o que acontece agora:"
              : "Seu serviço foi pago. Veja como seguimos daqui:"}
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {steps.map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex gap-3">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
                <Icon className="size-4" />
              </span>
              <div className="min-w-0 space-y-0.5">
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground">{text}</p>
              </div>
            </li>
          ))}
        </ol>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => handleOpenChange(false)}>
            Entendi
          </Button>
          {requiresShipping ? (
            <Button asChild className="gap-2" onClick={() => markSeen(orderId)}>
              <RouteLink href="/conta/pedidos">
                <PackageSearch className="size-4" />
                Ir para Meus Pedidos
              </RouteLink>
            </Button>
          ) : (
            <Button asChild className="gap-2" onClick={() => markSeen(orderId)}>
              <RouteLink href="/conta/suporte">
                <LifeBuoy className="size-4" />
                Ver meu chamado
              </RouteLink>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
