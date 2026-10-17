"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowRight, CheckCircle2, Clock, Hash, Loader2, LogIn, Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RouteLink } from "@/components/ui/route-link"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import { cn } from "@/lib/utils"
import {
  COMPLEMENT_CHECKOUT_PARAM,
  COMPLEMENT_ORDER_QUERY_PARAM,
  parseOrderNumberInput,
  type OrderComplementSummary,
} from "@/lib/store-payment-complement"

/** Resposta de `GET /api/store/complement` (ver `ComplementLookup`). */
type ComplementLookup = {
  orderId: string
  number: string
  createdAt: string
  items: { name: string; quantity: number }[]
  orderPaidCents: number
  complement: OrderComplementSummary
}

/**
 * Página do anúncio "Complemento de Pagamento": no lugar de preço e
 * quantidade, o cliente digita o número do pedido e vê quanto falta. O botão
 * leva ao checkout com o PEDIDO, nunca com um valor: quem calcula o que cobrar
 * é o servidor (`resolveComplementCharge`).
 */
export function PaymentComplementPanel({ slug }: { slug: string }) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin } = useAuthModal()
  const [input, setInput] = useState("")
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookup, setLookup] = useState<ComplementLookup | null>(null)

  const search = useCallback(async (raw: string) => {
    const number = parseOrderNumberInput(raw)
    if (!number) {
      setLookup(null)
      setError("O número do pedido tem 8 letras e números, como A1B2C3D4. Ele está em Meus Pedidos.")
      return
    }
    setSearching(true)
    setError(null)
    try {
      const res = await fetch(`/api/store/complement?${COMPLEMENT_ORDER_QUERY_PARAM}=${number}`)
      const data = (await res.json().catch(() => ({}))) as ComplementLookup & { error?: string }
      if (!res.ok) throw new Error(data.error ?? "Não foi possível buscar o pedido.")
      setLookup(data)
    } catch (err) {
      setLookup(null)
      setError(err instanceof Error ? err.message : "Não foi possível buscar o pedido.")
    } finally {
      setSearching(false)
    }
  }, [])

  // Link de Meus Pedidos / da conversa já traz o número (`?pedido=`). Lido no
  // cliente: a página do produto é estática, e ler a query no servidor a
  // tornaria dinâmica para todo visitante.
  useEffect(() => {
    if (authLoading) return
    const fromLink = new URLSearchParams(window.location.search).get(COMPLEMENT_ORDER_QUERY_PARAM)
    if (!fromLink) return
    setInput(fromLink)
    if (user) void search(fromLink)
  }, [authLoading, user, search])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!user) {
      openLogin(`/loja/${slug}${input.trim() ? `?${COMPLEMENT_ORDER_QUERY_PARAM}=${encodeURIComponent(input.trim())}` : ""}`)
      return
    }
    void search(input)
  }

  const complement = lookup?.complement
  const canPay = Boolean(complement && complement.pendingCents > 0 && !complement.awaitingPaymentOrderId)

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-5 py-4 sm:px-6 sm:py-5">
        <p className="font-display text-[26px] font-bold leading-tight text-white">Valor do seu pedido</p>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Digite o número do pedido para ver quanto falta pagar. O valor é o que a equipe definiu no seu pedido.
        </p>

        <form onSubmit={handleSubmit} className="mt-4 flex gap-2">
          <div className="relative flex-1">
            <Hash className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value.slice(0, 20))}
              placeholder="Número do pedido (ex: A1B2C3D4)"
              aria-label="Número do pedido"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              className="h-12 rounded-xl pl-9 font-mono text-[15px] uppercase tracking-wider placeholder:font-sans placeholder:normal-case placeholder:tracking-normal"
            />
          </div>
          <Button type="submit" className="h-12 gap-2 rounded-xl px-5" disabled={searching || authLoading}>
            {searching ? (
              <Loader2 className="size-4 animate-spin" />
            ) : user || authLoading ? (
              <Search className="size-4" />
            ) : (
              <LogIn className="size-4" />
            )}
            {user || authLoading ? "Buscar" : "Entrar"}
          </Button>
        </form>
        {!authLoading && !user && (
          <p className="mt-2 text-xs text-muted-foreground">Entre na conta em que você fez o pedido para buscar.</p>
        )}
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      {lookup && complement && (
        <div className="space-y-4 rounded-2xl border border-border bg-muted/10 px-5 py-4 sm:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Pedido #{lookup.number} ·{" "}
              {new Date(lookup.createdAt).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" })}
            </p>
            <ul className="mt-1.5 space-y-0.5 text-sm text-foreground">
              {lookup.items.map((item, index) => (
                <li key={index} className="truncate">
                  {item.quantity > 1 ? `${item.quantity}x ` : ""}
                  {item.name}
                </li>
              ))}
            </ul>
          </div>

          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between gap-3 text-muted-foreground">
              <dt>Pago no pedido</dt>
              <dd>{formatBRL(lookup.orderPaidCents)}</dd>
            </div>
            {complement.dueCents !== null && (
              <div className="flex justify-between gap-3 text-muted-foreground">
                <dt>Complemento cobrado</dt>
                <dd>{formatBRL(complement.dueCents)}</dd>
              </div>
            )}
            {complement.paidCents > 0 && (
              <div className="flex justify-between gap-3 text-muted-foreground">
                <dt>Complemento já pago</dt>
                <dd>{formatBRL(complement.paidCents)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between gap-3 border-t border-border/60 pt-2">
              <dt className="font-semibold text-foreground">Falta pagar</dt>
              <dd
                className={cn(
                  "font-display text-[28px] font-bold leading-none",
                  complement.pendingCents > 0 ? "text-white" : "text-emerald-400"
                )}
              >
                {formatBRL(complement.pendingCents)}
              </dd>
            </div>
          </dl>

          {complement.note && (
            <p className="whitespace-pre-line rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {complement.note}
            </p>
          )}

          {complement.awaitingPaymentOrderId ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-300">
              <Clock className="mt-0.5 size-4 shrink-0" />
              <p>
                Você já gerou o pagamento deste complemento (pedido #{orderNumber(complement.awaitingPaymentOrderId)}).
                Pague ou cancele em{" "}
                <RouteLink href="/conta/pedidos" className="font-semibold underline underline-offset-2">
                  Meus Pedidos
                </RouteLink>
                .
              </p>
            </div>
          ) : complement.pendingCents > 0 ? null : complement.dueCents !== null ? (
            <p className="flex items-center gap-2 text-sm font-semibold text-emerald-400">
              <CheckCircle2 className="size-4" />
              Complemento quitado. A equipe segue com o seu pedido.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Este pedido ainda não tem valor a complementar. Quando a equipe passar o orçamento, o valor aparece aqui e
              no seu pedido, em Meus Pedidos.
            </p>
          )}

          {canPay && (
            <Button
              className="h-[50px] w-full gap-2 rounded-xl bg-gradient-to-r from-[#7F77DD] to-[#D4537E] text-[16px] font-bold text-white shadow-lg shadow-[#D4537E]/20 hover:brightness-110"
              onClick={() => router.push(`/checkout?${COMPLEMENT_CHECKOUT_PARAM}=${lookup.orderId}`)}
            >
              Pagar {formatBRL(complement.pendingCents)}
              <ArrowRight className="size-[18px]" />
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
