"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { ArrowRight, Crown, Check, CreditCard, Loader2, Lock, QrCode, ShieldCheck } from "lucide-react"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { BR_STATES } from "@/lib/br-states"
import {
  VIP_PLANS,
  vipSubscriptionBenefits,
  VIP_SUPPORT_MESSAGE,
  formatBrlCents,
  vipYearlyMonthlyEquivalentCents,
  vipYearlySavingsPercent,
  type VipBillingPeriod,
} from "@/lib/vip-plan"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { useAuthUser } from "@/components/providers/auth-context"
import { useAuthModal } from "@/components/providers/auth-modal-context"
import { rememberVipIntent } from "@/lib/client/vip-intent"
import { VipPixCharge, type VipPixPayment } from "@/components/account/VipPixCharge"

interface VipUpsellModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Aura disponível para o botão "Ativar com Aura" — omitido esconde essa opção (ex.: usuário deslogado). */
  auraCost?: number
  onPurchaseWithAura?: () => Promise<void>
  /**
   * Força o modo, ignorando o estado real do usuário. NÃO PASSE isto: por
   * padrão o modal deriva o modo do contexto de auth (ver `resolveVipStatus`),
   * que é o que garante o mesmo texto e o mesmo verbo venha o modal da
   * sidebar, do menu da conta, da tierlist, da Central de Aura ou de /conta.
   *
   * Enquanto o modo vinha só por prop, apenas /conta o passava — abrir o
   * MESMO modal pela sidebar oferecia "Assinar por R$ 8,90/mês" a quem só
   * precisava reativar sem pagar nada.
   *
   * Existe para o caso em que o chamador sabe algo mais fresco que o contexto
   * (ex.: /conta acabou de reconsultar /api/vip/subscription).
   */
  mode?: "subscribe" | "resubscribe"
  /**
   * VIP atual (dd/mm/aaaa), mostrado na reativação para deixar claro que nada
   * é perdido e que não há cobrança agora. Sem isto o modal formata a data a
   * partir do próprio contexto de auth.
   */
  currentAccessUntil?: string | null
  /** Chamado após o POST dar certo, antes do redirect pro checkout da Asaas. */
  onSubscribeStarted?: () => void
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

function formatCpfInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11)
  return digits
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})$/, "$1-$2")
}

interface CepLookupResponse {
  error?: string
  street?: string
  neighborhood?: string
  city?: string
  state?: string
}

/** Estado do que o perfil já tem, vindo do GET /api/vip/subscribe. */
interface BillingRequirements {
  needsPayerInfo: boolean
  needsAddressInfo: boolean
}

/** Modal "Vantagens do VIP" — vantagens à esquerda, cobrança à direita, os dois caminhos de ativação (Aura ou assinatura). */
export function VipUpsellModal({
  open,
  onOpenChange,
  auraCost,
  onPurchaseWithAura,
  mode,
  currentAccessUntil,
  onSubscribeStarted,
}: VipUpsellModalProps) {
  const { user: authUser, loading: authLoading } = useAuthUser()
  const { openLogin, openRegister } = useAuthModal()
  /**
   * Visitante sem sessão confirmada pelo servidor.
   *
   * Este modal é aberto de vários lugares (sidebar, Central de Aura, gate da
   * tierlist, menu da conta) e nem todos checavam login antes: a pessoa
   * deslogada via a oferta inteira, escolhia plano e método, clicava em
   * "Confirmar assinatura" e só então o POST devolvia 401 — que chegava como
   * um toast vermelho de erro, sem caminho nenhum para sair dele. Nenhuma tela
   * consumidora precisa mais fazer essa checagem: o modal se apresenta no modo
   * certo sozinho (mesma ideia de `isResubscribe` logo abaixo).
   *
   * `loading` e não `pending`: enquanto o servidor não respondeu, esconder as
   * ações de pagamento é o erro barato — mostrá-las a quem não pode usá-las é
   * o caro (é o bug que esta tela corrige).
   */
  const isGuest = !authLoading && !authUser
  // O estado REAL do usuário decide o modo; a prop só sobrescreve quando o
  // chamador tem informação mais fresca. Foi a inversão disso (prop primeiro,
  // sem fallback) que deixou o modal com texto de assinatura nova em todos os
  // pontos de entrada menos /conta.
  const isResubscribe = mode ? mode === "resubscribe" : Boolean(authUser?.vip.canReactivate)
  // Mesma lógica para a data: o chamador pode passar a sua, senão sai do
  // contexto — nunca fica vazia só porque o modal foi aberto pela sidebar.
  const accessUntil =
    currentAccessUntil ??
    (authUser?.vipExpiresAt
      ? new Date(authUser.vipExpiresAt).toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })
      : null)
  const subscriptionEnabled = isVipSubscriptionEnabled()
  const [subscribing, setSubscribing] = useState(false)
  const [purchasingWithAura, setPurchasingWithAura] = useState(false)

  // `null` = ainda checando. A Asaas Checkout de cartão exige o pagador
  // completo, e os dois blocos são validados por schemas distintos no POST —
  // por isso o modal rastreia o que falta separadamente.
  const [requirements, setRequirements] = useState<BillingRequirements | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  // Método escolhido. PIX é o padrão: não exige endereço nem cartão, então é
  // o caminho com menos atrito para a maioria.
  const [method, setMethod] = useState<"pix" | "credit_card">("pix")
  // Plano escolhido. MENSAL é o padrão de propósito: é o compromisso menor, e
  // empurrar o anual por default cobraria 10× mais de quem só clicou em
  // "assinar" sem olhar. O anual ganha destaque visual (selo de economia), não
  // vantagem no default.
  const [billingPeriod, setBillingPeriod] = useState<VipBillingPeriod>("monthly")
  const selectedPlan = VIP_PLANS[billingPeriod]
  // Cobrança PIX devolvida pelo POST — o modal vira a tela do QR em vez de
  // redirecionar para fora (no PIX não há página hospedada da Asaas).
  const [pixPayment, setPixPayment] = useState<VipPixPayment | null>(null)
  const [pixPending, setPixPending] = useState<string | null>(null)
  const firstFieldRef = useRef<HTMLInputElement>(null)

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

  const needsPayerInfo = requirements?.needsPayerInfo ?? false
  // Endereço é exigência da TOKENIZAÇÃO DO CARTÃO, não da Asaas em geral: a
  // cobrança PIX precisa só de nome + CPF. Pedir endereço no PIX seria
  // inventar uma barreira que o gateway não impõe.
  const needsAddressInfo = method === "credit_card" && (requirements?.needsAddressInfo ?? false)
  const needsAnything = needsPayerInfo || needsAddressInfo
  const checked = requirements != null

  useEffect(() => {
    // Visitante não tem perfil para consultar, e o GET responderia 401 — a
    // checagem de dados de cobrança só faz sentido depois do login.
    if (!open || !subscriptionEnabled || isGuest || authLoading) return
    setRequirements(null)
    setFormOpen(false)
    setPixPayment(null)
    setPixPending(null)
    // O plano volta ao mensal a cada abertura: uma escolha de "anual" deixada
    // de uma sessão anterior do modal levaria a pessoa a confirmar R$ 89,90
    // achando que estava no fluxo que ela conhece.
    setBillingPeriod("monthly")
    let cancelled = false
    fetch("/api/vip/subscribe")
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (
          data: {
            hasPayerInfo?: boolean
            hasCompleteAddressInfo?: boolean
            payer?: { fullName?: string | null; cpf?: string | null }
          } | null
        ) => {
          if (cancelled) return
          // Falha na checagem não deve bloquear a assinatura: o POST valida de
          // novo e, se realmente faltar dado, devolve o erro.
          if (!data) {
            setRequirements({ needsPayerInfo: false, needsAddressInfo: false })
            return
          }
          // Pré-preenche o que já existe: quem só não tem CPF confirma o nome
          // em vez de redigitá-lo.
          if (data.payer?.fullName) setGuestName(data.payer.fullName)
          if (data.payer?.cpf) setGuestDocument(formatCpfInput(data.payer.cpf))
          setRequirements({
            needsPayerInfo: !data.hasPayerInfo,
            needsAddressInfo: !data.hasCompleteAddressInfo,
          })
        }
      )
      .catch(() => {
        if (!cancelled) setRequirements({ needsPayerInfo: false, needsAddressInfo: false })
      })
    return () => {
      cancelled = true
    }
  }, [open, subscriptionEnabled, isGuest, authLoading])

  function handleMethodChange(next: "pix" | "credit_card") {
    setMethod(next)
    // Trocar para PIX com o formulário aberto só por causa do endereço
    // deixaria uma coluna de campos que não são mais exigidos. Se ainda
    // faltar nome/CPF o formulário continua aberto — só encolhe.
    if (next === "pix" && !(requirements?.needsPayerInfo ?? false)) {
      setFormOpen(false)
    }
  }

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

  function handleSubscribeClick() {
    // Rede de segurança: a interface de visitante já não mostra este botão
    // (ver `GuestActions`), mas um clique que escape enquanto a sessão ainda
    // não foi confirmada deve virar o convite a entrar, nunca o 401 do
    // servidor traduzido em toast vermelho.
    if (isGuest) return
    if (needsAnything && !formOpen) {
      setFormOpen(true)
      requestAnimationFrame(() => firstFieldRef.current?.focus())
      return
    }
    handleSubscribe()
  }

  async function handleSubscribe() {
    if (needsPayerInfo && (!guestName.trim() || guestDocument.replace(/\D/g, "").length !== 11)) {
      toast.error("Preencha nome completo e CPF.")
      return
    }
    if (
      needsAddressInfo &&
      (!guestPhone || !guestPostalCode || !guestStreet || !guestNumber || !guestNeighborhood || !guestCity || !guestState)
    ) {
      toast.error("Preencha todos os campos obrigatórios de cobrança.")
      return
    }

    setSubscribing(true)
    try {
      const res = await fetch("/api/vip/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMethod: method,
          billingPeriod,
          ...(needsPayerInfo
            ? { guestName: guestName.trim(), guestDocument: guestDocument.replace(/\D/g, "") }
            : {}),
          ...(needsAddressInfo
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
        ok?: boolean
        error?: string
        checkoutUrl?: string
        code?: string
        manageUrl?: string | null
        paymentMethod?: "pix" | "credit_card"
        pending?: boolean
        message?: string
        payment?: VipPixPayment
        reactivated?: boolean
        chargedNow?: boolean
        nextChargeAt?: string
      }

      // REATIVAÇÃO no PIX: não há QR nenhum — a 1ª cobrança foi agendada para
      // o fim do período já pago. Só confirma e fecha; ficar na tela de
      // pagamento pediria ao usuário que pagasse algo que não existe.
      if (res.ok && data.ok && data.reactivated && data.chargedNow === false && !data.checkoutUrl) {
        onSubscribeStarted?.()
        toast.success("Assinatura reativada", {
          description: accessUntil
            ? `Nenhuma cobrança agora. Seu VIP segue até ${accessUntil} e a cobrança de ${formatBrlCents(selectedPlan.priceCents)}${selectedPlan.unitLabel} volta a valer a partir dessa data.`
            : `Nenhuma cobrança agora. A cobrança de ${formatBrlCents(selectedPlan.priceCents)}${selectedPlan.unitLabel} volta a valer no fim do período já pago.`,
        })
        setSubscribing(false)
        onOpenChange(false)
        return
      }

      // PIX: não há página hospedada para onde ir — a assinatura já existe e
      // o QR do 1º mês vem nesta resposta. O modal vira a tela de pagamento.
      if (res.ok && data.ok && data.paymentMethod === "pix") {
        onSubscribeStarted?.()
        if (data.payment) {
          setPixPayment(data.payment)
        } else {
          setPixPending(data.message ?? "Assinatura criada. A cobrança aparecerá em instantes.")
        }
        setSubscribing(false)
        return
      }

      if (!res.ok || !data.ok || !data.checkoutUrl) {
        // Já existe assinatura viva na Asaas: em vez de um toast vermelho sem
        // saída, manda o usuário para onde ele consegue de fato agir sobre ela.
        if (data.manageUrl) {
          const isPendingPix = data.code === "subscription_pending_pix"
          // Checkout de cartão em aberto ainda NÃO é assinatura (ela só nasce
          // no 1º pagamento), então dizer "você já tem uma assinatura" seria
          // falso — e esconderia a ação real: retomar o pagamento ou desistir.
          const isPendingCheckout = data.code === "subscription_already_pending"
          toast.error(
            isPendingPix || isPendingCheckout ? "Pagamento pendente" : "Você já tem uma assinatura",
            {
            description: data.error ?? "Gerencie sua assinatura nas configurações da conta.",
            action: {
              label: isPendingPix ? "Pagar agora" : isPendingCheckout ? "Ver checkout" : "Gerenciar",
              onClick: () => {
                window.location.href = data.manageUrl as string
              },
            },
            }
          )
          setSubscribing(false)
          return
        }
        // Um 400 de validação com o formulário fechado significa que o perfil
        // tem menos dado do que o GET indicou — abre o formulário em vez de
        // deixar o usuário preso num toast que ele não tem como resolver.
        if (res.status === 400 && !formOpen) {
          setRequirements({ needsPayerInfo: true, needsAddressInfo: true })
          setFormOpen(true)
          requestAnimationFrame(() => firstFieldRef.current?.focus())
        }
        throw new Error(data.error ?? "Erro ao iniciar assinatura")
      }
      onSubscribeStarted?.()
      window.location.href = data.checkoutUrl
    } catch (err) {
      const message = err instanceof Error ? err.message : "Erro ao iniciar assinatura"
      toast.error("Erro ao assinar VIP", { description: message })
      setSubscribing(false)
    }
  }

  async function handlePurchaseWithAura() {
    if (!onPurchaseWithAura) return
    setPurchasingWithAura(true)
    try {
      await onPurchaseWithAura()
      onOpenChange(false)
    } finally {
      setPurchasingWithAura(false)
    }
  }

  const inputClass = "h-9 border-border/70 bg-background/60 text-sm"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        Duas colunas a partir de `sm`: vantagens à esquerda (coluna fixa com o
        preço), cobrança + ações à direita. Antes tudo era uma coluna de
        `max-w-sm`, o que espremia 9 campos de endereço numa faixa estreita e
        obrigava a rolar o modal inteiro para chegar no botão.
      */}
      <DialogContent
        showCloseButton
        className={`gap-0 overflow-hidden p-0 sm:max-w-md ${
          formOpen && needsAnything ? "sm:max-w-3xl" : ""
        } transition-[max-width] duration-300 ease-out`}
      >
        {/* Assinatura PIX criada: o modal deixa de ser oferta e vira a tela
            de pagamento. Sair daqui sem pagar não gera cobrança — mas a
            assinatura existe, e a aba "Assinatura" da conta permite cancelar. */}
        {pixPayment || pixPending ? (
          <div className="space-y-4 p-5 sm:p-6">
            <DialogHeader className="space-y-2 text-left">
              <div className="flex items-center gap-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "var(--vip-accent-soft)" }}
                >
                  <QrCode className="size-6" style={{ color: "var(--vip-accent)" }} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="text-lg leading-tight">Assinatura criada</DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    Pague a primeira cobrança para liberar o VIP
                  </p>
                </div>
              </div>
              <DialogDescription className="text-xs leading-relaxed">
                {billingPeriod === "yearly"
                  ? "A cada 12 meses a Asaas gera uma nova cobrança PIX, que aparece nas configurações da sua conta. Você pode cancelar quando quiser — nenhuma cobrança futura é feita depois disso."
                  : "A cada mês a Asaas gera uma nova cobrança PIX, que aparece nas configurações da sua conta. Você pode cancelar quando quiser — nenhuma cobrança futura é feita depois disso."}
              </DialogDescription>
            </DialogHeader>

            {pixPayment ? (
              <VipPixCharge payment={pixPayment} isFirstCharge />
            ) : (
              <p className="rounded-xl border border-border/70 bg-background/40 p-4 text-sm text-muted-foreground">
                {pixPending}
              </p>
            )}

            <Link
              href="/conta#assinatura"
              onClick={() => onOpenChange(false)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--vip-accent-soft)]"
              style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
            >
              Ver minha assinatura
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        ) : (
        <div className={`grid ${formOpen && needsAnything ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]" : ""}`}>
          {/* Coluna 1 — a oferta */}
          <div
            className="relative flex flex-col gap-4 p-5 sm:p-6"
            style={{
              background:
                "radial-gradient(120% 80% at 0% 0%, var(--vip-accent-soft), transparent 60%)",
            }}
          >
            <DialogHeader className="space-y-3 text-left">
              <div className="flex items-center gap-3">
                <div
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: "var(--vip-accent-soft)" }}
                >
                  <Crown className="size-6 vip-badge-crown" style={{ color: "var(--vip-accent)" }} />
                </div>
                <div className="min-w-0">
                  <DialogTitle className="vip-badge-text text-lg leading-tight">
                    {isResubscribe ? "Reativar assinatura" : "Vantagens do VIP"}
                  </DialogTitle>
                  {/* Acompanha o plano selecionado: com o anual marcado, um
                      "R$ 8,90/mês" fixo aqui contradiria o botão de confirmar
                      logo abaixo, que cobra R$ 89,90.

                      O visitante não tem seletor de plano (ele só aparece
                      depois do login), então aqui cita os DOIS preços: citar
                      só o mensal esconderia o anual de quem ainda está
                      decidindo se vale a pena criar conta. */}
                  <p className="text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">
                      {formatBrlCents(isGuest ? VIP_PLANS.monthly.priceCents : selectedPlan.priceCents)}
                    </span>
                    {isGuest ? VIP_PLANS.monthly.unitLabel : selectedPlan.unitLabel}
                    {isGuest ? (
                      <>
                        {" ou "}
                        <span className="font-bold text-foreground">
                          {formatBrlCents(VIP_PLANS.yearly.priceCents)}
                        </span>
                        {VIP_PLANS.yearly.unitLabel}
                      </>
                    ) : null}
                    {" · cancele quando quiser"}
                  </p>
                </div>
              </div>

              <DialogDescription className="text-sm leading-relaxed">
                {/* Reativar NÃO cobra nada: a 1ª cobrança da assinatura é
                    agendada para o fim do período que já foi pago. O texto
                    anterior ("o mês que você pagar agora é somado ao que já
                    resta") descrevia o comportamento antigo, em que reativar
                    gerava cobrança imediata — o bug que esta tela corrige. */}
                {isResubscribe
                  ? accessUntil
                    ? `Nenhuma cobrança agora: seu VIP já está pago até ${accessUntil}. Reativar só religa a assinatura, que volta a ser cobrada a partir dessa data.`
                    : "Nenhuma cobrança agora: o período atual já está pago. Reativar só religa a assinatura, que volta a ser cobrada quando ele terminar."
                  : VIP_SUPPORT_MESSAGE}
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-2">
              {vipSubscriptionBenefits().map((benefit, i) => {
                // O primeiro item é o "carro-chefe" — ganha caixa destacada +
                // selo pra puxar o olho antes dos outros, que só têm o check.
                // Qual é ele sai da própria ordem da lista, não de uma
                // constante: com a janela de Fundador aberta o destaque é dela.
                const isFeatured = i === 0
                return (
                  <li
                    key={benefit}
                    className={
                      isFeatured
                        ? "flex items-start gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold leading-relaxed text-foreground"
                        : "flex items-start gap-2 text-xs leading-relaxed text-foreground"
                    }
                    style={
                      isFeatured
                        ? { borderColor: "var(--vip-accent-soft)", backgroundColor: "var(--vip-accent-soft)" }
                        : undefined
                    }
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--vip-accent)" }} />
                    <span>{benefit}</span>
                    {isFeatured && (
                      <span
                        className="ml-auto shrink-0 self-center rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-black"
                        style={{ backgroundColor: "var(--vip-accent)" }}
                      >
                        Exclusivo
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>

            {/* Ações ficam nesta coluna enquanto o formulário está fechado; com
                ele aberto, migram para o rodapé da coluna 2 (junto dos campos). */}
            {!(formOpen && needsAnything) && (
              <div className="mt-auto space-y-2 pt-2">
                <SubscribeActions />
              </div>
            )}
          </div>

          {/* Coluna 2 — cobrança. Só existe com o formulário aberto. */}
          {formOpen && needsAnything && (
            <div className="flex flex-col border-t bg-muted/20 p-5 sm:border-t-0 sm:border-l sm:p-6">
              <div className="mb-4 flex items-start gap-2">
                <Lock className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-bold text-foreground">Dados de cobrança</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {method === "pix"
                      ? "O CPF identifica o pagador da cobrança PIX. Fica salvo no seu perfil — você só preenche uma vez."
                      : "Exigidos pela operadora para cobrar no cartão. Ficam salvos no seu perfil — você só preenche uma vez."}
                  </p>
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto sm:max-h-[52vh] sm:pr-1">
                {needsPayerInfo && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Nome completo *</Label>
                      <Input
                        ref={firstFieldRef}
                        required
                        minLength={2}
                        maxLength={200}
                        value={guestName}
                        onChange={(e) => setGuestName(e.target.value)}
                        placeholder="Como está no documento"
                        className={inputClass}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">CPF *</Label>
                      <Input
                        required
                        inputMode="numeric"
                        value={guestDocument}
                        onChange={(e) => setGuestDocument(formatCpfInput(e.target.value))}
                        placeholder="000.000.000-00"
                        maxLength={14}
                        className={inputClass}
                      />
                    </div>
                  </>
                )}

                {needsAddressInfo && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Telefone *</Label>
                      <Input
                        ref={needsPayerInfo ? undefined : firstFieldRef}
                        required
                        inputMode="numeric"
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(formatPhoneInput(e.target.value))}
                        placeholder="(00) 00000-0000"
                        maxLength={15}
                        className={inputClass}
                      />
                    </div>

                    <div className="grid grid-cols-[1.4fr_1fr] gap-2.5">
                      <div className="space-y-1.5">
                        <Label className="text-xs">CEP *</Label>
                        <div className="relative">
                          <Input
                            required
                            inputMode="numeric"
                            value={guestPostalCode}
                            onChange={(e) => handleCepChange(e.target.value)}
                            placeholder="00000-000"
                            maxLength={9}
                            className={inputClass}
                          />
                          {cepLoading && (
                            <Loader2 className="absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                          )}
                        </div>
                        {cepError && <p className="text-[10px] text-red-400">{cepError}</p>}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Número *</Label>
                        <Input
                          required
                          maxLength={20}
                          value={guestNumber}
                          onChange={(e) => setGuestNumber(e.target.value)}
                          placeholder="123"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Endereço *</Label>
                      <Input
                        required
                        maxLength={200}
                        value={guestStreet}
                        onChange={(e) => setGuestStreet(e.target.value)}
                        placeholder="Rua, avenida..."
                        className={inputClass}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Complemento</Label>
                        <Input
                          maxLength={100}
                          value={guestComplement}
                          onChange={(e) => setGuestComplement(e.target.value)}
                          placeholder="Apto, bloco..."
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Bairro *</Label>
                        <Input
                          required
                          maxLength={100}
                          value={guestNeighborhood}
                          onChange={(e) => setGuestNeighborhood(e.target.value)}
                          placeholder="Seu bairro"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-[1fr_5.5rem] gap-2.5">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Cidade *</Label>
                        <Input
                          required
                          maxLength={100}
                          value={guestCity}
                          onChange={(e) => setGuestCity(e.target.value)}
                          placeholder="Sua cidade"
                          className={inputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">UF *</Label>
                        <Select value={guestState} onValueChange={setGuestState} required>
                          <SelectTrigger className="h-9 w-full border-border/70 bg-background/60 text-sm">
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
                  </>
                )}
              </div>

              <div className="mt-4 space-y-2 border-t pt-4">
                <SubscribeActions />
                {method === "credit_card" && (
                  <p className="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground/70">
                    <ShieldCheck className="size-3" />
                    Os dados do cartão são digitados na página segura da Asaas.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        )}
      </DialogContent>
    </Dialog>
  )

  /** Um cartão de escolha de método (PIX ou cartão). */
  function MethodOption({
    value,
    icon,
    label,
    hint,
  }: {
    value: "pix" | "credit_card"
    icon: React.ReactNode
    label: string
    hint: string
  }) {
    const selected = method === value
    return (
      <button
        type="button"
        onClick={() => handleMethodChange(value)}
        disabled={subscribing || purchasingWithAura}
        aria-pressed={selected}
        className={`flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          selected ? "bg-[var(--vip-accent-soft)]" : "border-border/70 hover:bg-muted/40"
        }`}
        style={selected ? { borderColor: "var(--vip-accent)" } : undefined}
      >
        <span
          className="flex items-center gap-1.5 text-sm font-bold"
          style={{ color: selected ? "var(--vip-accent)" : undefined }}
        >
          {icon}
          {label}
        </span>
        <span className="text-[10px] text-muted-foreground">{hint}</span>
      </button>
    )
  }

  /**
   * Escolha do plano. Só aparece numa assinatura NOVA: na reativação o plano
   * também pode ser trocado, mas aí o card já explica que nada é cobrado agora
   * e a troca é oferecida junto — ver `PlanOption` abaixo, que é usada nos dois
   * casos com textos diferentes.
   */
  function PlanOption({ period }: { period: VipBillingPeriod }) {
    const plan = VIP_PLANS[period]
    const selected = billingPeriod === period
    const savings = vipYearlySavingsPercent()
    return (
      <button
        type="button"
        onClick={() => setBillingPeriod(period)}
        disabled={subscribing || purchasingWithAura}
        aria-pressed={selected}
        className={`relative flex flex-col items-start gap-0.5 rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          selected ? "bg-[var(--vip-accent-soft)]" : "border-border/70 hover:bg-muted/40"
        }`}
        style={selected ? { borderColor: "var(--vip-accent)" } : undefined}
      >
        {/* Selo de economia derivado do catálogo: se um reajuste tornar o anual
            igual ou pior que 12 mensais, `vipYearlySavingsPercent` devolve 0 e
            o selo desaparece em vez de mentir. */}
        {period === "yearly" && savings > 0 && (
          <span
            className="absolute -top-2 right-2 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-black"
            style={{ backgroundColor: "var(--vip-accent)" }}
          >
            -{savings}%
          </span>
        )}
        <span
          className="text-sm font-bold"
          style={{ color: selected ? "var(--vip-accent)" : undefined }}
        >
          {plan.label}
        </span>
        <span className="text-[11px] font-semibold text-foreground">
          {formatBrlCents(plan.priceCents)}
          <span className="font-normal text-muted-foreground">{plan.unitLabel}</span>
        </span>
        <span className="text-[10px] text-muted-foreground">
          {period === "yearly"
            ? `equivale a ${formatBrlCents(vipYearlyMonthlyEquivalentCents())}/mês`
            : "cancele quando quiser"}
        </span>
      </button>
    )
  }

  /**
   * O que um visitante deslogado vê no lugar de plano, método e do botão de
   * cobrança: a oferta continua inteira (é ela que convence), mas as ações que
   * exigem sessão saem de cena e dão lugar aos dois caminhos de entrada.
   *
   * Os botões abrem o MESMO modal de login/cadastro do resto do site
   * (`useAuthModal`), nunca uma tela própria — ver components/auth/AuthModal.
   * Antes de abrir, guardam a intenção: terminado o login, o
   * `VipIntentWatcher` do layout traz este popup de volta, já no modo de quem
   * tem sessão, para a pessoa seguir de onde parou.
   */
  function GuestActions() {
    function startAuth(open: (next?: string) => void) {
      rememberVipIntent()
      // `next` só é usado pelo OAuth (que sai do site e precisa saber para
      // onde voltar). O login por e-mail resolve na própria página, sem
      // navegar. Em ambos os casos o popup do VIP é reaberto pelo watcher, não
      // por esta rota.
      open(typeof window !== "undefined" ? window.location.pathname : undefined)
      // Fecha a oferta para o modal de login não abrir por cima dela; o
      // watcher reabre depois, com a sessão já valendo.
      onOpenChange(false)
    }

    // Fragmento, não um wrapper próprio: o espaçamento já vem do bloco que
    // chama `SubscribeActions`.
    return (
      <>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Entre na sua conta para assinar. Você volta direto para cá.
        </p>
        <button
          type="button"
          onClick={() => startAuth(openLogin)}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90"
          style={{ backgroundColor: "var(--vip-accent)" }}
        >
          Entrar
          <ArrowRight className="size-4" />
        </button>
        <button
          type="button"
          onClick={() => startAuth(openRegister)}
          className="flex w-full items-center justify-center rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--vip-accent-soft)]"
          style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
        >
          Criar conta
        </button>
      </>
    )
  }

  /**
   * Botões de ação — renderizados na coluna da oferta enquanto o formulário
   * está fechado e no rodapé da coluna de cobrança quando ele abre, para o
   * CTA ficar sempre ao lado do que a pessoa acabou de preencher.
   */
  function SubscribeActions() {
    // Sem sessão não há o que escolher: plano, método e o botão de cobrar
    // dependem todos de um perfil. Trocar o bloco inteiro (em vez de
    // desabilitar os controles) é o que evita a tela do bug — a pessoa
    // configurando uma compra que o servidor vai recusar.
    if (isGuest) return <GuestActions />

    return (
      <>
        {subscriptionEnabled && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Plano
            </p>
            <div className="grid grid-cols-2 gap-2">
              <PlanOption period="monthly" />
              <PlanOption period="yearly" />
            </div>
            {/* Na reativação a troca de plano é permitida e não antecipa
                cobrança nenhuma: a 1ª cobrança do plano novo vence no fim do
                período que o plano antigo já pagou. Dizer isso aqui evita que
                a pessoa evite o anual por medo de ser cobrada duas vezes. */}
            <p className="text-[10px] leading-relaxed text-muted-foreground/70">
              {isResubscribe
                ? billingPeriod === "yearly"
                  ? accessUntil
                    ? `Você pode reativar já no plano anual: nada é cobrado agora, e a primeira cobrança de ${formatBrlCents(selectedPlan.priceCents)} vence em ${accessUntil}.`
                    : "Você pode reativar já no plano anual: nada é cobrado agora, e a primeira cobrança vence no fim do período já pago."
                  : "Nada é cobrado agora — a mensalidade volta a valer no fim do período já pago."
                : billingPeriod === "yearly"
                  ? `Uma cobrança de ${formatBrlCents(selectedPlan.priceCents)} por 12 meses de VIP, renovada a cada ano.`
                  : `Uma cobrança de ${formatBrlCents(selectedPlan.priceCents)} por mês, renovada a cada mês.`}
            </p>
          </div>
        )}

        {subscriptionEnabled && (
          <div className="space-y-1.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
              Como pagar
            </p>
            <div className="grid grid-cols-2 gap-2">
              <MethodOption
                value="pix"
                icon={<QrCode className="size-4" />}
                label="PIX"
                hint={billingPeriod === "yearly" ? "QR todo ano" : "QR todo mês"}
              />
              <MethodOption
                value="credit_card"
                icon={<CreditCard className="size-4" />}
                label="Cartão"
                hint="Renova sozinho"
              />
            </div>
            <p className="text-[10px] leading-relaxed text-muted-foreground/70">
              {method === "pix"
                ? billingPeriod === "yearly"
                  ? "A cada ano geramos um novo QR para você pagar. Sem cartão, sem endereço."
                  : "A cada mês geramos um novo QR para você pagar. Sem cartão, sem endereço."
                : billingPeriod === "yearly"
                  ? "Cobrança automática no cartão a cada 12 meses. Exige telefone e endereço de cobrança."
                  : "Cobrança automática no cartão todo mês. Exige telefone e endereço de cobrança."}
            </p>
          </div>
        )}

        {subscriptionEnabled ? (
          <button
            type="button"
            onClick={handleSubscribeClick}
            disabled={subscribing || purchasingWithAura || !checked}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ backgroundColor: "var(--vip-accent)" }}
          >
            {subscribing && <Loader2 className="size-4 animate-spin" />}
            {/* Na REATIVAÇÃO nenhum rótulo pode citar um valor a pagar agora:
                não há cobrança no ato, nem QR para gerar. "Reativar
                assinatura" é a ação inteira — inclusive no PIX, onde o botão
                deixou de gerar QR nesse caso. */}
            {isResubscribe ? (
              needsAnything && !formOpen ? (
                <>
                  Reativar assinatura
                  <ArrowRight className="size-4" />
                </>
              ) : (
                "Reativar assinatura"
              )
            ) : needsAnything && !formOpen ? (
              <>
                Assinar por {formatBrlCents(selectedPlan.priceCents)}
                {selectedPlan.unitLabel}
                <ArrowRight className="size-4" />
              </>
            ) : method === "pix" ? (
              // No PIX o botão não conclui a compra — gera o QR da 1ª
              // cobrança. Prometer "confirmar assinatura" aqui faria o usuário
              // achar que já pagou e fechar o modal antes de ler o código.
              `Gerar PIX de ${formatBrlCents(selectedPlan.priceCents)}`
            ) : (
              `Confirmar assinatura · ${formatBrlCents(selectedPlan.priceCents)}${selectedPlan.unitLabel}`
            )}
          </button>
        ) : (
          // Assinatura paga desligada: sem uma saída aqui o modal vira beco
          // sem saída para quem abriu por um CTA de "Seja VIP". Ativar com
          // Aura continua valendo (não envolve cobrança), então mandamos
          // para a Central — onde a `VipMonthCard` faz o resgate.
          <div className="space-y-2 rounded-lg border border-dashed px-4 py-3 text-center">
            <p className="text-xs text-muted-foreground">
              A assinatura paga está temporariamente indisponível; dá para ativar o VIP resgatando Aura.
            </p>
            <Link
              href="/aura"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1.5 text-xs font-bold transition-opacity hover:opacity-80"
              style={{ color: "var(--vip-accent)" }}
            >
              Ativar com Aura
              <ArrowRight className="size-3.5" />
            </Link>
          </div>
        )}

        {onPurchaseWithAura && auraCost != null && (
          <button
            type="button"
            onClick={handlePurchaseWithAura}
            disabled={subscribing || purchasingWithAura}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border px-4 py-2.5 text-sm font-bold transition-colors hover:bg-[var(--vip-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
            style={{ borderColor: "var(--vip-accent-soft)", color: "var(--vip-accent)" }}
          >
            {purchasingWithAura && <Loader2 className="size-4 animate-spin" />}
            Ativar com {auraCost.toLocaleString("pt-BR")} de Aura
          </button>
        )}
      </>
    )
  }
}
