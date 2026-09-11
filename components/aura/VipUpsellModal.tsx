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
import { VIP_SUBSCRIPTION_BENEFITS, VIP_SUPPORT_MESSAGE, formatVipPrice } from "@/lib/vip-plan"
import { isVipSubscriptionEnabled } from "@/lib/vip-signup"
import { VipPixCharge, type VipPixPayment } from "@/components/account/VipPixCharge"

interface VipUpsellModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Aura disponível para o botão "Ativar com Aura" — omitido esconde essa opção (ex.: usuário deslogado). */
  auraCost?: number
  onPurchaseWithAura?: () => Promise<void>
  /**
   * Reassinatura de quem cancelou e ainda está dentro do período já pago.
   * Só muda o texto — o POST /api/vip/subscribe é o mesmo e já trata esse
   * caso (`isResubscribeWithinPaidPeriod`), cobrando 1 mês que é SOMADO ao
   * saldo restante em vez de substituí-lo.
   */
  mode?: "subscribe" | "resubscribe"
  /** VIP atual (dd/mm/aaaa) — mostrado no modo `resubscribe` para deixar claro que nada é perdido. */
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
  mode = "subscribe",
  currentAccessUntil,
  onSubscribeStarted,
}: VipUpsellModalProps) {
  const isResubscribe = mode === "resubscribe"
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
    if (!open || !subscriptionEnabled) return
    setRequirements(null)
    setFormOpen(false)
    setPixPayment(null)
    setPixPending(null)
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
  }, [open, subscriptionEnabled])

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
          toast.error(isPendingPix ? "Pagamento pendente" : "Você já tem uma assinatura", {
            description: data.error ?? "Gerencie sua assinatura nas configurações da conta.",
            action: {
              label: isPendingPix ? "Pagar agora" : "Gerenciar",
              onClick: () => {
                window.location.href = data.manageUrl as string
              },
            },
          })
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
                    Pague o primeiro mês para liberar o VIP
                  </p>
                </div>
              </div>
              <DialogDescription className="text-xs leading-relaxed">
                A cada mês a Asaas gera uma nova cobrança PIX, que aparece nas configurações da sua
                conta. Você pode cancelar quando quiser — nenhuma cobrança futura é feita depois disso.
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
                    {isResubscribe ? "Voltar a assinar" : "Vantagens do VIP"}
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground">
                    <span className="font-bold text-foreground">{formatVipPrice()}</span>/mês · cancele quando quiser
                  </p>
                </div>
              </div>

              <DialogDescription className="text-xs leading-relaxed">
                {isResubscribe
                  ? currentAccessUntil
                    ? `Seu VIP atual vale até ${currentAccessUntil} e nada disso é perdido: o mês que você pagar agora é somado ao que já resta, e a cobrança mensal só volta a partir daí.`
                    : "O período que você já pagou não é perdido: o mês que você pagar agora é somado ao que já resta, e a cobrança mensal só volta a partir daí."
                  : VIP_SUPPORT_MESSAGE}
              </DialogDescription>
            </DialogHeader>

            <ul className="space-y-2">
              {VIP_SUBSCRIPTION_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-start gap-2 text-xs leading-relaxed text-foreground">
                  <Check className="mt-0.5 size-3.5 shrink-0" style={{ color: "var(--vip-accent)" }} />
                  <span>{benefit}</span>
                </li>
              ))}
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
   * Botões de ação — renderizados na coluna da oferta enquanto o formulário
   * está fechado e no rodapé da coluna de cobrança quando ele abre, para o
   * CTA ficar sempre ao lado do que a pessoa acabou de preencher.
   */
  function SubscribeActions() {
    return (
      <>
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
                hint="QR todo mês"
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
                ? "Assinatura mensal: a cada mês geramos um novo QR para você pagar. Sem cartão, sem endereço."
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
            {needsAnything && !formOpen ? (
              <>
                {isResubscribe ? "Voltar a assinar" : "Assinar"} por {formatVipPrice()}/mês
                <ArrowRight className="size-4" />
              </>
            ) : method === "pix" ? (
              // No PIX o botão não conclui a compra — gera o QR do 1º mês.
              // Prometer "confirmar assinatura" aqui faria o usuário achar
              // que já pagou e fechar o modal antes de ler o código.
              `Gerar PIX de ${formatVipPrice()}`
            ) : (
              `Confirmar assinatura · ${formatVipPrice()}/mês`
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
