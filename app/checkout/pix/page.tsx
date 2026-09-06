"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle, Clock, Copy, Loader2, ShoppingBag, Check, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/components/providers/cart-context"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { PixCountdown } from "@/components/store/PixCountdown"

interface OrderItem {
  id?: string
  name?: string
  price_cents?: number
  quantity?: number
  variant_label?: string | null
  variant_options?: { group: string; label: string }[] | null
}

interface OrderReceipt {
  asaasPaymentId: string | null
  asaasReceiptUrl: string | null
}

interface OrderStatus {
  id: string
  status: "pending" | "paid" | "cancelled" | "refunded" | "expired"
  totalCents: number
  copyPaste: string | null
  qrCodeBase64: string | null
  items: OrderItem[] | null
  createdAt: string
  pixExpiresAt: string | null
  paymentMethod: string | null
  receipt: OrderReceipt | null
}

/**
 * Intervalo de polling em função de há quanto tempo a cobrança foi criada.
 * Quase todo PIX é pago nos primeiros minutos, então o intervalo curto só se
 * justifica nessa janela — depois dela, insistir a cada 4 s numa aba
 * esquecida gerava centenas de requisições por pedido abandonado.
 */
function pollIntervalMs(elapsedMs: number): number {
  if (elapsedMs < 2 * 60_000) return 4_000
  if (elapsedMs < 10 * 60_000) return 10_000
  return 30_000
}

function PixCheckoutContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderId = searchParams.get("orderId")
  const token = searchParams.get("token")
  const { clear } = useCart()

  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  // O cron de expiração roda a cada 15 min, então o pedido pode continuar
  // `pending` na API depois do prazo vencido. A contagem regressiva zerando
  // já basta pra tratar a tela como expirada — o servidor confirma depois.
  const [locallyExpired, setLocallyExpired] = useState(false)

  const fetchOrder = useCallback(async (slim = false) => {
    if (!orderId) return
    try {
      const params = new URLSearchParams()
      if (token) params.set("token", token)
      // `slim` omite QR, copia-e-cola e itens — ~8 KB por resposta que a tela
      // já tem desde a primeira carga e que não mudam.
      if (slim) params.set("slim", "1")
      const query = params.toString()
      const res = await fetch(`/api/store/orders/${orderId}${query ? `?${query}` : ""}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Pedido não encontrado.")
      }
      const data = (await res.json()) as OrderStatus
      // Numa resposta slim os campos omitidos vêm null: preserva o que já
      // está em tela em vez de apagar o QR que o cliente está lendo.
      setOrder((prev) =>
        prev
          ? {
              ...data,
              copyPaste: data.copyPaste ?? prev.copyPaste,
              qrCodeBase64: data.qrCodeBase64 ?? prev.qrCodeBase64,
              items: data.items ?? prev.items,
            }
          : data
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar o pedido.")
    }
  }, [orderId, token])

  useEffect(() => {
    if (!orderId) {
      setError("Pedido não informado.")
      return
    }
    // Primeira carga completa: é ela que traz QR, copia-e-cola e itens.
    fetchOrder()
    // Sem prazo não há mais o que confirmar: parar o polling evita bater na
    // API pra sempre numa aba esquecida aberta.
    if (locallyExpired) return

    const startedAt = Date.now()
    let timeout: ReturnType<typeof setTimeout> | undefined

    function schedule() {
      timeout = setTimeout(async () => {
        // Aba em segundo plano não tem ninguém olhando para o QR: o pagamento
        // continua sendo confirmado pelo webhook, e a tela reconsulta assim
        // que voltar ao primeiro plano (listener abaixo). É o que elimina a
        // maior parte do custo das abas esquecidas.
        if (document.visibilityState === "visible") {
          await fetchOrder(true)
        }
        schedule()
      }, pollIntervalMs(Date.now() - startedAt))
    }
    schedule()

    // Voltou para a aba: confirma o estado na hora, sem esperar o próximo
    // tick (que pode estar a 30 s de distância).
    function onVisible() {
      if (document.visibilityState === "visible") fetchOrder(true)
    }
    document.addEventListener("visibilitychange", onVisible)

    return () => {
      if (timeout) clearTimeout(timeout)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [orderId, fetchOrder, locallyExpired])

  useEffect(() => {
    if (order?.status === "paid") {
      clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status])

  const handleExpired = useCallback(() => setLocallyExpired(true), [])

  function handleCopy() {
    if (!order?.copyPaste) return
    navigator.clipboard.writeText(order.copyPaste)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (error) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">{error}</p>
        <Button variant="outline" onClick={() => router.push("/loja")}>
          Voltar à loja
        </Button>
      </div>
    )
  }

  if (!order) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (order.status === "paid") {
    // `items` só vem null numa resposta slim, e o merge em `fetchOrder`
    // preserva o valor da primeira carga — o fallback existe para o caso
    // extremo de a tela abrir já paga sem ter feito a carga completa.
    const orderItems = order.items ?? []
    const itemCount = orderItems.reduce((sum, i) => sum + (i.quantity ?? 1), 0)
    const paidAtLabel = new Date(order.createdAt).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })

    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center gap-6 px-4 py-10 text-center">
        <div className="flex size-20 items-center justify-center rounded-full bg-emerald-500/15">
          <CheckCircle className="size-10 text-emerald-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-foreground">Pagamento confirmado!</h1>
          <p className="text-muted-foreground max-w-sm">
            Seu pedido foi recebido com sucesso. Você receberá um e-mail de confirmação em breve.
          </p>
        </div>

        <div className="w-full space-y-4 rounded-xl border border-border bg-muted/20 p-4 text-left">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pedido</p>
              <p className="font-mono text-sm font-bold text-foreground">#{orderNumber(order.id)}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Data</p>
              <p className="text-sm text-foreground">{paidAtLabel}</p>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {itemCount} {itemCount === 1 ? "item" : "itens"} comprados
            </p>
            <ul className="space-y-1.5">
              {orderItems.map((item, idx) => (
                <li key={item.id ?? idx} className="flex items-center justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate text-foreground">
                    {item.quantity ?? 1}× {item.name ?? "Item"}
                    {item.variant_label ? (
                      <span className="text-muted-foreground"> — {item.variant_label}</span>
                    ) : null}
                    {(item.variant_options ?? []).map((o, oi) => (
                      <span key={oi} className="text-muted-foreground"> — {o.label}</span>
                    ))}
                  </span>
                  {typeof item.price_cents === "number" && (
                    <span className="shrink-0 text-muted-foreground">
                      {formatBRL(item.price_cents * (item.quantity ?? 1))}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex items-center justify-between border-t border-border/60 pt-3">
            <span className="text-sm font-medium text-foreground">Total pago</span>
            <span className="text-lg font-black text-emerald-400">{formatBRL(order.totalCents)}</span>
          </div>

          {order.receipt?.asaasPaymentId && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Receipt className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">Comprovante PIX</p>
                {order.receipt?.asaasPaymentId && (
                  <p className="break-all font-mono">Cobrança: {order.receipt.asaasPaymentId}</p>
                )}
                {order.receipt?.asaasReceiptUrl && (
                  <a
                    href={order.receipt.asaasReceiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block font-medium text-emerald-400 hover:underline"
                  >
                    Ver comprovante de pagamento
                  </a>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/conta/pedidos">
            <Button variant="outline" className="gap-2">
              <Receipt className="size-4" />
              Ver meus pedidos
            </Button>
          </Link>
          <Link href="/loja">
            <Button variant="outline" className="gap-2">
              <ShoppingBag className="size-4" />
              Continuar comprando
            </Button>
          </Link>
          <Link href="/">
            <Button variant="ghost" className="text-muted-foreground">
              Voltar ao início
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (order.status === "expired" || locallyExpired) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-5 px-4 py-10 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-red-500/15">
          <Clock className="size-8 text-red-400" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-black text-foreground">PIX expirado</h1>
          <p className="text-sm text-muted-foreground">
            O prazo para pagar o pedido #{orderNumber(order.id)} acabou e o código PIX perdeu a
            validade. <span className="font-semibold text-foreground">Nada foi cobrado</span> — os
            itens voltaram ao estoque.
          </p>
          <p className="text-xs text-muted-foreground/70">
            Se você pagou nos últimos minutos, não pague de novo: a confirmação pode levar um
            instante e o pedido aparece como pago em Meus pedidos.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link href="/loja">
            <Button className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500">
              <ShoppingBag className="size-4" />
              Comprar novamente
            </Button>
          </Link>
          <Link href="/conta/pedidos">
            <Button variant="outline" className="gap-2">
              <Receipt className="size-4" />
              Ver meus pedidos
            </Button>
          </Link>
        </div>
      </div>
    )
  }

  if (order.status === "cancelled" || order.status === "refunded") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">Este pedido não está mais disponível para pagamento.</p>
        <Link href="/loja">
          <Button variant="outline">Voltar à loja</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-foreground">Pague com PIX</h1>
        <p className="text-sm text-muted-foreground">
          Escaneie o QR code ou copie o código abaixo no app do seu banco.
        </p>
      </div>

      <div className="text-3xl font-black text-emerald-400">{formatBRL(order.totalCents)}</div>

      {order.pixExpiresAt && (
        <PixCountdown expiresAt={order.pixExpiresAt} onExpired={handleExpired} />
      )}

      {order.qrCodeBase64 && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={order.qrCodeBase64}
          alt="QR Code PIX"
          className="size-56 rounded-xl border border-border bg-white p-2"
        />
      )}

      {order.copyPaste && (
        <div className="w-full space-y-2">
          <div className="break-all rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-[11px] text-muted-foreground">
            {order.copyPaste}
          </div>
          <Button variant="outline" className="w-full gap-2" onClick={handleCopy}>
            {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
            {copied ? "Copiado!" : "Copiar código PIX"}
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        Aguardando confirmação do pagamento...
      </div>
    </div>
  )
}

export default function PixCheckoutPage() {
  return (
    <Suspense>
      <PixCheckoutContent />
    </Suspense>
  )
}
