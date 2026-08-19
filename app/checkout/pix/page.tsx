"use client"

import { Suspense, useEffect, useState, useCallback } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle, Copy, Loader2, ShoppingBag, Check, Receipt } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart } from "@/components/providers/cart-context"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"

interface OrderItem {
  id?: string
  name?: string
  price_cents?: number
  quantity?: number
  variant_label?: string | null
  variant_options?: { group: string; label: string }[] | null
}

interface OrderReceipt {
  misticpayE2e: string | null
  asaasPaymentId: string | null
  asaasReceiptUrl: string | null
}

interface OrderStatus {
  id: string
  status: "pending" | "paid" | "cancelled" | "refunded" | "expired"
  totalCents: number
  copyPaste: string | null
  qrCodeBase64: string | null
  items: OrderItem[]
  createdAt: string
  paymentMethod: string | null
  receipt: OrderReceipt | null
}

const POLL_INTERVAL_MS = 4000

function PixCheckoutContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderId = searchParams.get("orderId")
  const token = searchParams.get("token")
  const { clear } = useCart()

  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const fetchOrder = useCallback(async () => {
    if (!orderId) return
    try {
      const url = token
        ? `/api/store/orders/${orderId}?token=${encodeURIComponent(token)}`
        : `/api/store/orders/${orderId}`
      const res = await fetch(url)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Pedido não encontrado.")
      }
      const data = (await res.json()) as OrderStatus
      setOrder(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar o pedido.")
    }
  }, [orderId, token])

  useEffect(() => {
    if (!orderId) {
      setError("Pedido não informado.")
      return
    }
    fetchOrder()
    const interval = setInterval(fetchOrder, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [orderId, fetchOrder])

  useEffect(() => {
    if (order?.status === "paid") {
      clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status])

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
    const itemCount = order.items.reduce((sum, i) => sum + (i.quantity ?? 1), 0)
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
              {order.items.map((item, idx) => (
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

          {(order.receipt?.misticpayE2e || order.receipt?.asaasPaymentId) && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Receipt className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">Comprovante PIX</p>
                {order.receipt?.misticpayE2e && (
                  <p className="break-all font-mono">E2E: {order.receipt.misticpayE2e}</p>
                )}
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

  if (order.status === "expired") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-muted-foreground">
          O tempo para pagamento deste PIX expirou. Volte à loja e finalize a compra novamente.
        </p>
        <Link href="/loja">
          <Button variant="outline">Voltar à loja</Button>
        </Link>
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
