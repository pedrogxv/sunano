"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import {
  CreditCard,
  Lock,
  LogIn,
  Loader2,
  Minus,
  Package,
  Plus,
  QrCode,
  Rocket,
  ShieldCheck,
  ShoppingCart,
  Trash2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BR_STATES } from "@/lib/br-states"
import { useCart } from "@/components/providers/cart-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { computeCardPriceCents } from "@/lib/store-pricing"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { SALE_TYPE_ICON, SALE_TYPE_LABEL } from "@/lib/store-sale-type"
import { CARD_SURFACE, CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"

type PaymentMethod = "pix" | "credit_card"

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  if (digits.length <= 10) {
    return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, (_, ddd, p1, p2) => (p2 ? `(${ddd}) ${p1}-${p2}` : `(${ddd}) ${p1}`))
  }
  return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, (_, ddd, p1, p2) => (p2 ? `(${ddd}) ${p1}-${p2}` : `(${ddd}) ${p1}`))
}

function formatCepInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8)
  return digits.replace(/(\d{5})(\d{1,3})/, "$1-$2")
}

interface CepLookupResponse {
  error?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
}

export default function CheckoutPage() {
  const { items, increment, decrement, remove } = useCart()
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin, openRegister } = useAuthModal()

  const [guestName, setGuestName] = useState("")
  const [guestDocument, setGuestDocument] = useState("")
  const [guestPhone, setGuestPhone] = useState("")
  const [guestPostalCode, setGuestPostalCode] = useState("")
  const [guestStreet, setGuestStreet] = useState("")
  const [guestNumber, setGuestNumber] = useState("")
  const [guestComplement, setGuestComplement] = useState("")
  const [guestNeighborhood, setGuestNeighborhood] = useState("")
  const [guestCity, setGuestCity] = useState("")
  const [guestState, setGuestState] = useState("")
  const [cepLoading, setCepLoading] = useState(false)
  const [cepError, setCepError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix")
  const { cardSurchargePercent } = useStoreSettings()

  // Para usuário logado: só sabemos se falta nome/CPF (ou endereço, no caso
  // de cartão) no perfil depois de consultar o servidor — até lá, não
  // mostramos nem escondemos os campos para não "piscar" o formulário à toa.
  const [payerInfoChecked, setPayerInfoChecked] = useState(false)
  const [needsPayerInfo, setNeedsPayerInfo] = useState(false)
  const [needsAddressInfo, setNeedsAddressInfo] = useState(false)

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setPayerInfoChecked(true)
      return
    }
    let cancelled = false
    fetch("/api/store/checkout/payer-info")
      .then((res) => (res.ok ? res.json() : { hasCompletePayerInfo: true, hasCompleteAddressInfo: true }))
      .then((data: { hasCompletePayerInfo?: boolean; hasCompleteAddressInfo?: boolean }) => {
        if (cancelled) return
        setNeedsPayerInfo(!data.hasCompletePayerInfo)
        setNeedsAddressInfo(!data.hasCompleteAddressInfo)
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

  const showAddressFields = paymentMethod === "credit_card" && needsAddressInfo

  async function handleCepChange(value: string) {
    const formatted = formatCepInput(value)
    setGuestPostalCode(formatted)
    setCepError(null)

    const digits = formatted.replace(/\D/g, "")
    if (digits.length !== 8) return

    setCepLoading(true)
    try {
      const res = await fetch(`/api/cep/${digits}`)
      const data = (await res.json()) as CepLookupResponse
      if (!res.ok) {
        setCepError(data.error ?? "Não foi possível buscar o CEP.")
        return
      }
      setGuestStreet(data.street ?? "")
      setGuestNeighborhood(data.neighborhood ?? "")
      setGuestCity(data.city ?? "")
      setGuestState(data.state ?? "")
    } catch {
      setCepError("Não foi possível buscar o CEP.")
    } finally {
      setCepLoading(false)
    }
  }

  const total = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)
  const cardTotal = computeCardPriceCents(total, cardSurchargePercent)
  const payableTotal = paymentMethod === "credit_card" ? cardTotal : total
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
          paymentMethod,
          ...(needsPayerInfo ? { guestName, guestDocument: guestDocument.replace(/\D/g, "") } : {}),
          ...(showAddressFields
            ? {
                guestPhone: guestPhone.replace(/\D/g, ""),
                guestPostalCode: guestPostalCode.replace(/\D/g, ""),
                guestStreet,
                guestNumber,
                guestComplement: guestComplement || undefined,
                guestNeighborhood,
                guestCity,
                guestState,
              }
            : {}),
        }),
      })

      const data = (await res.json()) as {
        orderId?: string
        accessToken?: string | null
        checkoutUrl?: string
        error?: string
      }

      if (!res.ok || !data.orderId) {
        throw new Error(data.error ?? "Erro ao iniciar checkout")
      }

      // Cartão: a Asaas hospeda a página de pagamento — redireciona pra lá
      // (não é navegação client-side, é troca completa de domínio).
      if (paymentMethod === "credit_card" && data.checkoutUrl) {
        window.location.href = data.checkoutUrl
        return
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

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="mb-1 text-2xl font-black text-foreground">Finalizar Compra</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {itemCount} {itemCount === 1 ? "item" : "itens"} no carrinho
      </p>

      <div className="mb-4 space-y-2">
        {items.map((item) => {
          const optionIds = item.variantOptions.map((o) => o.optionId)
          return (
          <div
            key={`${item.productId}:${item.variantId ?? "base"}:${optionIds.join(",")}`}
            className={cn("flex items-center gap-3 rounded-xl border p-3 transition-colors", CARD_SURFACE_INTERACTIVE)}
          >
            {/* Photo */}
            <Link
              href={`${storeBase}/${item.slug}`}
              className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-[var(--card-image-bg)] transition-transform hover:scale-105"
            >
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.image} alt={item.name} className="h-full w-full object-contain p-1" />
              ) : (
                <Package className="size-5 text-muted-foreground" />
              )}
            </Link>

            {/* Info: name, variant, badges */}
            <div className="min-w-0 flex-1">
              <Link
                href={`${storeBase}/${item.slug}`}
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
              <p className="mt-1 text-xs text-muted-foreground">{formatBRL(item.priceCents)} cada</p>
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

            {/* Qty controls + line total */}
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <button
                onClick={() => remove(item.productId, item.variantId, optionIds)}
                aria-label={`Remover ${item.name}`}
                className="text-muted-foreground/60 transition-colors hover:text-red-400"
              >
                <Trash2 className="size-3.5" />
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => decrement(item.productId, item.variantId, optionIds)}
                  aria-label="Diminuir quantidade"
                  className="flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground"
                >
                  <Minus className="size-3" />
                </button>
                <span className="w-5 text-center text-xs font-bold text-foreground">{item.quantity}</span>
                <button
                  onClick={() => increment(item.productId, item.variantId, optionIds)}
                  disabled={item.stock !== null && item.quantity >= item.stock}
                  aria-label="Aumentar quantidade"
                  className={cn(
                    "flex size-6 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground",
                    item.stock !== null && item.quantity >= item.stock && "cursor-not-allowed opacity-40"
                  )}
                >
                  <Plus className="size-3" />
                </button>
              </div>
              <span className="text-sm font-bold text-foreground">
                {formatBRL(item.priceCents * item.quantity)}
              </span>
            </div>
          </div>
          )
        })}
      </div>

      {/* Payment method toggle */}
      <div className="mb-6 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setPaymentMethod("pix")}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5",
            paymentMethod === "pix"
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-500/10"
              : cn(CARD_SURFACE_INTERACTIVE, "text-muted-foreground")
          )}
        >
          <QrCode className="size-5" />
          PIX
          <span className="text-[10px] font-normal text-muted-foreground">{formatBRL(total)}</span>
        </button>
        <button
          type="button"
          onClick={() => setPaymentMethod("credit_card")}
          className={cn(
            "flex flex-col items-center gap-1.5 rounded-xl border px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5",
            paymentMethod === "credit_card"
              ? "border-emerald-500/60 bg-emerald-500/10 text-emerald-400 shadow-lg shadow-emerald-500/10"
              : cn(CARD_SURFACE_INTERACTIVE, "text-muted-foreground")
          )}
        >
          <CreditCard className="size-5" />
          Cartão de crédito
          <span className="text-[10px] font-normal text-muted-foreground">
            {formatBRL(cardTotal)} (+{cardSurchargePercent}%)
          </span>
        </button>
      </div>

      {/* Order summary */}
      <div className={cn("mb-6 space-y-1.5 rounded-xl border px-4 py-3", CARD_SURFACE)}>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "itens"})</span>
          <span>{formatBRL(total)}</span>
        </div>
        {paymentMethod === "credit_card" && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Acréscimo do cartão ({cardSurchargePercent}%)</span>
            <span>{formatBRL(cardTotal - total)}</span>
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Pagamento</span>
          <span>
            {paymentMethod === "pix"
              ? "PIX (aprovação imediata)"
              : "Cartão de crédito, via página segura da Asaas"}
          </span>
        </div>
        <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-sm font-bold">
          <span>Total</span>
          <span className="text-emerald-400">{formatBRL(payableTotal)}</span>
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
        <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors", CARD_SURFACE)}>
          <QrCode className="size-4 shrink-0 text-emerald-400" />
          <span className="text-[11px] text-muted-foreground">
            {paymentMethod === "pix"
              ? "Pagamento via PIX, sem cadastro de cartão"
              : "Cartão digitado direto na página segura da Asaas — nunca no nosso site"}
          </span>
        </div>
        <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors", CARD_SURFACE)}>
          <Lock className="size-4 shrink-0 text-emerald-400" />
          <span className="text-[11px] text-muted-foreground">Conexão criptografada (HTTPS) ponta a ponta</span>
        </div>
        <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors", CARD_SURFACE)}>
          <ShieldCheck className="size-4 shrink-0 text-emerald-400" />
          <span className="text-[11px] text-muted-foreground">Dados tratados conforme a LGPD</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {!authLoading && !user && (
          <div className={cn("space-y-3 rounded-xl border p-4 text-center", CARD_SURFACE)}>
            <p className="text-sm text-foreground">Você precisa estar logado para finalizar a compra.</p>
            <p className="text-xs text-muted-foreground">
              Isso protege seu pedido e permite acompanhar o status da entrega na sua conta.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
              <Button
                type="button"
                onClick={() => openLogin("/checkout")}
                className="gap-2 bg-emerald-600 text-white transition-transform hover:-translate-y-0.5 hover:bg-emerald-500"
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
          <div className={cn("space-y-4 rounded-xl border p-4", CARD_SURFACE)}>
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

        {!authLoading && user && payerInfoChecked && showAddressFields && (
          <div className={cn("space-y-4 rounded-xl border p-4", CARD_SURFACE)}>
            <p className="text-xs text-muted-foreground">
              Pagamentos com cartão exigem telefone e endereço de cobrança. Eles ficam salvos no seu perfil.
            </p>

            <div className="space-y-2">
              <Label>Telefone *</Label>
              <Input
                required
                inputMode="numeric"
                value={guestPhone}
                onChange={(e) => setGuestPhone(formatPhoneInput(e.target.value))}
                placeholder="(00) 00000-0000"
                maxLength={15}
                className="border-border/80 bg-muted/30"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>CEP *</Label>
                <div className="relative">
                  <Input
                    required
                    inputMode="numeric"
                    value={guestPostalCode}
                    onChange={(e) => handleCepChange(e.target.value)}
                    placeholder="00000-000"
                    maxLength={9}
                    className="border-border/80 bg-muted/30"
                  />
                  {cepLoading && (
                    <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                {cepError && <p className="text-[10px] text-red-400">{cepError}</p>}
              </div>
              <div className="space-y-2">
                <Label>Número *</Label>
                <Input
                  required
                  maxLength={20}
                  value={guestNumber}
                  onChange={(e) => setGuestNumber(e.target.value)}
                  placeholder="123"
                  className="border-border/80 bg-muted/30"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Endereço *</Label>
              <Input
                required
                maxLength={200}
                value={guestStreet}
                onChange={(e) => setGuestStreet(e.target.value)}
                placeholder="Rua, avenida..."
                className="border-border/80 bg-muted/30"
              />
            </div>

            <div className="space-y-2">
              <Label>Complemento</Label>
              <Input
                maxLength={100}
                value={guestComplement}
                onChange={(e) => setGuestComplement(e.target.value)}
                placeholder="Apto, bloco... (opcional)"
                className="border-border/80 bg-muted/30"
              />
            </div>

            <div className="space-y-2">
              <Label>Bairro *</Label>
              <Input
                required
                maxLength={100}
                value={guestNeighborhood}
                onChange={(e) => setGuestNeighborhood(e.target.value)}
                placeholder="Seu bairro"
                className="border-border/80 bg-muted/30"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2 space-y-2">
                <Label>Cidade *</Label>
                <Input
                  required
                  maxLength={100}
                  value={guestCity}
                  onChange={(e) => setGuestCity(e.target.value)}
                  placeholder="Sua cidade"
                  className="border-border/80 bg-muted/30"
                />
              </div>
              <div className="space-y-2">
                <Label>UF *</Label>
                <Select value={guestState} onValueChange={setGuestState} required>
                  <SelectTrigger className="w-full border-border/80 bg-muted/30">
                    <SelectValue placeholder="UF" />
                  </SelectTrigger>
                  <SelectContent>
                    {BR_STATES.map((state) => (
                      <SelectItem key={state.uf} value={state.uf}>
                        {state.uf}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        )}

        {(authLoading || user) && (
          <Button
            type="submit"
            className="w-full gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-500/30 disabled:hover:translate-y-0"
            disabled={loading || authLoading || !payerInfoChecked}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {paymentMethod === "pix" ? "Gerando cobrança PIX..." : "Preparando pagamento..."}
              </>
            ) : paymentMethod === "pix" ? (
              "Gerar PIX"
            ) : (
              "Pagar com cartão"
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
