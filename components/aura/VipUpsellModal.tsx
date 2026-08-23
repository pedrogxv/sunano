"use client"

import { useEffect, useRef, useState } from "react"
import { Crown, Check, ChevronDown, Loader2 } from "lucide-react"
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

interface VipUpsellModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Aura disponível para o botão "Ativar com Aura" — omitido esconde essa opção (ex.: usuário deslogado). */
  auraCost?: number
  onPurchaseWithAura?: () => Promise<void>
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

/** Modal "Vantagens do VIP" — banner explicativo com as vantagens e os dois caminhos de ativação (Aura ou assinatura). */
export function VipUpsellModal({ open, onOpenChange, auraCost, onPurchaseWithAura }: VipUpsellModalProps) {
  const subscriptionEnabled = isVipSubscriptionEnabled()
  const [subscribing, setSubscribing] = useState(false)
  const [purchasingWithAura, setPurchasingWithAura] = useState(false)

  const [needsAddressInfo, setNeedsAddressInfo] = useState(false)
  const [addressChecked, setAddressChecked] = useState(false)
  const [addressFormOpen, setAddressFormOpen] = useState(false)
  const phoneInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!open || !subscriptionEnabled) return
    setAddressChecked(false)
    setAddressFormOpen(false)
    let cancelled = false
    fetch("/api/vip/subscribe")
      .then((res) => (res.ok ? res.json() : { hasCompleteAddressInfo: true }))
      .then((data: { hasCompleteAddressInfo?: boolean }) => {
        if (cancelled) return
        setNeedsAddressInfo(!data.hasCompleteAddressInfo)
      })
      .catch(() => {
        // Falha na checagem não deve bloquear a assinatura: o POST valida de
        // novo e, se realmente faltar dado, devolve o erro.
      })
      .finally(() => {
        if (!cancelled) setAddressChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, subscriptionEnabled])

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
    if (needsAddressInfo && !addressFormOpen) {
      setAddressFormOpen(true)
      requestAnimationFrame(() => phoneInputRef.current?.focus())
      return
    }
    handleSubscribe()
  }

  async function handleSubscribe() {
    if (needsAddressInfo) {
      if (!guestPhone || !guestPostalCode || !guestStreet || !guestNumber || !guestNeighborhood || !guestCity || !guestState) {
        toast.error("Preencha todos os campos obrigatórios de cobrança.")
        return
      }
    }
    setSubscribing(true)
    try {
      const res = await fetch("/api/vip/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          needsAddressInfo
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
            : {}
        ),
      })
      const data = (await res.json()) as { ok?: boolean; error?: string; checkoutUrl?: string }
      if (!res.ok || !data.ok || !data.checkoutUrl) {
        throw new Error(data.error ?? "Erro ao iniciar assinatura")
      }
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <div className="mx-auto flex size-14 items-center justify-center rounded-full" style={{ backgroundColor: "var(--vip-accent-soft)" }}>
            <Crown className="size-7 vip-badge-crown" style={{ color: "var(--vip-accent)" }} />
          </div>
          <DialogTitle className="text-center vip-badge-text text-xl">Vantagens do VIP</DialogTitle>
          <DialogDescription className="text-center">{VIP_SUPPORT_MESSAGE}</DialogDescription>
        </DialogHeader>

        <ul className="space-y-2.5 py-2">
          {VIP_SUBSCRIPTION_BENEFITS.map((benefit) => (
            <li key={benefit} className="flex items-start gap-2 text-sm text-foreground">
              <Check className="mt-0.5 size-4 shrink-0" style={{ color: "var(--vip-accent)" }} />
              <span>{benefit}</span>
            </li>
          ))}
        </ul>

        {addressChecked && needsAddressInfo && (
          <div
            className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${
              addressFormOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="overflow-hidden">
              <div className="space-y-4 rounded-xl border p-4">
                <p className="text-xs text-muted-foreground">
                  Pagamento com cartão exige telefone e endereço de cobrança. Eles ficam salvos no seu perfil.
                </p>

                <div className="space-y-2">
                  <Label>Telefone *</Label>
                  <Input
                    ref={phoneInputRef}
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
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2">
          {subscriptionEnabled ? (
            <button
              type="button"
              onClick={handleSubscribeClick}
              disabled={subscribing || purchasingWithAura || !addressChecked}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-bold text-black transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ backgroundColor: "var(--vip-accent)" }}
            >
              {subscribing && <Loader2 className="size-4 animate-spin" />}
              {needsAddressInfo && !addressFormOpen ? (
                <>
                  Assinar por {formatVipPrice()}/mês
                  <ChevronDown className="size-4" />
                </>
              ) : (
                `Confirmar assinatura · ${formatVipPrice()}/mês`
              )}
            </button>
          ) : (
            <p className="rounded-lg border border-dashed px-4 py-2.5 text-center text-xs text-muted-foreground">
              Assinatura paga temporariamente indisponível.
            </p>
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
        </div>
      </DialogContent>
    </Dialog>
  )
}
