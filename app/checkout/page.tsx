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
import { useCart } from "@/components/providers/cart-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { computeCardPriceCents, computePixDiscountCents } from "@/lib/store-pricing"
import { formatBRL } from "@/lib/format"
import { cn } from "@/lib/utils"
import { SALE_TYPE_ICON, SALE_TYPE_LABEL } from "@/lib/store-sale-type"
import { CARD_SURFACE, CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import {
  CheckoutPayerCard,
  formatCepInput,
  formatCpfInput,
  formatPhoneInput,
  type PayerForm,
} from "@/components/store/CheckoutPayerCard"
import { RemoveCartItemDialog, type PendingRemoval } from "@/components/store/RemoveCartItemDialog"
import { CheckoutShippingCard } from "@/components/store/CheckoutShippingCard"
import {
  EMPTY_SHIPPING_FORM,
  isShippingFormComplete,
  shippingFormToPayload,
  type ShippingForm,
} from "@/components/store/ShippingAddressFields"

type PaymentMethod = "pix" | "credit_card"

const EMPTY_PAYER_FORM: PayerForm = {
  name: "",
  document: "",
  phone: "",
  postalCode: "",
  street: "",
  number: "",
  complement: "",
  neighborhood: "",
  city: "",
  state: "",
}

interface PayerInfoResponse {
  fullName?: string | null
  cpf?: string | null
  email?: string | null
  phone?: string | null
  postalCode?: string | null
  street?: string | null
  number?: string | null
  complement?: string | null
  neighborhood?: string | null
  city?: string | null
  state?: string | null
  hasCompletePayerInfo?: boolean
  hasCompleteAddressInfo?: boolean
  shippingAddressRequired?: boolean
}

export default function CheckoutPage() {
  const { items, increment, decrement, remove, clear } = useCart()
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin, openRegister } = useAuthModal()

  const [payerForm, setPayerForm] = useState<PayerForm>(EMPTY_PAYER_FORM)
  const [shippingForm, setShippingForm] = useState<ShippingForm>(EMPTY_SHIPPING_FORM)
  const [editingShipping, setEditingShipping] = useState(false)
  // "Informar depois": o pedido nasce sem endereço e a pessoa completa em
  // "Meus Pedidos". Só existe enquanto o endereço é opcional no servidor.
  const [shippingSkipped, setShippingSkipped] = useState(false)
  const [shippingRequired, setShippingRequired] = useState(false)
  const [payerEmail, setPayerEmail] = useState<string | null>(null)
  const [editingPayer, setEditingPayer] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix")
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)
  const { cardSurchargePercent } = useStoreSettings()

  // Para usuário logado: só sabemos se falta nome/CPF (ou endereço, no caso
  // de cartão) no perfil depois de consultar o servidor — até lá, não
  // mostramos nem escondemos o card para não "piscar" o formulário à toa.
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
      .then((data: PayerInfoResponse) => {
        if (cancelled) return
        setNeedsPayerInfo(!data.hasCompletePayerInfo)
        setNeedsAddressInfo(!data.hasCompleteAddressInfo)
        setShippingRequired(Boolean(data.shippingAddressRequired))
        setPayerEmail(data.email ?? null)
        // Pré-preenche a entrega com o último endereço salvo no perfil — é o
        // mesmo conjunto de campos, e na esmagadora maioria das compras
        // entrega e cobrança são o mesmo lugar. A pessoa pode editar.
        setShippingForm({
          recipient: data.fullName ?? "",
          phone: data.phone ? formatPhoneInput(data.phone) : "",
          postalCode: data.postalCode ? formatCepInput(data.postalCode) : "",
          street: data.street ?? "",
          number: data.number ?? "",
          complement: data.complement ?? "",
          neighborhood: data.neighborhood ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
        })
        setPayerForm({
          name: data.fullName ?? "",
          document: data.cpf ? formatCpfInput(data.cpf) : "",
          phone: data.phone ? formatPhoneInput(data.phone) : "",
          postalCode: data.postalCode ? formatCepInput(data.postalCode) : "",
          street: data.street ?? "",
          number: data.number ?? "",
          complement: data.complement ?? "",
          neighborhood: data.neighborhood ?? "",
          city: data.city ?? "",
          state: data.state ?? "",
        })
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

  const requireAddress = paymentMethod === "credit_card"
  // Cartão exige endereço; se o perfil não tem, o card já abre em edição.
  const payerIncomplete = needsPayerInfo || (requireAddress && needsAddressInfo)

  // Trocar para cartão com endereço faltando abre a edição sozinho — a
  // pessoa não precisa descobrir que tem um botão "Editar" para clicar.
  useEffect(() => {
    if (payerIncomplete) setEditingPayer(true)
  }, [payerIncomplete])

  // Endereço obrigatório e ainda incompleto: abre a edição sozinho em vez de
  // deixar a pessoa clicar em "Gerar PIX" e tomar um erro.
  useEffect(() => {
    if (payerInfoChecked && shippingRequired && !isShippingFormComplete(shippingForm)) {
      setEditingShipping(true)
    }
    // Só na primeira checagem — reabrir a cada tecla digitada travaria a edição.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payerInfoChecked, shippingRequired])

  // O servidor decide de verdade se o pedido precisa de envio (coluna
  // `requires_shipping` dos produtos) — aqui só mostramos o card, já que
  // hoje todo item da loja é físico. Endereço enviado num pedido que não
  // precisa de envio é descartado no backend, não gravado.
  const shippingComplete = isShippingFormComplete(shippingForm)
  const shippingPending = shippingRequired && !shippingComplete

  const total = items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)
  const cardTotal = computeCardPriceCents(total, cardSurchargePercent)
  const payableTotal = paymentMethod === "credit_card" ? cardTotal : total
  const hasPreOrderItem = items.some((i) => i.sale_type === "pre_order")

  function requestRemoval(item: (typeof items)[number], fromDecrement: boolean) {
    setPendingRemoval({
      productId: item.productId,
      variantId: item.variantId,
      optionIds: item.variantOptions.map((o) => o.optionId),
      name: item.name,
      image: item.image,
      quantity: item.quantity,
      priceCents: item.priceCents,
      fromDecrement,
    })
  }

  function confirmRemoval() {
    if (!pendingRemoval) return
    remove(pendingRemoval.productId, pendingRemoval.variantId, pendingRemoval.optionIds)
    setPendingRemoval(null)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!user) {
      openLogin("/checkout")
      return
    }

    if (editingPayer) {
      setError("Confirme os dados da cobrança antes de continuar.")
      return
    }

    if (editingShipping) {
      setError("Confirme o endereço de entrega antes de continuar.")
      return
    }

    if (shippingPending) {
      setError("Informe o endereço de entrega para finalizar a compra.")
      setEditingShipping(true)
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
          guestName: payerForm.name,
          guestDocument: payerForm.document.replace(/\D/g, ""),
          ...(requireAddress
            ? {
                guestPhone: payerForm.phone.replace(/\D/g, ""),
                guestPostalCode: payerForm.postalCode.replace(/\D/g, ""),
                guestStreet: payerForm.street,
                guestNumber: payerForm.number,
                guestComplement: payerForm.complement || undefined,
                guestNeighborhood: payerForm.neighborhood,
                guestCity: payerForm.city,
                guestState: payerForm.state,
              }
            : {}),
          // Só manda o endereço quando está completo e não foi pulado: o
          // servidor recusa um endereço pela metade (e faz bem — pedido com
          // rua e sem número parece pronto para despachar e não é).
          ...(shippingComplete && !shippingSkipped ? shippingFormToPayload(shippingForm) : {}),
          ...(shippingSkipped ? { skipShippingAddress: true } : {}),
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

      // Cobrança criada: o pedido já existe (aguardando pagamento) e o
      // estoque já foi reservado, então o carrinho cumpriu seu papel. Deixar
      // os itens ali faz a pessoa achar que a compra não foi registrada — e
      // um segundo checkout geraria um pedido duplicado.
      clear()

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

  // `loading` continua true depois do clear() até a navegação acontecer: sem
  // isso, esvaziar o carrinho renderizaria o estado "carrinho vazio" por uma
  // fração de segundo, como se a compra tivesse sumido.
  if (items.length === 0 && loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
        <p className="text-sm text-muted-foreground">
          {paymentMethod === "pix" ? "Gerando sua cobrança PIX..." : "Redirecionando para o pagamento..."}
        </p>
      </div>
    )
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
                onClick={() => requestRemoval(item, false)}
                aria-label={`Remover ${item.name}`}
                className="text-muted-foreground/60 transition-colors hover:text-red-400"
              >
                <Trash2 className="size-3.5" />
              </button>
              <div className="flex items-center gap-1">
                <button
                  onClick={() =>
                    item.quantity <= 1
                      ? requestRemoval(item, true)
                      : decrement(item.productId, item.variantId, optionIds)
                  }
                  aria-label={item.quantity <= 1 ? `Remover ${item.name}` : "Diminuir quantidade"}
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
          <span className="text-[10px] font-normal text-muted-foreground">
            {formatBRL(total)} (-{cardSurchargePercent}%)
          </span>
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
          <span className="text-[10px] font-normal text-muted-foreground">{formatBRL(cardTotal)}</span>
        </button>
      </div>

      {/* Order summary */}
      <div className={cn("mb-6 space-y-1.5 rounded-xl border px-4 py-3", CARD_SURFACE)}>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "itens"})</span>
          <span>{formatBRL(cardTotal)}</span>
        </div>
        {paymentMethod === "pix" && (
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Desconto no PIX ({cardSurchargePercent}%)</span>
            <span>-{formatBRL(computePixDiscountCents(total, cardSurchargePercent))}</span>
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

        {!authLoading && user && payerInfoChecked && (
          <CheckoutPayerCard
            form={payerForm}
            onChange={setPayerForm}
            email={payerEmail}
            requireAddress={requireAddress}
            editing={editingPayer}
            onEditingChange={setEditingPayer}
            incomplete={payerIncomplete}
          />
        )}

        {!authLoading && user && payerInfoChecked && (
          <CheckoutShippingCard
            form={shippingForm}
            onChange={setShippingForm}
            required={shippingRequired}
            editing={editingShipping}
            onEditingChange={setEditingShipping}
            skipped={shippingSkipped}
            onSkippedChange={setShippingSkipped}
          />
        )}

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        )}

        {(authLoading || user) && (
          <Button
            type="submit"
            className="w-full gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-500/30 disabled:hover:translate-y-0"
            disabled={loading || authLoading || !payerInfoChecked || editingPayer || editingShipping}
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {paymentMethod === "pix" ? "Gerando cobrança PIX..." : "Preparando pagamento..."}
              </>
            ) : editingPayer ? (
              "Confirme os dados da cobrança"
            ) : editingShipping ? (
              "Confirme o endereço de entrega"
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

      <RemoveCartItemDialog
        pending={pendingRemoval}
        onOpenChange={(open) => {
          if (!open) setPendingRemoval(null)
        }}
        onConfirm={confirmRemoval}
      />
    </div>
  )
}
