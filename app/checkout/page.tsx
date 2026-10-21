"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  CalendarClock,
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
  Truck,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useCart, type CartItem } from "@/components/providers/cart-context"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { useStoreSettings } from "@/lib/hooks/use-store-settings"
import { useDeliveryEstimate } from "@/lib/hooks/use-delivery-estimate"
import { STORE_DELIVERY_BUSINESS_DAYS } from "@/lib/store-shipping"
import { computeCardTotalCents } from "@/lib/store-pricing"
import { formatBRL } from "@/lib/format"
import { orderNumber } from "@/lib/order-number"
import {
  COMPLEMENT_CHECKOUT_PARAM,
  COMPLEMENT_ORDER_QUERY_PARAM,
  type OrderComplementSummary,
} from "@/lib/store-payment-complement"
import { cn } from "@/lib/utils"
import { cartLineMaxQuantity } from "@/lib/store-cart-limits"
import { SALE_TYPE_ICON, SALE_TYPE_LABEL } from "@/lib/store-sale-type"
import { CARD_SURFACE, CARD_SURFACE_INTERACTIVE } from "@/lib/ui-styles"
import { CheckoutPayerCard } from "@/components/store/CheckoutPayerCard"
import {
  EMPTY_PAYER_FORM,
  isPayerFormComplete,
  payerFormFromProfile,
  payerFormToPayload,
  type PayerForm,
} from "@/components/store/PayerFields"
import type { PurchaseProfile } from "@/lib/purchase-profile"
import { RemoveCartItemDialog, type PendingRemoval } from "@/components/store/RemoveCartItemDialog"
import { PendingOrderConflictDialog, PendingOrdersNotice } from "@/components/store/CheckoutPendingOrders"
import { useUserOrders, type UserOrder } from "@/lib/hooks/use-user-orders"
import { PENDING_ORDER_CONFLICT_CODE, pendingOrdersSharingCart } from "@/lib/store-pending-orders"
import { CheckoutShippingCard } from "@/components/store/CheckoutShippingCard"
import { CheckoutAffiliatePicker } from "@/components/store/CheckoutAffiliatePicker"
import {
  MercadoPagoCardForm,
  type MercadoPagoCardPayload,
  type MercadoPagoPayResult,
} from "@/components/store/MercadoPagoCardForm"
import {
  EMPTY_SHIPPING_FORM,
  isShippingFormComplete,
  shippingFormFromProfile,
  shippingFormToPayload,
  type ShippingForm,
} from "@/components/store/ShippingAddressFields"

type PaymentMethod = "pix" | "credit_card"

interface PayerInfoResponse {
  /** Quem cobra o cartão (gateway de cartão da loja). */
  paymentGatewayLabel?: string
  /** O cartão é digitado no nosso site (Stripe, Mercado Pago), não numa página do gateway. */
  cardFormOnSite?: boolean
  /** Mercado Pago: o cartão é digitado aqui mesmo e o pedido nasce no "Pagar". */
  cardGateway?: string
  /** Cobrança e última entrega salvas no perfil (mesmo contrato de Minha conta). */
  payer: PurchaseProfile["payer"]
  shipping: PurchaseProfile["shipping"]
  email?: string | null
  hasCompletePayerInfo?: boolean
  hasCompleteAddressInfo?: boolean
}

interface ValidatedCartLine {
  productId: string
  variantId: string | null
  name: string | null
  priceCents: number | null
  stock: number | null
  /** Serviço: mesmo preço no PIX e no cartão. */
  singlePrice?: boolean
  available: boolean
  issues: string[]
}

interface CartValidationResponse {
  lines: ValidatedCartLine[]
  cartNeedsShipping?: boolean
}

/** Resposta de `GET /api/store/complement` que o checkout usa. */
interface ComplementLookupResponse {
  orderId?: string
  number?: string
  complement?: OrderComplementSummary
  product?: { id: string; slug: string; name: string; image: string | null }
  error?: string
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
  preorder_unavailable: "está com a pré-venda fechada no momento",
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
  const [singlePriceProductIds, setSinglePriceProductIds] = useState<Set<string>>(() => new Set())
  const [payerEmail, setPayerEmail] = useState<string | null>(null)
  // Nome mostrado no texto do cartão: vem do servidor, que sabe qual
  // gateway cobra o cartão (Asaas por padrão, Stripe ou Mercado Pago quando ligados).
  const [paymentGatewayLabel, setPaymentGatewayLabel] = useState("Asaas")
  const [cardFormOnSite, setCardFormOnSite] = useState(false)
  const [cardGateway, setCardGateway] = useState<string | null>(null)
  // Formulário do cartão aberto (Mercado Pago). O pedido ainda NÃO existe: ele
  // só é criado quando a pessoa clica em "Pagar" no formulário.
  const [cardStep, setCardStep] = useState(false)
  const [editingPayer, setEditingPayer] = useState(false)
  const [loading, setLoading] = useState(false)
  // Trava síncrona contra envio duplo. `loading` só desabilita o botão no
  // próximo render: Enter + clique (ou dois toques rápidos no celular) cabiam
  // antes dele e criavam dois pedidos. O servidor também recusa (uma compra
  // por conta por vez), mas a segunda resposta piscava um erro na tela.
  const submittingRef = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("pix")
  const [pendingRemoval, setPendingRemoval] = useState<PendingRemoval | null>(null)
  // Afiliado escolhido no "Apoie um afiliado". `undefined` enquanto o seletor
  // não carregou: aí o corpo não leva o campo e vale o cookie do link.
  const [affiliateCode, setAffiliateCode] = useState<string | null | undefined>(undefined)
  // Divergências entre o carrinho (localStorage) e o banco, detectadas na
  // abertura da tela — mostradas ANTES do submit, não como erro depois dele.
  const [cartIssues, setCartIssues] = useState<ValidatedCartLine[]>([])
  const [staleLines, setStaleLines] = useState<ValidatedCartLine[]>([])
  const { cardSurchargePercent, cardEnabled, cardMaxInstallments } = useStoreSettings()

  // Complemento de Pagamento (`?complemento=<pedido>`): paga o pendente de um
  // pedido em vez do carrinho, que fica intocado. A linha mostrada vem do
  // servidor, e o checkout recalcula o valor de novo ao cobrar.
  const [paramsChecked, setParamsChecked] = useState(false)
  const [complementOrderId, setComplementOrderId] = useState<string | null>(null)
  const [complementItem, setComplementItem] = useState<CartItem | null>(null)
  const [complementError, setComplementError] = useState<string | null>(null)
  const [complementSlug, setComplementSlug] = useState<string | null>(null)
  useEffect(() => {
    // Lido no cliente (sem `useSearchParams`, que exigiria Suspense na página).
    const id = new URLSearchParams(window.location.search).get(COMPLEMENT_CHECKOUT_PARAM)
    if (id && UUID_RE.test(id)) setComplementOrderId(id.toLowerCase())
    setParamsChecked(true)
  }, [])

  useEffect(() => {
    if (!complementOrderId || authLoading || !user) return
    let cancelled = false
    fetch(`/api/store/complement?${COMPLEMENT_ORDER_QUERY_PARAM}=${orderNumber(complementOrderId)}`)
      .then(async (res) => ({ ok: res.ok, data: (await res.json().catch(() => ({}))) as ComplementLookupResponse }))
      .then(({ ok, data }) => {
        if (cancelled) return
        if (data.product) setComplementSlug(data.product.slug)
        if (!ok || !data.complement || !data.product || data.orderId !== complementOrderId) {
          throw new Error(data.error ?? "Não encontramos esse pedido na sua conta.")
        }
        if (data.complement.awaitingPaymentOrderId) {
          throw new Error(
            `Você já gerou o pagamento deste complemento (pedido #${orderNumber(data.complement.awaitingPaymentOrderId)}). Pague ou cancele em Meus Pedidos.`
          )
        }
        if (data.complement.pendingCents <= 0) {
          throw new Error("Este pedido não tem valor a complementar no momento.")
        }
        setComplementItem({
          productId: data.product.id,
          variantId: null,
          variantLabel: `Pedido #${data.number}`,
          variantColor: null,
          variantIcon: null,
          variantOptions: [],
          slug: data.product.slug,
          name: data.product.name,
          priceCents: data.complement.pendingCents,
          quantity: 1,
          image: data.product.image,
          stock: null,
          type: "store",
          condition: "new",
          sale_type: "normal",
          singlePrice: true,
        })
      })
      .catch((err) => {
        if (!cancelled) setComplementError(err instanceof Error ? err.message : "Não foi possível carregar o pedido.")
      })
    return () => {
      cancelled = true
    }
  }, [complementOrderId, authLoading, user])

  const isComplement = complementOrderId !== null
  // O que esta tela cobra: o carrinho, ou a linha única do complemento.
  const checkoutItems = isComplement ? (complementItem ? [complementItem] : []) : items
  const loginPath = isComplement ? `/checkout?${COMPLEMENT_CHECKOUT_PARAM}=${complementOrderId}` : "/checkout"
  // Cartão desligado no gateway ativo (Stripe: só PIX) — o checkout recusaria.
  // Garante PIX mesmo se o cartão estava escolhido antes da resposta chegar.
  useEffect(() => {
    if (!cardEnabled) setPaymentMethod("pix")
  }, [cardEnabled])

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

  // Pedidos aguardando pagamento: aviso no topo e, se algum tem produto do
  // carrinho, a pergunta "pagar o aberto ou substituir" no clique. O servidor
  // recusa o duplicado de qualquer jeito (409); aqui é para avisar antes.
  const { orders: pendingOrders, refetch: refetchPendingOrders } = useUserOrders({
    pageSize: 10,
    filters: { status: "pending" },
  })
  const pendingConflicts = useMemo(
    () => (isComplement ? [] : pendingOrdersSharingCart(pendingOrders, cartProductIds.split(",").filter(Boolean))),
    [isComplement, pendingOrders, cartProductIds]
  )
  const pendingConflictIds = useMemo(() => new Set(pendingConflicts.map((order) => order.id)), [pendingConflicts])
  // Pedidos que a pessoa escolheu substituir por esta compra (vão no corpo).
  const [replaceOrderIds, setReplaceOrderIds] = useState<string[]>([])
  // Ids do diálogo de conflito. Derivado da lista, para o 409 do servidor
  // abrir o diálogo assim que o refetch trouxer os pedidos.
  const [conflictPromptIds, setConflictPromptIds] = useState<string[]>([])
  const conflictPromptOrders = pendingOrders.filter((order) => conflictPromptIds.includes(order.id))
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null)

  async function cancelPendingOrder(order: UserOrder) {
    setCancellingOrderId(order.id)
    setError(null)
    const res = await fetch(`/api/store/orders/${order.id}/cancel`, { method: "POST" }).catch(() => null)
    if (!res?.ok) {
      const data = (await res?.json().catch(() => null)) as { error?: string } | null
      setError(data?.error ?? "Não foi possível cancelar o pedido. Tente de novo")
    }
    setCancellingOrderId(null)
    setReplaceOrderIds((ids) => ids.filter((id) => id !== order.id))
    refetchPendingOrders()
  }

  /** 409 do checkout: um produto do carrinho entrou num pedido aberto (outra aba, outro aparelho). */
  function handlePendingConflict(data: { error?: string; pendingOrderIds?: string[] }) {
    setError(data.error ?? "Você já tem um pedido aguardando pagamento com este produto")
    setConflictPromptIds(data.pendingOrderIds ?? [])
    setReplaceOrderIds([])
    refetchPendingOrders()
  }

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
        if (data.paymentGatewayLabel) setPaymentGatewayLabel(data.paymentGatewayLabel)
        setCardFormOnSite(data.cardFormOnSite === true)
        setCardGateway(data.cardGateway ?? null)
        // Pré-preenche a entrega com a ÚLTIMA ENTREGA, não com a cobrança:
        // são endereços diferentes desde que ganharam colunas próprias no
        // perfil. Na primeira compra ainda não há entrega salva, e aí a
        // cobrança é o melhor palpite disponível (quase sempre o mesmo lugar).
        setShippingForm(shippingFormFromProfile(data, { fallbackToPayer: true }))
        setPayerForm(payerFormFromProfile(data.payer))
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
    if (items.length === 0 || complementOrderId) return
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
        setSinglePriceProductIds(
          new Set(data.lines.filter((line) => line.singlePrice).map((line) => line.productId))
        )
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
  }, [cartProductIds, complementOrderId])

  // Loja fechada para novos pedidos. A recusa de verdade é do servidor
  // (proxy.ts + a própria rota de checkout); aqui é só para DIZER isso antes
  // do clique — deixar o botão "Pagar com cartão" vivo numa loja fechada faz
  // a pessoa preencher tudo e levar um erro genérico no final. Passa, igual
  // ao servidor, só quem tem a liberação individual do "pacote Loja".
  // `canUseStore` já chega resolvido de /api/auth/me.
  //
  // Enquanto a auth carrega não afirmamos "fechada": `canUseStore` só existe
  // depois do /api/auth/me, e assumir fechado nesse intervalo faria a faixa de
  // loja fechada piscar em toda visita — o botão de pagar já fica desabilitado
  // por `authLoading` no mesmo período, então nada escapa.
  //
  // Visitante também não leva a faixa: o contexto é `null` sem sessão, e ler
  // `null` como "sem acesso" anunciava a Loja fechada para todo deslogado com
  // ela aberta. Deslogado já não tem botão de pagar (o card de login ocupa o
  // lugar); depois do login o `canUseStore` real chega e decide.
  const storeClosed = !authLoading && user !== null && !user.canUseStore

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

  // Card em edição só segura o pagamento enquanto falta dado. Preenchido, o
  // botão de pagar vale como "confirmar": é o que a pessoa faz ao terminar de
  // digitar, e o corpo da requisição já leva o formulário atual. Exigir o
  // clique no "Confirmar" de dentro do card deixava o botão cinza sem dizer
  // por quê, e no card de perfil incompleto esse botão nem existia.
  const payerFormComplete = isPayerFormComplete(payerForm, requireAddress)
  const payerBlocking = editingPayer && !payerFormComplete
  const shippingBlocking = editingShipping && !shippingComplete

  // Complemento não vai pelo correio: sem card de entrega nem linha de frete.
  const showShipping = cartNeedsShipping && !isComplement
  const total = checkoutItems.reduce((sum, i) => sum + i.priceCents * i.quantity, 0)
  // Serviço tem preço único: o acréscimo do cartão (e o desconto do PIX) só
  // incide sobre o resto do carrinho. O item salvo antes do campo existir
  // aprende pela revalidação.
  const cardTotal = computeCardTotalCents(
    checkoutItems.map((i) => ({
      priceCents: i.priceCents,
      quantity: i.quantity,
      singlePrice: i.singlePrice ?? singlePriceProductIds.has(i.productId),
    })),
    cardSurchargePercent
  )
  const cardSurchargeCents = cardTotal - total
  const payableTotal = paymentMethod === "credit_card" ? cardTotal : total
  // Mercado Pago: o cartão é digitado nesta tela e a cobrança cria o pedido.
  // Stripe precisa do PaymentIntent antes do formulário, e a Asaas hospeda o
  // cartão; os dois seguem criando o pedido no clique.
  const cardHere = paymentMethod === "credit_card" && cardGateway === "mercadopago"

  // Mudou o que está sendo pago (forma, valor, dados): o formulário fecha e a
  // pessoa confirma de novo, para o Brick não ficar com o valor antigo.
  useEffect(() => {
    setCardStep(false)
  }, [paymentMethod, payableTotal])
  useEffect(() => {
    if (editingPayer || editingShipping) setCardStep(false)
  }, [editingPayer, editingShipping])
  const hasPreOrderItem = checkoutItems.some((i) => i.sale_type === "pre_order")
  const onlyPreOrderItems = checkoutItems.length > 0 && checkoutItems.every((i) => i.sale_type === "pre_order")
  const deliveryDeadline = useDeliveryEstimate()

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

  function buildCheckoutBody(replaceIds: string[] = replaceOrderIds) {
    return {
      items: checkoutItems.map((i) => ({
        productId: i.productId,
        variantId: i.variantId,
        variantOptionIds: i.variantOptions.map((o) => o.optionId),
        quantity: i.quantity,
      })),
      paymentMethod,
      ...payerFormToPayload(payerForm, { includeAddress: requireAddress }),
      // Só manda o endereço quando está completo e não foi pulado: o
      // servidor recusa um endereço pela metade (e faz bem — pedido com
      // rua e sem número parece pronto para despachar e não é).
      ...(shippingComplete && !shippingSkipped ? shippingFormToPayload(shippingForm) : {}),
      ...(affiliateCode !== undefined && !isComplement ? { affiliateCode } : {}),
      ...(isComplement ? { complementOrderId } : {}),
      ...(replaceIds.length > 0 ? { replacePendingOrderIds: replaceIds } : {}),
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!user) {
      openLogin(loginPath)
      return
    }

    if (payerBlocking) {
      setError("Preencha os dados da cobrança antes de continuar.")
      return
    }

    if (shippingBlocking) {
      setError("Complete o endereço de entrega ou escolha informar depois de pagar.")
      return
    }

    // Produto do carrinho num pedido aberto: pergunta antes (pagar o aberto
    // ou substituir). Já confirmado, segue com os ids no corpo.
    if (pendingConflicts.some((order) => !replaceOrderIds.includes(order.id))) {
      setConflictPromptIds(pendingConflicts.map((order) => order.id))
      return
    }

    await proceedCheckout(replaceOrderIds)
  }

  /** "Substituir" do diálogo: o servidor cancela o pedido aberto na mesma chamada que cria este. */
  function replacePendingAndContinue() {
    const ids = conflictPromptOrders.map((order) => order.id)
    setReplaceOrderIds(ids)
    setConflictPromptIds([])
    void proceedCheckout(ids)
  }

  async function proceedCheckout(replaceIds: string[]) {
    // Recolhe os cards para a pessoa ver o resumo do que está sendo enviado.
    setEditingPayer(false)
    setEditingShipping(false)

    // Mercado Pago: só abre o formulário. Nada é criado até o "Pagar" dele.
    if (cardHere) {
      setCardStep(true)
      return
    }

    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)

    try {
      const res = await fetch("/api/store/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildCheckoutBody(replaceIds)),
      })

      // Timeout da plataforma (504) volta HTML, não JSON. O pedido pode ter
      // sido criado mesmo assim: a mensagem manda conferir antes de repetir
      // (e, se repetir, a trava de um pedido por produto oferece pagar o
      // aberto em vez de criar outro).
      const data = (await res.json().catch(() => ({
        error: "A resposta demorou demais. Confira em Meus Pedidos se o pedido foi criado antes de tentar de novo.",
      }))) as {
        orderId?: string
        accessToken?: string | null
        checkoutUrl?: string
        /** Stripe / Mercado Pago: o cartão é digitado no nosso site, em `/checkout/card`. */
        cardPayment?: boolean
        error?: string
        code?: string
        pendingOrderIds?: string[]
      }

      if (res.status === 409 && data.code === PENDING_ORDER_CONFLICT_CODE) {
        handlePendingConflict(data)
        submittingRef.current = false
        setLoading(false)
        return
      }

      if (!res.ok || !data.orderId) {
        throw new Error(data.error ?? "Erro ao iniciar checkout")
      }

      // Cobrança criada: o pedido já existe (aguardando pagamento) e o
      // estoque já foi reservado, então o carrinho cumpriu seu papel. Deixar
      // os itens ali faz a pessoa achar que a compra não foi registrada — e
      // um segundo checkout geraria um pedido duplicado.
      // O complemento não passou pelo carrinho: o que estava lá continua.
      if (!isComplement) clear()

      // Cartão no Stripe ou no Mercado Pago: o formulário é nosso (Payment
      // Element / Card Payment Brick), em `/checkout/card`. O pedido já existe.
      if (paymentMethod === "credit_card" && data.cardPayment) {
        window.location.href = `/checkout/card?orderId=${data.orderId}`
        return
      }

      // Cartão na Asaas: ela hospeda a página de pagamento — redireciona pra lá
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
      // Falha de rede (`fetch` rejeitado) cai aqui com a mensagem crua do
      // navegador ("Failed to fetch"); a resposta do servidor já vem em PT.
      setError(
        err instanceof TypeError
          ? "Sem conexão com o servidor. Confira sua internet e, antes de tentar de novo, se o pedido aparece em Meus Pedidos."
          : err instanceof Error
            ? err.message
            : "Erro ao iniciar checkout"
      )
      submittingRef.current = false
      setLoading(false)
    }
  }

  /**
   * "Pagar" do formulário do Mercado Pago: UMA chamada cria o pedido e cobra o
   * cartão. Recusado, o servidor não deixa pedido nenhum e o Brick volta ao
   * formulário com a mensagem.
   */
  async function payWithCard(card: MercadoPagoCardPayload): Promise<MercadoPagoPayResult> {
    if (submittingRef.current) return { ok: false, error: "Já estamos processando o pagamento. Aguarde" }
    submittingRef.current = true
    setError(null)
    const res = await fetch("/api/store/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...buildCheckoutBody(), card }),
    }).catch(() => null)
    const data = ((await res?.json().catch(() => ({}))) ?? {}) as {
      orderId?: string
      error?: string
      code?: string
      pendingOrderIds?: string[]
    }
    if (res?.status === 409 && data.code === PENDING_ORDER_CONFLICT_CODE) {
      submittingRef.current = false
      // Fecha o formulário: o diálogo de conflito decide, e "Substituir" reabre.
      setCardStep(false)
      handlePendingConflict(data)
      return { ok: false, error: data.error ?? "Você já tem um pedido aguardando pagamento com este produto" }
    }
    if (!res || !res.ok || !data.orderId) {
      submittingRef.current = false
      return {
        ok: false,
        error:
          data.error ??
          (res
            ? "Não foi possível processar o cartão agora. Confira em Meus Pedidos antes de tentar de novo"
            : "Sem conexão com o servidor. Confira em Meus Pedidos antes de tentar de novo"),
      }
    }
    // Pedido criado (pago ou em análise): o carrinho cumpriu seu papel. A tela
    // de cartão mostra a confirmação, ou aguarda a análise.
    setLoading(true)
    if (!isComplement) clear()
    window.location.href = `/checkout/card?orderId=${data.orderId}`
    return { ok: true }
  }

  // `loading` continua true depois do clear() até a navegação acontecer: sem
  // isso, esvaziar o carrinho renderizaria o estado "carrinho vazio" por uma
  // fração de segundo, como se a compra tivesse sumido.
  // Primeiro quadro: ainda não se sabe se é carrinho ou complemento.
  if (!paramsChecked) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
      </div>
    )
  }

  if (checkoutItems.length === 0 && loading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <Loader2 className="size-8 animate-spin text-emerald-400" />
        <p className="text-sm text-muted-foreground">
          {paymentMethod === "pix"
            ? "Gerando sua cobrança PIX..."
            : cardHere
              ? "Confirmando pagamento..."
              : "Redirecionando para o pagamento..."}
        </p>
      </div>
    )
  }

  if (isComplement && checkoutItems.length === 0) {
    const backHref = complementSlug ? `/loja/${complementSlug}` : "/conta/pedidos"
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
        {complementError ? (
          <>
            <Package className="size-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">{complementError}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={backHref}>
                <Button variant="outline">Voltar</Button>
              </Link>
              <Link href="/conta/pedidos">
                <Button variant="ghost">Meus Pedidos</Button>
              </Link>
            </div>
          </>
        ) : !authLoading && !user ? (
          <>
            <p className="text-sm text-foreground">Entre na conta em que você fez o pedido para pagar o complemento.</p>
            <Button
              type="button"
              onClick={() => openLogin(loginPath)}
              className="gap-2 bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <LogIn className="size-4" />
              Entrar
            </Button>
          </>
        ) : (
          <Loader2 className="size-8 animate-spin text-emerald-400" />
        )}
      </div>
    )
  }

  if (checkoutItems.length === 0) {
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

  const itemCount = checkoutItems.reduce((sum, i) => sum + i.quantity, 0)
  const storeBase = "/loja"

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:py-10 lg:max-w-6xl">
      <h1 className="mb-1 text-2xl font-black text-foreground">
        {isComplement ? "Pagar complemento" : "Finalizar Compra"}
      </h1>
      <p className="mb-6 text-sm text-muted-foreground">
        {isComplement && complementOrderId
          ? `Valor pendente do pedido #${orderNumber(complementOrderId)}`
          : `${itemCount} ${itemCount === 1 ? "item" : "itens"} no carrinho`}
      </p>

      {user && !isComplement && (
        <PendingOrdersNotice
          orders={pendingOrders}
          conflictIds={pendingConflictIds}
          cancellingId={cancellingOrderId}
          onCancel={cancelPendingOrder}
        />
      )}

      {/* Duas colunas a partir de `lg`: o que se revisa e preenche à esquerda,
          o resumo e o botão de pagar à direita, presos na tela enquanto a
          pessoa rola. No celular é uma coluna só, na ordem do funil: itens,
          forma de pagamento, dados, e só então o total e o botão. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-8">
        <div className="min-w-0">
        <div className="mb-4 space-y-2">
          {checkoutItems.map((item) => {
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
                  <img src={item.image} alt={item.name} className="h-full w-full object-contain p-1" loading="lazy" decoding="async" />
                ) : (
                  <Package className="size-5 text-muted-foreground" />
                )}
              </Link>

              {/* Info: name, variant, badges */}
              <div className="min-w-0 flex-1">
                {/* `block`: `truncate` num <a> inline não corta nada, e nome
                    longo vazava por cima dos botões de quantidade no celular. */}
                <Link
                  href={`${storeBase}/${item.slug}`}
                  className="block truncate text-sm font-semibold text-foreground hover:underline"
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
                {!isComplement && <p className="mt-1 text-xs text-muted-foreground">{formatBRL(item.priceCents)} cada</p>}
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
                {!isComplement && (
                <>
                {/* Alvos de toque: 32px no celular (eram 24px, e o "+" vivia
                    acertando o "−" vizinho); 24px a partir de `sm`, com mouse. */}
                <button
                  type="button"
                  onClick={() => requestRemoval(item, false)}
                  aria-label={`Remover ${item.name}`}
                  className="-m-1.5 flex size-8 items-center justify-center rounded-md text-muted-foreground/60 transition-colors hover:text-red-400 sm:m-0 sm:size-6"
                >
                  <Trash2 className="size-3.5" />
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() =>
                      item.quantity <= 1
                        ? requestRemoval(item, true)
                        : decrement(item.productId, item.variantId, optionIds)
                    }
                    aria-label={item.quantity <= 1 ? `Remover ${item.name}` : "Diminuir quantidade"}
                    className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground sm:size-6"
                  >
                    <Minus className="size-3" />
                  </button>
                  <span className="w-6 text-center text-xs font-bold tabular-nums text-foreground" aria-live="polite">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => increment(item.productId, item.variantId, optionIds)}
                    disabled={item.quantity >= cartLineMaxQuantity(item)}
                    aria-label="Aumentar quantidade"
                    className="flex size-8 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:border-foreground/20 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:size-6"
                  >
                    <Plus className="size-3" />
                  </button>
                </div>
                </>
                )}
                <span className="text-sm font-bold text-foreground">
                  {formatBRL(item.priceCents * item.quantity)}
                </span>
              </div>
            </div>
            )
          })}
        </div>

        {/* Payment method toggle. Sem cartão (Stripe: só PIX), o PIX é o único
            botão e não anuncia desconto em relação a um meio que não existe. */}
        <div className={cn("mb-6 grid gap-2", cardEnabled ? "grid-cols-2" : "grid-cols-1")}>
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
              {formatBRL(total)}
              {cardEnabled && cardSurchargeCents > 0 && ` (-${cardSurchargePercent}%)`}
            </span>
          </button>
          {cardEnabled && (
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
          )}
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

        {hasPreOrderItem && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3 text-sm text-amber-400">
            <Rocket className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-bold">Seu pedido tem item(ns) em pré-venda.</span> O pagamento é processado
              normalmente, mas o envio desses produtos só acontece quando o estoque chegar; acompanhe o status na sua conta.
            </p>
          </div>
        )}

        <form id="checkout-form" onSubmit={handleSubmit} className="space-y-4">
          {!authLoading && !user && (
            <div className={cn("space-y-3 rounded-xl border p-4 text-center", CARD_SURFACE)}>
              <p className="text-sm text-foreground">Você precisa estar logado para finalizar a compra.</p>
              <p className="text-xs text-muted-foreground">
                Isso protege seu pedido e permite acompanhar o status da entrega na sua conta.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <Button
                  type="button"
                  onClick={() => openLogin(loginPath)}
                  className="gap-2 bg-emerald-600 text-white transition-transform hover:-translate-y-0.5 hover:bg-emerald-500"
                >
                  <LogIn className="size-4" />
                  Entrar
                </Button>
                <Button type="button" variant="outline" onClick={() => openRegister(loginPath)}>
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

          {!authLoading && user && payerInfoChecked && showShipping && (
            <CheckoutShippingCard
              form={shippingForm}
              onChange={setShippingForm}
              editing={editingShipping}
              onEditingChange={setEditingShipping}
              skipped={shippingSkipped}
              onSkippedChange={setShippingSkipped}
            />
          )}

          {/* Logo acima do botão de pagar: é o último passo antes de finalizar,
              onde a pessoa ainda lembra de quem a trouxe até aqui. */}
          {!authLoading && user && payerInfoChecked && !isComplement && (
            <CheckoutAffiliatePicker value={affiliateCode} onChange={setAffiliateCode} disabled={loading} />
          )}

        </form>
        </div>

        {/* Sticky só sem o formulário do cartão aberto: com ele o resumo fica
            mais alto que a tela, e o fim (o botão de pagar) ficaria
            inalcançável até o fim da página. */}
        <aside
          aria-label="Resumo do pedido"
          className={cn(
            "mt-6 space-y-4 lg:mt-0",
            !cardStep && "lg:sticky lg:top-[calc(var(--sticky-header-h)+1rem)]"
          )}
        >
        {/* Order summary */}
        {/* Subtotal é a soma dos preços que a pessoa viu na vitrine (`total`),
            nunca o preço do cartão: abrir o resumo com um número MAIOR do que o
            anunciado lê-se como "o preço subiu", justamente no ponto de maior
            atrito do funil. No cartão, o acréscimo aparece como linha própria —
            além de ser o certo a fazer, cobrar diferenciado exige discriminar
            o valor. */}
        <div className={cn("space-y-1.5 rounded-xl border px-4 py-3", CARD_SURFACE)}>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Subtotal ({itemCount} {itemCount === 1 ? "item" : "itens"})</span>
            <span>{formatBRL(total)}</span>
          </div>
          {paymentMethod === "credit_card" && cardSurchargeCents > 0 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Acréscimo do cartão</span>
              <span>+{formatBRL(cardSurchargeCents)}</span>
            </div>
          )}
          {paymentMethod === "pix" && cardEnabled && cardSurchargeCents > 0 && (
            <div className="flex items-center justify-between text-xs text-emerald-400">
              <span>Economia à vista no PIX</span>
              <span>{formatBRL(cardSurchargeCents)}</span>
            </div>
          )}
          {/* O total nunca teve frete: a linha só diz isso em voz alta. Carrinho
              só de serviço não vai pelo correio, então não fala de frete. */}
          {showShipping && (
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <Truck className="size-3.5" />
                Frete
              </span>
              <span className="font-bold text-emerald-400">Grátis</span>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Pagamento</span>
            <span>
              {paymentMethod === "pix"
                ? "PIX (aprovação imediata)"
                : !cardFormOnSite
                  ? `Cartão de crédito, via página segura da ${paymentGatewayLabel}`
                  : cardMaxInstallments > 1
                    ? "Cartão de crédito"
                    : "Cartão de crédito à vista"}
            </span>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 pt-1.5 text-sm font-bold">
            <span>Total</span>
            <span className="text-emerald-400">{formatBRL(payableTotal)}</span>
          </div>
        </div>

        {/* Previsão de entrega: a mesma conta da página do produto
            (lib/store-shipping.ts). Pré-venda conta da chegada do lote, então
            não tem data. */}
        {showShipping && (
          <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] px-4 py-3">
            <CalendarClock className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            <div>
              <p className="text-sm font-semibold text-foreground">
                {onlyPreOrderItems ? (
                  `Entrega em até ${STORE_DELIVERY_BUSINESS_DAYS} dias úteis após a chegada do lote`
                ) : deliveryDeadline ? (
                  <>
                    Entrega estimada: até <span className="text-emerald-400">{deliveryDeadline}</span>
                  </>
                ) : (
                  `Entrega em até ${STORE_DELIVERY_BUSINESS_DAYS} dias úteis`
                )}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {onlyPreOrderItems
                  ? "Frete grátis. O prazo começa a contar quando o estoque chega."
                  : `Frete grátis. Até ${STORE_DELIVERY_BUSINESS_DAYS} dias úteis contados da confirmação do pagamento.`}
                {hasPreOrderItem && !onlyPreOrderItems &&
                  ` Itens em pré-venda: até ${STORE_DELIVERY_BUSINESS_DAYS} dias úteis após a chegada do lote.`}
              </p>
            </div>
          </div>
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
                carrinho fica salvo; assim que reabrirmos, é só voltar aqui e finalizar a compra.
              </p>
            </div>
          )}

          {error && (
            <p className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          {(authLoading || user) && !cardStep && (
            <Button
              type="submit"
              form="checkout-form"
              className="w-full gap-2 bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 transition-all hover:-translate-y-0.5 hover:bg-emerald-500 hover:shadow-emerald-500/30 disabled:hover:translate-y-0"
              disabled={
                loading || authLoading || !payerInfoChecked || payerBlocking || shippingBlocking || storeClosed
              }
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  {paymentMethod === "pix" ? "Gerando cobrança PIX..." : "Preparando pagamento..."}
                </>
              ) : storeClosed ? (
                "Loja fechada no momento"
              ) : payerBlocking ? (
                "Preencha os dados da cobrança"
              ) : shippingBlocking ? (
                "Complete o endereço de entrega"
              ) : paymentMethod === "pix" ? (
                "Gerar PIX"
              ) : cardHere ? (
                "Continuar para o cartão"
              ) : (
                "Pagar com cartão"
              )}
            </Button>
          )}

        {/* Fora do <form> do checkout: o Brick tem o próprio formulário e botão
            "Pagar", e o submit dele subiria até o `handleSubmit` daqui. */}
        {cardStep && user && (
          <div className="space-y-2">
            <MercadoPagoCardForm
              amountCents={cardTotal}
              maxInstallments={cardMaxInstallments}
              payerEmail={payerEmail}
              onPay={payWithCard}
            />
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => setCardStep(false)}
            >
              Voltar e revisar o pedido
            </Button>
          </div>
        )}

        {/* Trust / security info */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
          <div className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 transition-colors", CARD_SURFACE)}>
            <QrCode className="size-4 shrink-0 text-emerald-400" />
            <span className="text-[11px] text-muted-foreground">
              {paymentMethod === "pix"
                ? "Pagamento via PIX, sem cadastro de cartão"
                : cardFormOnSite
                  ? `Os dados do cartão vão direto para o ${paymentGatewayLabel}, criptografados — nunca para o nosso servidor`
                  : `Cartão digitado direto na página segura da ${paymentGatewayLabel}, nunca no nosso site`}
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

        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-center text-[10px] text-muted-foreground/70">
          <Link href="/privacidade" className="hover:text-emerald-400 hover:underline">
            Privacidade
          </Link>
        </div>

        </aside>
      </div>

      <PendingOrderConflictDialog
        orders={conflictPromptOrders}
        onOpenChange={(open) => {
          if (!open) setConflictPromptIds([])
        }}
        onReplace={replacePendingAndContinue}
      />

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
