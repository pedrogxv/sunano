"use client"

import { Suspense, useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { CheckCircle, Loader2, ShoppingBag, Receipt, XCircle } from "lucide-react"
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

interface OrderStatus {
  id: string
  status: "pending" | "paid" | "cancelled" | "refunded" | "expired"
  totalCents: number
  items: OrderItem[]
  createdAt: string
  installmentCount: number | null
  pixPriceCents: number | null
  cardSurchargePercent: number | null
}

const POLL_INTERVAL_MS = 3000

function CardCheckoutContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const orderId = searchParams.get("orderId")
  const { clear } = useCart()

  const [order, setOrder] = useState<OrderStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const statusRef = useRef<OrderStatus["status"] | null>(null)
  statusRef.current = order?.status ?? null

  const fetchOrder = useCallback(async () => {
    if (!orderId) return
    try {
      const res = await fetch(`/api/store/orders/${orderId}`)
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(data.error ?? "Pedido não encontrado.")
      }
      const data = (await res.json()) as OrderStatus
      setOrder(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao consultar o pedido.")
    }
  }, [orderId])

  useEffect(() => {
    if (!orderId) {
      setError("Pedido não informado.")
      return
    }
    fetchOrder()
    // Sem limite de tentativas — o webhook CHECKOUT_PAID pode demorar mais
    // que poucos segundos (fila/retry do lado da Asaas), e parar de consultar
    // cedo demais deixava a tela travada em "confirmando" mesmo depois do
    // pagamento já estar marcado como pago no banco, sem nunca limpar o
    // carrinho. O polling só para quando o pedido sai de "pending" ou quando
    // o componente desmonta (usuário sai da página).
    const interval = setInterval(() => {
      if (statusRef.current && statusRef.current !== "pending") {
        clearInterval(interval)
        return
      }
      fetchOrder()
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [orderId, fetchOrder])

  useEffect(() => {
    if (order?.status === "paid") {
      clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.status])

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

          {order.pixPriceCents != null && order.cardSurchargePercent != null && (
            <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <Receipt className="mt-0.5 size-3.5 shrink-0" />
              <div className="min-w-0 space-y-0.5">
                <p className="font-medium text-foreground">
                  {order.installmentCount && order.installmentCount > 1
                    ? `Pago em ${order.installmentCount}x no cartão`
                    : "Pago no cartão à vista"}
                </p>
                <p>
                  No PIX sairia por {formatBRL(order.pixPriceCents)} — {order.cardSurchargePercent}% de desconto.
                </p>
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

  if (order.status === "expired" || order.status === "cancelled") {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <XCircle className="size-10 text-muted-foreground" />
        <p className="text-muted-foreground max-w-sm">
          {order.status === "expired"
            ? "O tempo para pagamento no cartão expirou."
            : "O pagamento com cartão foi cancelado."}{" "}
          Volte à loja e finalize a compra novamente.
        </p>
        <Link href="/checkout">
          <Button variant="outline">Tentar novamente</Button>
        </Link>
      </div>
    )
  }

  if (order.status === "refunded") {
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
      <Loader2 className="size-8 animate-spin text-emerald-400" />
      <div className="space-y-1">
        <h1 className="text-2xl font-black text-foreground">Confirmando pagamento...</h1>
        <p className="text-sm text-muted-foreground">
          Estamos aguardando a confirmação do cartão junto à operadora. Isso costuma levar poucos segundos.
        </p>
      </div>
    </div>
  )
}

export default function CardCheckoutPage() {
  return (
    <Suspense>
      <CardCheckoutContent />
    </Suspense>
  )
}
