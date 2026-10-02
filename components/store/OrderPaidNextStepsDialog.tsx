"use client"

import { useEffect, useState } from "react"
import { RouteLink } from "@/components/ui/route-link"
import { Bell, CheckCircle2, LifeBuoy, Loader2, MessageCircle, PackageSearch, Send, Truck } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
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

/**
 * O chamado é aberto pelo webhook logo DEPOIS de marcar o pedido como pago,
 * então a tela pode saber do pagamento uns instantes antes dele existir.
 * Consulta por até ~30 s; depois disso a pessoa acha a conversa em Meus
 * Tickets do mesmo jeito.
 */
const TICKET_POLL_INTERVAL_MS = 2_000
const TICKET_POLL_ATTEMPTS = 15

const MAX_MESSAGE_CHARS = 4000

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

const SHIPPING_STEPS: Step[] = [
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

/**
 * Janela que abre quando o pagamento é confirmado, dizendo o que acontece
 * dali em diante e ONDE acompanhar. A tela de confirmação sozinha dizia
 * "acompanhe pelo seu perfil", e a pessoa não achava o pedido: acabava
 * abrindo o suporte para perguntar dele.
 *
 * Pedido com serviço abre direto a conversa: o chamado já nasce no pagamento
 * (`openServiceOrderTicket`), com a primeira mensagem da equipe, e a pessoa
 * escreve aqui mesmo o que quer consultar. Antes ela só ganhava um botão
 * "Ver meu chamado" e, lá, encontrava o chamado travado em "Aguardando o
 * suporte", sem poder escrever.
 */
export function OrderPaidNextStepsDialog({
  orderId,
  requiresShipping,
  hasService = false,
  serviceTicketId = null,
}: {
  orderId: string
  requiresShipping: boolean
  hasService?: boolean
  serviceTicketId?: string | null
}) {
  // Só monta depois que o pedido chegou do fetch (a tela é client e começa
  // sem pedido), então ler o storage na inicialização não diverge do SSR.
  const [open, setOpen] = useState(() => !alreadySeen(orderId))

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) markSeen(orderId)
  }

  const number = orderNumber(orderId)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pedido #{number} confirmado</DialogTitle>
          <DialogDescription>
            {hasService
              ? "Pagamento confirmado. Conte para o suporte o que você precisa, direto por aqui."
              : "Acompanhe suas compras em Meus Pedidos. Veja o que acontece agora:"}
          </DialogDescription>
        </DialogHeader>

        {hasService ? (
          <ServiceSupportComposer
            orderId={orderId}
            initialTicketId={serviceTicketId}
            requiresShipping={requiresShipping}
            onLeave={() => markSeen(orderId)}
          />
        ) : (
          <>
            <ol className="space-y-3">
              {SHIPPING_STEPS.map(({ icon: Icon, title, text }) => (
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
              <Button asChild className="gap-2" onClick={() => markSeen(orderId)}>
                <RouteLink href="/conta/pedidos">
                  <PackageSearch className="size-4" />
                  Ir para Meus Pedidos
                </RouteLink>
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

/**
 * Campo de mensagem ligado ao chamado do pedido. Envia pela mesma rota da
 * tela do chamado (`POST /api/support/tickets/[id]/messages`), então a regra
 * de turno, o limite de envio e a notificação da equipe são os de sempre.
 */
function ServiceSupportComposer({
  orderId,
  initialTicketId,
  requiresShipping,
  onLeave,
}: {
  orderId: string
  initialTicketId: string | null
  requiresShipping: boolean
  onLeave: () => void
}) {
  const [ticketId, setTicketId] = useState<string | null>(initialTicketId)
  const [gaveUp, setGaveUp] = useState(false)
  const [body, setBody] = useState("")
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (ticketId) return
    let cancelled = false
    let attempts = 0
    const timer = window.setInterval(async () => {
      attempts += 1
      try {
        const res = await fetch(`/api/store/orders/${orderId}?slim=1`)
        const data = (await res.json().catch(() => null)) as { serviceTicketId?: string | null } | null
        if (!cancelled && data?.serviceTicketId) {
          setTicketId(data.serviceTicketId)
          window.clearInterval(timer)
          return
        }
      } catch {
        // Rede instável: a próxima tentativa resolve, ou a pessoa usa Meus Tickets.
      }
      if (attempts >= TICKET_POLL_ATTEMPTS) {
        window.clearInterval(timer)
        if (!cancelled) setGaveUp(true)
      }
    }, TICKET_POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [orderId, ticketId])

  async function handleSend() {
    const text = body.trim()
    if (!ticketId || !text || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/support/tickets/${ticketId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Não foi possível enviar agora. Tente pela conversa em Meus Tickets.")
      }
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível enviar agora.")
    } finally {
      setSending(false)
    }
  }

  const conversationHref = ticketId ? `/conta/suporte/${ticketId}` : "/conta/suporte"

  return (
    <>
      {sent ? (
        <div className="flex gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.07] px-4 py-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" />
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground">Mensagem enviada</p>
            <p className="text-xs text-muted-foreground">
              A equipe responde na conversa do pedido, e você recebe um aviso no sino quando isso acontecer.
            </p>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
            <MessageCircle className="size-4 text-emerald-400" />
            {ticketId ? "Sua conversa com o suporte está aberta" : gaveUp ? "Conversa em Meus Tickets" : "Abrindo sua conversa com o suporte…"}
            {!ticketId && !gaveUp && <Loader2 className="size-3.5 animate-spin" />}
          </div>
          {gaveUp && !ticketId ? (
            <p className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              A conversa deste pedido aparece em Meus Tickets em instantes. É por lá que a equipe vai te atender.
            </p>
          ) : (
            <>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value.slice(0, MAX_MESSAGE_CHARS))}
                placeholder="O que você quer consultar? Links, prints e horários que funcionam para você ajudam a equipe a começar."
                rows={4}
                disabled={sending}
                aria-label="Mensagem para o suporte"
              />
              {error && <p className="text-xs text-red-400">{error}</p>}
            </>
          )}
        </div>
      )}

      {requiresShipping && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <PackageSearch className="mt-0.5 size-3.5 shrink-0" />
          Os produtos do pedido que vão pelo correio seguem em Meus Pedidos, com rastreio.
        </p>
      )}

      <DialogFooter className="gap-2 sm:gap-2">
        <Button asChild variant="ghost" className="gap-2" onClick={onLeave}>
          <RouteLink href={conversationHref}>
            <LifeBuoy className="size-4" />
            {sent ? "Abrir conversa" : "Ver conversa"}
          </RouteLink>
        </Button>
        {!sent && !(gaveUp && !ticketId) && (
          <Button className="gap-2" onClick={handleSend} disabled={!ticketId || !body.trim() || sending}>
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Enviar para o suporte
          </Button>
        )}
      </DialogFooter>
    </>
  )
}
