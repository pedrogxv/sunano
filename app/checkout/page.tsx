"use client"

import { useEffect, useMemo, useState } from "react"
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
import { isStoreMaintenanceEnabled } from "@/lib/store-maintenance"
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

/** Formata só quando há valor — os campos do perfil são todos opcionais. */
function formatOptionalPhone(value: string | null | undefined): string {
  return value ? formatPhoneInput(value) : ""
}
function formatOptionalCep(value: string | null | undefined): string {
  return value ? formatCepInput(value) : ""
}

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
  /** Último endereço de ENTREGA (distinto do de cobrança acima). */
  shipping?: {
    recipient?: string | null
    phone?: string | null
    postalCode?: string | null
    street?: string | null
    number?: string | null
    complement?: string | null
    neighborhood?: string | null
    city?: string | null
    state?: string | null
  } | null
}

interface ValidatedCartLine {
  productId: string
  variantId: string | null
  name: string | null
  priceCents: number | null
  stock: number | null
  available: boolean
  issues: string[]
}

interface CartValidationResponse {
  lines: ValidatedCartLine[]
  cartNeedsShipping?: boolean
}

/** Mensagem para o cliente a partir do motivo devolvido pelo servidor. */
const CART_ISSUE_LABEL: Record<string, string> = {
  not_found: "não está mais disponível na loja",
  inactive: "não está mais disponível na loja",
  sold_out: "está esgotado",
  variant_not_found: "teve a variante removida",
  variant_unavailable: "está com essa cor indisponível",
  option_unavailable: "está com essa opção indisponível",
  combination_unavailable: "está com essa combinação indisponível",
  insufficient_stock: "está sem estoque",
}

export default function CheckoutPage() {
  const { items, increment, decrement, remove, clear } = useCart()
  const { user, loading: authLoading } = useAuthUser()
  const { openLogin, openRegister } = useAuthModal()

  const [payerForm, setPayerForm] = useState<PayerForm>(EMPTY_PAYER_FORM)
  const [shippingForm, setShippingForm] = useState<ShippingForm>(EMPTY_SHIPPING_FORM)
  const [editingShipping, setEditingShipping] = useState(false)
  // "Informar depois": o pedido nasce sem endereço e a pessoa completa em
  // "Meus Pedidos", depois de pagar. É sempre uma escolha válida — o
  // endereço não bloqueia a compra em nenhum cenário.
  const [shippingSkipped, setShippingSkipped] = useState(false)
  // Há item físico no carrinho? Vem do servidor (`requires_shipping` de cada
  // produto); um carrinho só de serviços não mostra o card de entrega.
  const [cartNeedsShipping, setCartNeedsShipping] = useState(true)
  const [payerEmail, setPayerEmail] = useState<string | null>(null)
  const [editingPayer, setEditingPayer] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix")
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)
  // Divergências entre o carrinho (localStorage) e o banco, detectadas na
  // abertura da tela — mostradas ANTES do submit, não como erro depois dele.
  const [cartIssues, setCartIssues] = useState<ValidatedCartLine[]>([])
  const [staleLines, setStaleLines] = useState<ValidatedCartLine[]>([])
  const { cardSurchargePercent } = useStoreSettings()

  // Para usuário logado: só sabemos se falta nome/CPF (ou endereço, no caso
  // de cartão) no perfil depois de consultar o servidor — até lá, não
  // mostramos nem escondemos o card para não "piscar" o formulário à toa.
  const [payerInfoChecked, setPayerInfoChecked] = useState(false)
  const [needsPayerInfo, setNeedsPayerInfo] = useState(false)
  const [needsAddressInfo, setNeedsAddressInfo] = useState(false)
  // A consulta de perfil não respondeu (rede, 5xx, Loja em manutenção). Vale
  // só para o texto do card: os dados não puderam ser carregados, não é que
  // o perfil esteja incompleto.
  const [payerInfoFailed, setPayerInfoFailed] = useState(false)

  // String estável dos ids do carrinho: `items` muda de identidade a cada
  // incremento de quantidade, e depender do array refaria a consulta de
  // perfil (que também pré-preenche os formulários) a cada clique no "+".
  const cartProductIds = useMemo(
    () => Array.from(new Set(items.map((i) => i.productId))).sort().join(","),
    [items]
  )

  useEffect(() => {
    if (authLoading) return
    if (!user) {
      setPayerInfoChecked(true)
      return
    }
    let cancelled = false
    fetch("/api/store/checkout/payer-info")
      .then((res) => {
        // Sem fallback otimista aqui: responder "perfil completo" quando a
        // consulta falha faz o card de cobrança renderizar VAZIO (sem nome nem
        // CPF) e ainda assim liberar o botão de pagar — o usuário só descobre
        // que falta dado depois que o pagamento é recusado. Falhou, a tela
        // pede os dados; digitá-los de novo é barato, pagar sem eles não é.
        if (!res.ok) throw new Error(String(res.status))
        return res.json()
      })
      .then((data: PayerInfoResponse) => {
        if (cancelled) return
        setPayerInfoFailed(false)
        setNeedsPayerInfo(!data.hasCompletePayerInfo)
        setNeedsAddressInfo(!data.hasCompleteAddressInfo)
        setPayerEmail(data.email ?? null)
        // Pré-preenche a entrega com a ÚLTIMA ENTREGA, não com a cobrança:
        // são endereços diferentes desde que ganharam colunas próprias no
        // perfil. Na primeira compra ainda não há entrega salva, e aí a
        // cobrança é o melhor palpite disponível (quase sempre o mesmo lugar).
        const lastShipping = data.shipping
        const hasSavedShipping = Boolean(lastShipping?.postalCode)
        setShippingForm({
          recipient: (hasSavedShipping ? lastShipping?.recipient : data.fullName) ?? "",
          phone: formatOptionalPhone(
            hasSavedShipping ? lastShipping?.phone : data.phone
          ),
          postalCode: formatOptionalCep(
            hasSavedShipping ? lastShipping?.postalCode : data.postalCode
          ),
          street: (hasSavedShipping ? lastShipping?.street : data.street) ?? "",
          number: (hasSavedShipping ? lastShipping?.number : data.number) ?? "",
          complement: (hasSavedShipping ? lastShipping?.complement : data.complement) ?? "",
          neighborhood:
            (hasSavedShipping ? lastShipping?.neighborhood : data.neighborhood) ?? "",
          city: (hasSavedShipping ? lastShipping?.city : data.city) ?? "",
          state: (hasSavedShipping ? lastShipping?.state : data.state) ?? "",
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
        // Falha na checagem não bloqueia a compra: a rota de checkout valida
        // de novo. Mas o card abre em modo de edição, porque não há como
        // exibir dados que não conseguimos ler — e um card vazio "confirmado"
        // é pior do que um formulário.
        if (cancelled) return
        setPayerInfoFailed(true)
        setNeedsPayerInfo(true)
      })
      .finally(() => {
        if (!cancelled) setPayerInfoChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [user, authLoading])

  // Revalida o carrinho contra o banco. Efeito separado do de perfil de
  // propósito: este depende do carrinho, e o de perfil reescreve os
  // formulários com o endereço salvo — juntos, mexer no carrinho apagaria o
  // que a pessoa já tinha digitado no card de entrega.
  //
  // Não depende de login (o carrinho existe antes) e responde as duas coisas
  // que a tela precisa saber sobre o carrinho: se há divergência de preço/
  // estoque desde que os itens foram adicionados, e se há algo para despachar.
  useEffect(() => {
    if (items.length === 0) return
    let cancelled = false
    fetch("/api/store/cart/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        items: items.map((i) => ({
          productId: i.productId,
          variantId: i.variantId,
          variantOptionIds: i.variantOptions.map((o) => o.optionId),
        })),
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CartValidationResponse | null) => {
        if (cancelled || !data) return
        setCartNeedsShipping(data.cartNeedsShipping !== false)
        setCartIssues(
          data.lines.filter((line) => !line.available || line.issues.length > 0)
        )
        setStaleLines(
          data.lines.filter((line) => {
            const local = items.find(
              (i) =>
                i.productId === line.productId &&
                (i.variantId ?? null) === (line.variantId ?? null)
            )
            return (
              local != null &&
              line.priceCents != null &&
              line.priceCents !== local.priceCents
            )
          })
        )
      })
      .catch(() => {
        // Sem resposta, mantém o card de entrega visível e não acusa
        // divergência: o checkout revalida tudo de novo no submit, então
        // errar para o lado de não avisar não deixa passar cobrança errada.
      })
    return () => {
      cancelled = true
    }
    // `cartProductIds` (e não `items`) porque `items` muda de identidade a
    // cada clique no "+", e a revalidação não muda de resposta por isso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartProductIds])

  // Loja fechada para novos pedidos. A recusa de verdade é do servidor
  // (proxy.ts + a própria rota de checkout); aqui é só para DIZER isso antes
  // do clique — deixar o botão "Pagar com cartão" vivo numa loja fechada faz
  // a pessoa preencher tudo e levar um erro genérico no final. WEB MASTER
  // passa, igual ao servidor, para conseguir testar a compra com a loja
  // fechada.
  const storeClosed = isStoreMaintenanceEnabled() && !(user?.isWebMaster ?? false)

  const requireAddress = paymentMethod === "credit_card"
  // Cartão exige endereço; se o perfil não tem, o card já abre em edição.
  const payerIncomplete = needsPayerInfo || (requireAddress && needsAddressInfo)

  // Trocar para cartão com endereço faltando abre a edição sozinho — a
  // pessoa não precisa descobrir que tem um botão "Editar" para clicar.
  useEffect(() => {
    if (payerIncomplete) setEditingPayer(true)
  }, [payerIncomplete])

  // O servidor descarta endereço enviado num pedido que não precisa de
  // envio, então o card some quando o carrinho é só de serviços. Quando
  // aparece, preencher continua sendo opcional: o pedido fecha sem endereço
  // e ele é cobrado depois do pagamento, em "Meus Pedidos".
  const shippingComplete = isShippingFormComplete(shippingForm)

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

      {/* Divergências desde que o item foi posto no carrinho. Aparecem aqui,
          antes do resumo e do botão, porque um erro no carrinho é recuperável
          (a pessoa remove o item e segue) e o mesmo erro depois do clique em
          comprar é abandono. */}
      {staleLines.length > 0 && (
        <div className="mb-4 space-y-1.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
          <p className="text-sm font-bold text-amber-400">O preço de alguns itens mudou</p>
          {staleLines.map((line) => {
            const local = items.find(
              (i) => i.productId === line.productId && (i.variantId ?? null) === (line.variantId ?? null)
            )
            if (!local || line.priceCents == null) return null
            return (
              <p key={`${line.productId}:${line.variantId ?? "base"}`} className="text-xs text-amber-400/90">
                <span className="font-semibold">{line.name ?? local.name}</span>:{" "}
                <span className="line-through">{formatBRL(local.priceCents)}</span> →{" "}
                {formatBRL(line.priceCents)}
              </p>
            )
          })}
          <p className="pt-0.5 text-[11px] text-amber-400/70">
            O valor cobrado é sempre o preço atual, mostrado no total abaixo.
          </p>
        </div>
      )}

      {cartIssues.length > 0 && (
        <div className="mb-4 space-y-1.5 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-4 py-3">
          <p className="text-sm font-bold text-red-400">
            {cartIssues.length === 1 ? "Um item precisa da sua atenção" : "Alguns itens precisam da sua atenção"}
          </p>
          {cartIssues.map((line) => {
            const local = items.find(
              (i) => i.productId === line.productId && (i.variantId ?? null) === (line.variantId ?? null)
            )
            const reason = CART_ISSUE_LABEL[line.issues[0] ?? ""] ?? "não pode ser comprado agora"
            return (
              <div
                key={`${line.productId}:${line.variantId ?? "base"}`}
                className="flex items-center justify-between gap-3 text-xs text-red-400/90"
              >
                <span>
                  <span className="font-semibold">{line.name ?? local?.name ?? "Item"}</span> {reason}.
                </span>
                {local && (
                  <button
                    type="button"
                    onClick={() =>
                      remove(local.productId, local.variantId, local.variantOptions.map((o) => o.optionId))
                    }
                    className="shrink-0 font-semibold underline underline-offset-2 hover:text-red-300"
                  >
                    Remover
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Order summary */}
      {/* Subtotal é a soma dos preços que a pessoa viu na vitrine (`total`),
          nunca o preço do cartão: abrir o resumo com um número MAIOR do que o
          anunciado lê-se como "o preço subiu", justamente no ponto de maior
          atrito do funil. No cartão, o acréscimo aparece como linha própria —
          além de ser o certo a fazer, cobrar diferenciado exige discriminar
          o valor. */}
      <div className={cn("mb-6 space-y-1.5 rounded-xl border px-4 py-3", CARD_SURFACE)}>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "itens"})</span>
          <span>{formatBRL(total)}</span>
        </div>
        {paymentMethod === "credit_card" && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Acréscimo do cartão</span>
            <span>+{formatBRL(computePixDiscountCents(total, cardSurchargePercent))}</span>
          </div>
        )}
        {paymentMethod === "pix" && (
          <div className="flex items-center justify-between text-xs text-emerald-400">
            <span>Economia à vista no PIX</span>
            <span>{formatBRL(computePixDiscountCents(total, cardSurchargePercent))}</span>
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
            loadFailed={payerInfoFailed}
          />
        )}

        {!authLoading && user && payerInfoChecked && cartNeedsShipping && (
          <CheckoutShippingCard
            form={shippingForm}
            onChange={setShippingForm}
            editing={editingShipping}
            onEditingChange={setEditingShipping}
            skipped={shippingSkipped}
            onSkippedChange={setShippingSkipped}
          />
        )}

        {/* Loja fechada: avisa ANTES do botão, e o botão fica desabilitado —
            em vez de deixar a pessoa preencher tudo, clicar em "Pagar" e só
            então receber o 503 como se fosse falha dela. O carrinho fica
            intacto para quando a loja abrir. */}
        {storeClosed && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-400">
            <Package className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-bold">A Loja está fechada para novos pedidos no momento.</span> Seu
              carrinho fica salvo — assim que reabrirmos, é só voltar aqui e finalizar a compra.
            </p>
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
        )}

        {(authLoading || user) && (
          <Button
            type="submit"
            className="w-full gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-500/30 disabled:hover:translate-y-0"
            disabled={
              loading || authLoading || !payerInfoChecked || editingPayer || editingShipping || storeClosed
            }
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                {paymentMethod === "pix" ? "Gerando cobrança PIX..." : "Preparando pagamento..."}
              </>
            ) : storeClosed ? (
              "Loja fechada no momento"
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
