"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import { Loader2, MessageCircle } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { orderNumber } from "@/lib/order-number"
import type { UserOrder } from "@/lib/hooks/use-user-orders"

/**
 * Primeira mensagem do "Chat com a loja" de um pedido que ainda não tem
 * conversa aberta. É um chamado de suporte comum, já vinculado ao pedido
 * (`orderId`): a equipe vê de qual compra se trata sem precisar perguntar, e
 * a conversa segue na tela do chamado, que é onde o resto do suporte vive.
 *
 * Pedido com conversa aberta não passa por aqui: o card leva direto a ela
 * (`chat_ticket_id`), senão cada clique abriria um chamado novo.
 */
export function OrderChatDialog({
  order,
  onOpenChange,
}: {
  order: UserOrder | null
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [body, setBody] = useState("")
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (order) setBody("")
  }, [order])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!order || submitting || !body.trim()) return
    setSubmitting(true)
    try {
      const res = await fetch("/api/support/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: `Pedido #${orderNumber(order.id)}`,
          body: body.trim(),
          orderId: order.id,
        }),
      })
      const data = (await res.json().catch(() => null)) as { ticketId?: string; error?: string } | null
      if (!res.ok || !data?.ticketId) {
        toast.error(data?.error ?? "Não foi possível abrir o chat")
        return
      }
      router.push(`/conta/suporte/${data.ticketId}`)
    } catch {
      toast.error("Não foi possível abrir o chat")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={order !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {order && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageCircle className="size-4 text-emerald-400" />
                Chat com a loja
              </DialogTitle>
              <DialogDescription>
                Sobre o pedido #{orderNumber(order.id)}. A conversa fica salva neste pedido e você recebe
                uma notificação quando a equipe responder
              </DialogDescription>
            </DialogHeader>

            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Escreva sua dúvida sobre este pedido..."
              className="min-h-28"
              maxLength={4000}
              autoFocus
              required
            />

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
                Cancelar
              </Button>
              <Button type="submit" className="gap-2" disabled={submitting || !body.trim()}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <MessageCircle className="size-4" />}
                {submitting ? "Enviando..." : "Enviar mensagem"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
