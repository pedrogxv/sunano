"use client"

import { ArrowRight, Clock, Coins, Copy } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { RouteLink } from "@/components/ui/route-link"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { complementProductHref, type OrderComplementSummary } from "@/lib/store-payment-complement"
import { cn } from "@/lib/utils"

/**
 * Complemento cobrado num pedido, do lado do cliente (card e detalhe em Meus
 * Pedidos): quanto falta e o passo a passo de pagar pelo anúncio
 * "Complemento de Pagamento". O botão já abre o anúncio com o número
 * preenchido; os passos existem para quem chega ao anúncio por outro caminho.
 */
export function OrderComplementNotice({
  orderId,
  complement,
  productSlug,
  className,
}: {
  orderId: string
  complement: OrderComplementSummary
  /** Slug do anúncio; null = anúncio desativado (sem botão, só o aviso). */
  productSlug: string | null
  className?: string
}) {
  const number = orderNumber(orderId)

  if (complement.awaitingPaymentOrderId) {
    return (
      <div className={cn("flex items-start gap-1.5 text-[11px] text-amber-300", className)}>
        <Clock className="mt-px size-3.5 shrink-0" />
        <span>
          Pagamento do complemento gerado no pedido #{orderNumber(complement.awaitingPaymentOrderId)}. Conclua o
          pagamento nele (ou cancele para gerar de novo).
        </span>
      </div>
    )
  }

  if (complement.pendingCents <= 0) return null

  function copyNumber() {
    navigator.clipboard
      .writeText(number)
      .then(() => toast.success("Número do pedido copiado."))
      .catch(() => toast.error("Não foi possível copiar."))
  }

  return (
    <div className={cn("space-y-2 text-[11px] text-violet-200", className)}>
      <p className="flex items-start gap-1.5 text-xs font-semibold text-violet-100">
        <Coins className="mt-px size-3.5 shrink-0" />
        Orçamento pronto: falta pagar {formatBRL(complement.pendingCents)}
      </p>
      {complement.note && <p className="whitespace-pre-line text-violet-200/80">{complement.note}</p>}
      <ol className="list-decimal space-y-1 pl-5 text-violet-200/90">
        <li>
          Copie o número do pedido:{" "}
          <button
            type="button"
            onClick={copyNumber}
            className="inline-flex items-center gap-1 rounded-md border border-violet-400/30 bg-violet-500/15 px-1.5 py-0.5 font-mono font-semibold text-violet-100 hover:bg-violet-500/25"
          >
            {number}
            <Copy className="size-3" />
          </button>
        </li>
        <li>Abra o anúncio &quot;Complemento de Pagamento&quot; na Loja.</li>
        <li>Cole o número, confira o valor e pague no PIX ou no cartão.</li>
      </ol>
      {productSlug && (
        <Button
          asChild
          size="sm"
          className="h-8 gap-1.5 bg-violet-500 text-xs font-semibold text-white hover:bg-violet-400"
        >
          <RouteLink href={complementProductHref(productSlug, orderId)}>
            Pagar complemento
            <ArrowRight className="size-3.5" />
          </RouteLink>
        </Button>
      )}
    </div>
  )
}
