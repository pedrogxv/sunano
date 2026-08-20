"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  Lock,
  LogIn,
  Loader2,
  Package,
  QrCode,
  Rocket,
  ShieldCheck,
  ShoppingCart,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useCart } from "@/components/providers/cart-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { SALE_TYPE_ICON, SALE_TYPE_LABEL } from "@/lib/store-sale-type"

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

export default function CheckoutPage() {
  const { items } = useCart()
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin, openRegister } = useAuthModal()

  const [guestName, setGuestName] = useState("")
  const [guestDocument, setGuestDocument] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Para usuário logado: só sabemos se falta nome/CPF no perfil depois de
  // consultar o servidor — até lá, não mostramos nem escondemos os campos
  // para não "piscar" o formulário à toa.
  const [payerInfoChecked, setPayerInfoChecked] = useState(false)
  const [needsPayerInfo, setNeedsPayerInfo] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setPayerInfoChecked(true)
      return
    }
    let cancelled = false
    fetch("/api/store/checkout/payer-info")
      .then((res) => (res.ok ? res.json() : { hasCompletePayerInfo: true }))
      .then((data: { hasCompletePayerInfo?: boolean }) => {
        if (cancelled) return
        setNeedsPayerInfo(!data.hasCompletePayerInfo)
      })
      .catch(() => {
        // Falha na checagem não deve bloquear a compra: a rota de checkout
        // valida de novo e, se realmente faltar dado, devolve o erro.
      })
      .finally(() => {
        if (!cancelled) setPayerInfoChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  const total = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)
  const hasPreOrderItem = items.some((i) => i.sale_type === "pre_order")

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!user) {
      openLogin("/checkout")
      return
    }

    setLoading(true)

    try {
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            variantOptionIds: i.variantOptions.map((o) => o.optionId),
            quantity: i.quantity,
          })),
          ...(needsPayerInfo ? { guestName, guestDocument: guestDocument.replace(/\D/g, "") } : {}),
        }),
      })

      const data = (await res.json()) as {
        orderId?: string
        accessToken?: string | null
        error?: string
      }

      if (!res.ok || !data.orderId) {
        throw new Error(data.error ?? "Erro ao iniciar checkout")
      }

      const url = data.accessToken
        ? `/checkout/pix?orderId=${data.orderId}&token=${encodeURIComponent(data.accessToken)}`
        : `/checkout/pix?orderId=${data.orderId}`

      window.location.href = url
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao iniciar checkout")
      setLoading(false)
    }
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        <ShoppingCart className="size-10 text-muted-foreground" />
        <p className="text-muted-foreground">Seu carrinho está vazio.</p>
        <Link href="/loja">
          <Button variant="outline">Voltar à loja</Button>
        </Link>
      </div>
    )
  }

  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0)
  const storeBase = "/loja"
  const bazaarBase = "/bazar"

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-black text-foreground">Finalizar Compra</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {itemCount} {itemCount === 1 ? "item" : "itens"} no carrinho
      </p>

      <div className="mb-4 space-y-2">
        {items.map((item) => (
          <div
            key={`${item.productId}:${item.variantId ?? "base"}:${item.variantOptions.map((o) => o.optionId).join(",")}`}
            className="flex items-center gap-3 rounded-xl border border-border bg-muted/20 p-3"
          >
            {/* Photo */}
            <Link
              href={`${item.type === "bazaar" ? bazaarBase : storeBase}/${item.slug}`}
              className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted"
            >
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.name} className="h-full w-full object-contain p-1" />
              ) : (
                <Package className="size-5 text-muted-foreground" />
              )}
            </Link>

            {/* Info, flattened: name, variant, qty × price */}
            <div className="min-w-0 flex-1">
              <Link
                href={`${item.type === "bazaar" ? bazaarBase : storeBase}/${item.slug}`}
                className="truncate text-sm font-semibold text-foreground hover:underline"
              >
                {item.name}
              </Link>
              {(item.variantLabel || item.variantOptions.length > 0) && (
                <p className="truncate text-[11px] text-muted-foreground">
                  {[item.variantLabel, ...item.variantOptions.map((o) => `${o.groupName}: ${o.label}`)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              <p className="mt-1 text-xs text-muted-foreground">
                {item.quantity}× {formatBRL(item.priceCents)}
              </p>
              {item.sale_type !== "normal" && (() => {
                const SaleTypeIcon = SALE_TYPE_ICON[item.sale_type]
                return (
                  <span
                    className={cn(
                      "mt-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[9.5px] font-bold",
                      item.sale_type === "pre_order"
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-emerald-500/15 text-emerald-400"
                    )}
                  >
                    <SaleTypeIcon className="size-2.5" strokeWidth={2.5} />
                    {SALE_TYPE_LABEL[item.sale_type]}
                  </span>
                )
              })()}
              {item.stock !== null && item.stock <= 3 && (
                <p className="mt-0.5 text-[10px] font-semibold text-amber-400">
                  Últimas {item.stock} unidades!
                </p>
              )}
            </div>

            {/* Line total */}
            <span className="shrink-0 text-sm font-bold text-foreground">
              {formatBRL(item.priceCents * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* Order summary */}
      <div className="mb-6 space-y-1.5 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "itens"})</span>
          <span>{formatBRL(total)}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Pagamento</span>
          <span>PIX (aprovação imediata)</span>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-sm font-bold">
          <span>Total</span>
          <span className="text-emerald-400">{formatBRL(total)}</span>
        </div>
      </div>

      {hasPreOrderItem && (
        <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-400">
          <Rocket className="mt-0.5 size-4 shrink-0" />
          <p>
            <span className="font-bold">Seu pedido tem item(ns) em pré-venda.</span> O pagamento é processado
            normalmente, mas o envio desses produtos só acontece quando o estoque chegar — acompanhe o status na sua conta.
          </p>
        </div>
      )}

      {/* Trust / security info */}
      <div className="mb-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2">
          <QrCode className="size-4 shrink-0 text-emerald-400" />
          <span className="text-[11px] text-muted-foreground">Pagamento via PIX, sem cadastro de cartão</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2">
          <Lock className="size-4 shrink-0 text-emerald-400" />
          <span className="text-[11px] text-muted-foreground">Conexão criptografada (HTTPS) ponta a ponta</span>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/10 px-3 py-2">
          <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
          <span className="text-[11px] text-muted-foreground">Dados tratados conforme a LGPD</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!authLoading && !user && (
          <div className="space-y-3 rounded-xl border border-border p-4 text-center">
            <p className="text-sm text-foreground">Você precisa estar logado para finalizar a compra.</p>
            <p className="text-xs text-muted-foreground">
              Isso protege seu pedido e permite acompanhar o status da entrega na sua conta.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button
                type="button"
                onClick={() => openLogin("/checkout")}
                className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <LogIn className="size-4" />
                Entrar
              </Button>
              <Button type="button" variant="outline" onClick={() => openRegister("/checkout")}>
                Criar conta
              </Button>
            </div>
          </div>
        )}

        {!authLoading && user && payerInfoChecked && needsPayerInfo && (
          <div className="space-y-4 rounded-xl border border-border p-4">
            <p className="text-xs text-muted-foreground">
              Faltam alguns dados para gerar a cobrança PIX. Eles ficam salvos no seu perfil.
            </p>

            <div className="space-y-2">
              <Label>Nome completo *</Label>
              <Input
                required
                minLength={2}
                maxLength={200}
                value={guestName}
                onChange={(e) => setGuestName(e.target.value)}
                placeholder="Seu nome completo"
                className="border-border/80 bg-muted/30"
              />
            </div>

            <div className="space-y-2">
              <Label>CPF *</Label>
              <Input
                required
                inputMode="numeric"
                value={guestDocument}
                onChange={(e) => setGuestDocument(formatCpfInput(e.target.value))}
                placeholder="000.000.000-00"
                maxLength={14}
                className="border-border/80 bg-muted/30"
              />
              <p className="text-[10px] text-muted-foreground/60">
                Exigido pelo Banco Central para identificar o pagador de transações PIX.
              </p>
            </div>
          </div>
        )}

        {error && <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>}

        {(authLoading || user) && (
          <Button
            type="submit"
            className="w-full gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            disabled={loading || authLoading || !payerInfoChecked}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Gerando cobrança PIX...
              </>
            ) : (
              "Gerar PIX"
            )}
          </Button>
        )}

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-center text-[10px] text-muted-foreground/70">
          <Link href="/privacidade" className="hover:text-emerald-400 hover:underline">
            Privacidade
          </Link>
        </div>
      </form>
    </div>
  )
}
